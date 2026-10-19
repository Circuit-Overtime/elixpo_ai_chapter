use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use reqwest::Client;
use serde_json::{Value, json};
use url::Url;

const MAX_URL_BYTES: usize = 8 * 1024;
const MAX_REDIRECTS: usize = 5;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WebFetchLimits {
    pub timeout: Duration,
    pub max_output_bytes: usize,
}

/// Registers a provider-neutral, public-HTTPS-only page fetcher.
///
/// Every hop is DNS checked and pinned to a public address. Redirects,
/// response bytes, content types, execution time, and cancellation are bounded.
///
/// # Errors
///
/// Returns an error when limits are invalid or the tool cannot be registered.
pub fn register_web_fetch_tool(host: &mut ToolHost, limits: WebFetchLimits) -> Result<()> {
    if limits.timeout.is_zero() || limits.max_output_bytes == 0 {
        bail!("web fetch limits must be positive");
    }
    host.register(
        ToolDescriptor {
            name: "web_fetch".to_owned(),
            description: "Fetch a public HTTPS page as bounded text. Private networks, credentials, downloads, and automatic redirects are blocked. Requires explicit network permission.".to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": {"type": "string", "minLength": 1, "maxLength": MAX_URL_BYTES}
                },
                "required": ["url"],
                "additionalProperties": false
            }),
            risk: RiskClass::NetworkAccess,
            transport: ToolTransport::Native,
        },
        Arc::new(WebFetch { limits }),
    )
}

struct WebFetch {
    limits: WebFetchLimits,
}

impl ToolHandler for WebFetch {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let url = arguments
            .get("url")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|url| !url.is_empty())
            .ok_or_else(|| anyhow!("web fetch URL is required"))?;
        if url.len() > MAX_URL_BYTES {
            bail!("web fetch URL exceeds the byte limit");
        }
        let url = Url::parse(url).context("web fetch URL is invalid")?;
        let limits = self.limits;
        let cancellation = cancellation.clone();
        thread::Builder::new()
            .name("crumb-web-fetch".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .context("failed to start web fetch runtime")?;
                runtime.block_on(WebFetch { limits }.fetch(url, &cancellation))
            })
            .context("failed to start web fetch worker")?
            .join()
            .map_err(|_| anyhow!("web fetch worker failed"))?
    }
}

impl WebFetch {
    async fn fetch(&self, mut url: Url, cancellation: &CancellationToken) -> Result<ToolOutput> {
        for redirects in 0..=MAX_REDIRECTS {
            let (client, resolved) = client_for_url(&url, self.limits.timeout)?;
            let request = client
                .get(url.clone())
                .header(
                    reqwest::header::ACCEPT,
                    "text/html, text/plain, application/json",
                )
                .send();
            let mut response = tokio::select! {
                result = request => result.context("web fetch request failed")?,
                () = cancellation.cancelled() => bail!("web fetch cancelled"),
            };
            if response.status().is_redirection() {
                if redirects == MAX_REDIRECTS {
                    return Ok(ToolOutput::error("web fetch exceeded the redirect limit"));
                }
                let location = response
                    .headers()
                    .get(reqwest::header::LOCATION)
                    .context("web fetch redirect omitted Location")?
                    .to_str()
                    .context("web fetch redirect Location is invalid")?;
                url = url
                    .join(location)
                    .context("web fetch redirect URL is invalid")?;
                continue;
            }
            if !response.status().is_success() {
                return Ok(ToolOutput::error(format!(
                    "web fetch returned HTTP {}",
                    response.status().as_u16()
                )));
            }
            let content_type = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|value| value.to_str().ok())
                .unwrap_or("text/plain")
                .split(';')
                .next()
                .unwrap_or("text/plain")
                .trim()
                .to_ascii_lowercase();
            if !matches!(
                content_type.as_str(),
                "text/html" | "text/plain" | "application/json" | "application/ld+json"
            ) {
                return Ok(ToolOutput::error(format!(
                    "web fetch blocked unsupported content type `{content_type}`"
                )));
            }
            let mut bytes = Vec::new();
            while let Some(chunk) = tokio::select! {
                result = response.chunk() => result.context("web fetch response failed")?,
                () = cancellation.cancelled() => bail!("web fetch cancelled"),
            } {
                let remaining = self.limits.max_output_bytes.saturating_sub(bytes.len());
                if remaining == 0 {
                    break;
                }
                bytes.extend_from_slice(&chunk[..chunk.len().min(remaining)]);
            }
            let decoded = String::from_utf8_lossy(&bytes);
            let text = if content_type == "text/html" {
                html_to_text(&decoded)
            } else {
                decoded.into_owned()
            };
            return Ok(ToolOutput {
                text,
                structured: Some(json!({
                    "url": url.as_str(),
                    "content_type": content_type,
                    "resolved_address": resolved.ip().to_string(),
                    "clipped": bytes.len() == self.limits.max_output_bytes
                })),
                is_error: false,
            });
        }
        unreachable!("redirect loop returns from every bounded branch")
    }
}

fn client_for_url(url: &Url, timeout: Duration) -> Result<(Client, SocketAddr)> {
    if url.scheme() != "https" {
        bail!("web fetch permits HTTPS URLs only");
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("web fetch URL credentials are not allowed");
    }
    let host = url.host_str().context("web fetch URL has no host")?;
    let port = url
        .port_or_known_default()
        .context("web fetch URL has no port")?;
    let resolved = (host, port)
        .to_socket_addrs()
        .context("web fetch host could not be resolved")?
        .find(|address| is_public_ip(address.ip()))
        .context("web fetch host does not resolve to a public address")?;
    let client = Client::builder()
        .timeout(timeout)
        .redirect(reqwest::redirect::Policy::none())
        .resolve(host, resolved)
        .build()
        .context("failed to construct web fetch client")?;
    Ok((client, resolved))
}

fn is_public_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(ip) => {
            let octets = ip.octets();
            !(ip.is_private()
                || ip.is_loopback()
                || ip.is_link_local()
                || ip.is_unspecified()
                || ip.is_multicast()
                || ip.is_broadcast()
                || octets[0] == 0
                || (octets[0] == 100 && (64..=127).contains(&octets[1]))
                || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
                || (octets[0] == 198 && matches!(octets[1], 18 | 19))
                || (octets[0] == 192 && octets[1] == 0 && octets[2] == 2)
                || (octets[0] == 198 && octets[1] == 51 && octets[2] == 100)
                || (octets[0] == 203 && octets[1] == 0 && octets[2] == 113))
        }
        IpAddr::V6(ip) => {
            let segments = ip.segments();
            !(ip.is_loopback()
                || ip.is_unspecified()
                || ip.is_multicast()
                || (segments[0] & 0xfe00) == 0xfc00
                || (segments[0] & 0xffc0) == 0xfe80
                || (segments[0] == 0x2001 && segments[1] == 0x0db8))
        }
    }
}

fn html_to_text(html: &str) -> String {
    let html = remove_tagged_blocks(html, &["script", "style", "noscript", "svg"]);
    let mut text = String::with_capacity(html.len());
    let mut in_tag = false;
    let mut previous_space = false;
    for character in html.chars() {
        match character {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                if !previous_space {
                    text.push(' ');
                    previous_space = true;
                }
            }
            _ if in_tag => {}
            character if character.is_whitespace() => {
                if !previous_space {
                    text.push(' ');
                    previous_space = true;
                }
            }
            character => {
                text.push(character);
                previous_space = false;
            }
        }
    }
    text.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .trim()
        .to_owned()
}

fn remove_tagged_blocks(html: &str, tags: &[&str]) -> String {
    let mut output = html.to_owned();
    for tag in tags {
        loop {
            let lowered = output.to_ascii_lowercase();
            let opening = format!("<{tag}");
            let closing = format!("</{tag}>");
            let Some(start) = lowered.find(&opening) else {
                break;
            };
            let Some(relative_end) = lowered[start..].find(&closing) else {
                output.truncate(start);
                break;
            };
            let end = start
                .saturating_add(relative_end)
                .saturating_add(closing.len());
            output.replace_range(start..end, " ");
        }
    }
    output
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
    use std::time::Duration;

    use crumb_agent::{
        AgentMode, CancellationToken, ConfiguredApprovals, ToolCallErrorKind, ToolHost,
    };
    use serde_json::json;

    use super::{WebFetchLimits, html_to_text, is_public_ip, register_web_fetch_tool};

    #[test]
    fn private_and_metadata_addresses_are_blocked() {
        assert!(!is_public_ip(IpAddr::V4(Ipv4Addr::LOCALHOST)));
        assert!(!is_public_ip(IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254))));
        assert!(!is_public_ip(IpAddr::V6(Ipv6Addr::LOCALHOST)));
        assert!(is_public_ip(IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1))));
    }

    #[test]
    fn html_is_reduced_to_bounded_plain_text() {
        assert_eq!(
            html_to_text("<style>body{display:none}</style><h1>Crumb</h1><p>A &amp; B</p>"),
            "Crumb A & B"
        );
    }

    #[tokio::test]
    async fn web_fetch_is_safe_when_called_from_the_harness_runtime() {
        let mut host = ToolHost::default();
        register_web_fetch_tool(
            &mut host,
            WebFetchLimits {
                timeout: Duration::from_secs(1),
                max_output_bytes: 1024,
            },
        )
        .expect("web fetch registers");
        let approvals = ConfiguredApprovals::new(BTreeSet::from(["web_fetch".to_owned()]));

        let error = host
            .call(
                "web_fetch",
                &json!({"url":"https://127.0.0.1/private"}),
                AgentMode::Auto,
                &approvals,
                &CancellationToken::default(),
            )
            .expect_err("private address is rejected without a nested-runtime panic");

        assert_eq!(error.kind, ToolCallErrorKind::Internal);
    }
}
