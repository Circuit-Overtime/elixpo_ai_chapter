use std::env;
use std::io::Read;
use std::process::{Command, Stdio};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};
use crumb_agent::{
    CancellationToken, RiskClass, ToolDescriptor, ToolHandler, ToolHost, ToolOutput, ToolTransport,
};
use reqwest::{Client, StatusCode};
use serde_json::{Value, json};
use url::Url;

use crate::bounded_text;

const MAX_TARGET_BYTES: usize = 2 * 1024;
const GITHUB_API: &str = "https://api.github.com";
const GH_AUTH_TIMEOUT: Duration = Duration::from_secs(2);

/// Runtime and response limits for the native GitHub issue reader.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct GitHubIssueLimits {
    pub timeout: Duration,
    pub max_output_bytes: usize,
}

/// Registers a bounded reader for GitHub issues and pull requests.
///
/// The tool only calls GitHub's fixed API origin. It can use `GH_TOKEN`,
/// `GITHUB_TOKEN`, or current `gh` CLI authentication without including a
/// credential in tool output.
///
/// # Errors
///
/// Returns an error when limits are invalid or the tool cannot be registered.
pub fn register_github_issue_tool(host: &mut ToolHost, limits: GitHubIssueLimits) -> Result<()> {
    if limits.timeout.is_zero() || limits.max_output_bytes == 0 {
        bail!("GitHub issue limits must be positive");
    }
    host.register(
        ToolDescriptor {
            name: "github_issue".to_owned(),
            description: "Fetch one GitHub issue or pull request from a URL or owner/repo#number. Uses existing GitHub authentication when available and otherwise reads public repositories anonymously. Requires network permission."
                .to_owned(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "target": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": MAX_TARGET_BYTES,
                        "description": "GitHub issue/PR URL or owner/repo#number"
                    }
                },
                "required": ["target"],
                "additionalProperties": false
            }),
            risk: RiskClass::NetworkAccess,
            transport: ToolTransport::Native,
        },
        Arc::new(GitHubIssueTool { limits }),
    )
}

struct GitHubIssueTool {
    limits: GitHubIssueLimits,
}

impl ToolHandler for GitHubIssueTool {
    fn call(&self, arguments: &Value, cancellation: &CancellationToken) -> Result<ToolOutput> {
        let target = arguments
            .get("target")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|target| !target.is_empty())
            .ok_or_else(|| anyhow!("GitHub issue target is required"))?;
        if target.len() > MAX_TARGET_BYTES {
            bail!("GitHub issue target exceeds the byte limit");
        }
        let reference = parse_target(target)?;
        let limits = self.limits;
        let cancellation = cancellation.clone();
        thread::Builder::new()
            .name("crumb-github-issue".to_owned())
            .spawn(move || {
                let runtime = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .context("failed to start GitHub issue runtime")?;
                runtime.block_on(fetch_issue(reference, limits, &cancellation))
            })
            .context("failed to start GitHub issue worker")?
            .join()
            .map_err(|_| anyhow!("GitHub issue worker failed"))?
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct IssueReference {
    owner: String,
    repository: String,
    number: u64,
}

fn parse_target(target: &str) -> Result<IssueReference> {
    let target = target.trim();
    if target.starts_with("https://") || target.starts_with("http://") {
        return parse_url_target(target);
    }
    let (repository, number) = target
        .split_once('#')
        .context("GitHub target must be an issue/PR URL or owner/repo#number")?;
    let (owner, repository) = repository
        .split_once('/')
        .context("GitHub shorthand must use owner/repo#number")?;
    issue_reference(owner, repository, number)
}

fn parse_url_target(target: &str) -> Result<IssueReference> {
    let url = Url::parse(target).context("GitHub issue URL is invalid")?;
    if url.scheme() != "https" || url.host_str() != Some("github.com") {
        bail!("GitHub issue URL must use https://github.com");
    }
    if !url.username().is_empty() || url.password().is_some() {
        bail!("GitHub issue URL credentials are not allowed");
    }
    let segments = url
        .path_segments()
        .context("GitHub issue URL has no path")?
        .collect::<Vec<_>>();
    let [owner, repository, kind, number, ..] = segments.as_slice() else {
        bail!("GitHub URL must identify an issue or pull request");
    };
    if !matches!(*kind, "issues" | "pull") {
        bail!("GitHub URL must identify an issue or pull request");
    }
    issue_reference(owner, repository, number)
}

fn issue_reference(owner: &str, repository: &str, number: &str) -> Result<IssueReference> {
    if !valid_slug(owner) || !valid_slug(repository) {
        bail!("GitHub owner and repository contain invalid characters");
    }
    let number = number
        .parse::<u64>()
        .context("GitHub issue number must be a positive integer")?;
    if number == 0 {
        bail!("GitHub issue number must be positive");
    }
    Ok(IssueReference {
        owner: owner.to_owned(),
        repository: repository.to_owned(),
        number,
    })
}

fn valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 100
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

async fn fetch_issue(
    reference: IssueReference,
    limits: GitHubIssueLimits,
    cancellation: &CancellationToken,
) -> Result<ToolOutput> {
    let token = github_token(cancellation);
    let client = Client::builder()
        .timeout(limits.timeout)
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("crumb-cli")
        .build()
        .context("failed to construct GitHub client")?;
    let url = format!(
        "{GITHUB_API}/repos/{}/{}/issues/{}",
        reference.owner, reference.repository, reference.number
    );
    let mut request = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Some(token) = token.as_deref() {
        request = request.bearer_auth(token);
    }
    let mut response = tokio::select! {
        result = request.send() => result.context("GitHub issue request failed")?,
        () = cancellation.cancelled() => bail!("GitHub issue request cancelled"),
    };
    let status = response.status();
    if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
        return Ok(ToolOutput::error(
            "GitHub authentication failed. Run `gh auth login`, then retry.",
        ));
    }
    if status == StatusCode::NOT_FOUND {
        let message = if token.is_some() {
            "GitHub issue was not found or is not visible to the authenticated account."
        } else {
            "GitHub issue was not found. If it is private, run `gh auth login`, then retry."
        };
        return Ok(ToolOutput::error(message));
    }
    if !status.is_success() {
        return Ok(ToolOutput::error(format!(
            "GitHub API returned HTTP {}",
            status.as_u16()
        )));
    }
    let decode_limit = limits.max_output_bytes.saturating_mul(4).max(4096);
    let mut bytes = Vec::new();
    while let Some(chunk) = tokio::select! {
        result = response.chunk() => result.context("GitHub issue response failed")?,
        () = cancellation.cancelled() => bail!("GitHub issue request cancelled"),
    } {
        if bytes.len().saturating_add(chunk.len()) > decode_limit {
            return Ok(ToolOutput::error(
                "GitHub issue response exceeded the configured size limit",
            ));
        }
        bytes.extend_from_slice(&chunk);
    }
    let issue: Value = serde_json::from_slice(&bytes).context("GitHub returned invalid JSON")?;
    let rendered = render_issue(&reference, &issue, limits.max_output_bytes);
    Ok(ToolOutput {
        text: rendered,
        structured: Some(json!({
            "owner": reference.owner,
            "repository": reference.repository,
            "number": reference.number,
            "url": issue.get("html_url").and_then(Value::as_str),
            "state": issue.get("state").and_then(Value::as_str),
            "is_pull_request": issue.get("pull_request").is_some(),
        })),
        is_error: false,
    })
}

fn github_token(cancellation: &CancellationToken) -> Option<String> {
    for name in ["GH_TOKEN", "GITHUB_TOKEN"] {
        if let Ok(token) = env::var(name)
            && !token.trim().is_empty()
        {
            return Some(token.trim().to_owned());
        }
    }
    let mut child = Command::new("gh")
        .args(["auth", "token"])
        .env("GH_PROMPT_DISABLED", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let deadline = Instant::now() + GH_AUTH_TIMEOUT;
    let success = loop {
        if cancellation.is_cancelled() || Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return None;
        }
        match child.try_wait().ok()? {
            Some(status) => break status.success(),
            None => thread::sleep(Duration::from_millis(10)),
        }
    };
    if !success {
        return None;
    }
    let mut output = Vec::new();
    child
        .stdout
        .take()?
        .take(16 * 1024 + 1)
        .read_to_end(&mut output)
        .ok()?;
    if output.len() > 16 * 1024 {
        return None;
    }
    let token = String::from_utf8(output).ok()?;
    let token = token.trim();
    (!token.is_empty()).then(|| token.to_owned())
}

fn render_issue(reference: &IssueReference, issue: &Value, limit: usize) -> String {
    let kind = if issue.get("pull_request").is_some() {
        "Pull request"
    } else {
        "Issue"
    };
    let title = issue.get("title").and_then(Value::as_str).unwrap_or("");
    let state = issue
        .get("state")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let author = issue
        .pointer("/user/login")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    let url = issue.get("html_url").and_then(Value::as_str).unwrap_or("");
    let labels = issue
        .get("labels")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|label| label.get("name").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join(", ");
    let body = issue.get("body").and_then(Value::as_str).unwrap_or("");
    bounded_text(
        format!(
            "{kind} {}/{}#{}: {title}\nState: {state}\nAuthor: {author}\nLabels: {}\nURL: {url}\n\n{}",
            reference.owner,
            reference.repository,
            reference.number,
            if labels.is_empty() { "none" } else { &labels },
            if body.is_empty() {
                "(no description)"
            } else {
                body
            }
        ),
        limit,
    )
}

#[cfg(test)]
mod tests {
    use super::{IssueReference, parse_target, render_issue};
    use serde_json::json;

    #[test]
    fn parses_issue_pr_urls_and_shorthand() {
        let expected = IssueReference {
            owner: "elixpo".to_owned(),
            repository: "crumb.elixpo".to_owned(),
            number: 148,
        };
        assert_eq!(
            parse_target("https://github.com/elixpo/crumb.elixpo/issues/148").expect("issue URL"),
            expected
        );
        assert_eq!(
            parse_target("https://github.com/elixpo/crumb.elixpo/pull/148/files")
                .expect("pull URL"),
            expected
        );
        assert_eq!(
            parse_target("elixpo/crumb.elixpo#148").expect("shorthand"),
            expected
        );
    }

    #[test]
    fn rejects_unsafe_or_ambiguous_targets() {
        for target in [
            "http://github.com/elixpo/crumb.elixpo/issues/148",
            "https://example.com/elixpo/crumb.elixpo/issues/148",
            "https://github.com/elixpo/crumb.elixpo/tree/main",
            "elixpo/crumb.elixpo#0",
            "elixpo/../repo#2",
        ] {
            assert!(parse_target(target).is_err(), "{target}");
        }
    }

    #[test]
    fn rendered_output_is_bounded() {
        let reference = IssueReference {
            owner: "o".to_owned(),
            repository: "r".to_owned(),
            number: 1,
        };
        let issue = json!({
            "title": "A fix",
            "state": "open",
            "user": {"login": "octocat"},
            "body": "x".repeat(500),
            "html_url": "https://github.com/o/r/issues/1",
            "labels": [{"name": "bug"}]
        });
        assert_eq!(render_issue(&reference, &issue, 80).len(), 80);
    }
}
