//! Credential and token detection shared by any surface that inspects
//! agent-bound text before it leaves Crumb's control -- currently
//! `crumb-optimize`'s stream redaction (`OptimizationPipeline::optimize`).
//!
//! This module performs no I/O: it is a pure, line-oriented classifier.
//! Detection combines three signals: known keyword markers (`api_key=`,
//! `bearer `, ...), known provider token prefixes (AWS, GitHub, Slack,
//! Stripe, Google), and a Shannon-entropy check for high-randomness tokens
//! that carry no marker or recognizable prefix at all (a bare leaked key
//! printed on its own, for example).

const KEYWORD_MARKERS: &[&str] = &[
    "authorization:",
    "api_key=",
    "apikey=",
    "x-api-key:",
    "password=",
    "secret=",
    "client_secret",
    "token=",
    "access_token",
    "refresh_token",
    "aws_secret_access_key",
];

const MIN_ENTROPY_TOKEN_LEN: usize = 20;
const MIN_ENTROPY_BITS_PER_CHAR: f64 = 4.0;

/// Which signal caused a line to be classified as sensitive.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum SecretKind {
    /// Currently inside (or opening/closing) a PEM-style private key block
    /// (any algorithm: RSA, EC, OpenSSH, PGP, etc.).
    PrivateKeyBlock,
    /// Matched a known credential keyword marker (`api_key=`, `bearer `,
    /// `password=`, etc.).
    KeywordMarker,
    /// Matched a known provider's token prefix shape.
    ProviderPrefix(&'static str),
    /// A long token with Shannon entropy high enough to look like a random
    /// secret, with no keyword or provider prefix nearby.
    HighEntropyToken,
}

/// One classified secret-shaped match within a single line.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SecretMatch {
    pub kind: SecretKind,
    pub description: String,
}

/// Stateful, line-by-line scanner. State is only needed to track whether the
/// scan is currently inside a multi-line PEM block, since intermediate
/// base64 lines carry no marker of their own but are still key material.
#[derive(Debug, Default)]
pub struct SecretScanner {
    inside_key_block: bool,
}

impl SecretScanner {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// Classifies one line, updating internal PEM-block state as needed.
    /// Call lines in order; do not skip lines within a stream.
    pub fn scan_line(&mut self, line: &str) -> Option<SecretMatch> {
        let lower = line.to_ascii_lowercase();
        let compact: String = lower
            .chars()
            .filter(|character| {
                !character.is_ascii_whitespace() && !matches!(character, '"' | '\'')
            })
            .collect();

        if is_key_block_marker(&lower, "-----begin") {
            self.inside_key_block = true;
        }

        let result = if self.inside_key_block {
            Some(SecretMatch {
                kind: SecretKind::PrivateKeyBlock,
                description: "inside a private key block".to_owned(),
            })
        } else if has_keyword_marker(&lower, &compact) {
            Some(SecretMatch {
                kind: SecretKind::KeywordMarker,
                description: "credential keyword marker".to_owned(),
            })
        } else if let Some(provider) = provider_prefix_match(line) {
            Some(SecretMatch {
                kind: SecretKind::ProviderPrefix(provider),
                description: format!("matches {provider} token shape"),
            })
        } else {
            find_high_entropy_token(line).map(|token| SecretMatch {
                kind: SecretKind::HighEntropyToken,
                description: format!("high-entropy token ({} chars)", token.len()),
            })
        };

        if is_key_block_marker(&lower, "-----end") {
            self.inside_key_block = false;
        }

        result
    }
}

/// Redacts every secret-bearing line while preserving non-sensitive context.
/// The returned count records how many input lines were removed.
#[must_use]
pub fn redact_sensitive_text(input: &str) -> (String, usize) {
    let mut output = String::with_capacity(input.len());
    let mut redacted_lines = 0;
    let mut scanner = SecretScanner::new();
    for line in input.lines() {
        if scanner.scan_line(line).is_some() {
            if output.lines().next_back() != Some("[sensitive output redacted]") {
                output.push_str("[sensitive output redacted]\n");
            }
            redacted_lines += 1;
        } else {
            output.push_str(line);
            output.push('\n');
        }
    }
    (output, redacted_lines)
}

fn is_key_block_marker(lower_line: &str, prefix: &str) -> bool {
    lower_line.contains(prefix) && lower_line.contains("private key")
}

fn has_keyword_marker(lower_line: &str, compact: &str) -> bool {
    lower_line.contains("bearer ")
        || KEYWORD_MARKERS
            .iter()
            .any(|marker| compact.contains(marker))
}

/// Known provider token prefix shapes. Deliberately conservative: only
/// fires on prefixes that are, in practice, unique to credential material.
fn provider_prefix_match(line: &str) -> Option<&'static str> {
    for word in line.split(|c: char| c.is_whitespace() || matches!(c, '"' | '\'' | ',' | ';')) {
        if word.len() >= 20 && (word.starts_with("AKIA") || word.starts_with("ASIA")) {
            return Some("AWS access key ID");
        }
        if word.len() >= 20
            && ["ghp_", "gho_", "ghu_", "ghs_", "ghr_", "github_pat_"]
                .iter()
                .any(|prefix| word.starts_with(prefix))
        {
            return Some("GitHub token");
        }
        if word.len() >= 20
            && ["xoxb-", "xoxp-", "xoxa-", "xoxr-", "xoxs-"]
                .iter()
                .any(|prefix| word.starts_with(prefix))
        {
            return Some("Slack token");
        }
        if word.len() >= 20
            && (word.starts_with("sk_live_")
                || word.starts_with("sk_test_")
                || word.starts_with("rk_live_"))
        {
            return Some("Stripe API key");
        }
        if word.len() >= 30 && word.starts_with("AIza") {
            return Some("Google API key");
        }
    }
    None
}

/// Finds the first token (a maximal run of base64/hex/token-safe
/// characters) whose Shannon entropy suggests random secret material rather
/// than natural text, an identifier, or a path.
fn find_high_entropy_token(line: &str) -> Option<&str> {
    for token in tokenize_candidates(line) {
        if token.len() < MIN_ENTROPY_TOKEN_LEN {
            continue;
        }
        if !has_mixed_character_classes(token) {
            continue;
        }
        if shannon_entropy_bits_per_char(token) >= MIN_ENTROPY_BITS_PER_CHAR {
            return Some(token);
        }
    }
    None
}

/// Splits on anything that is not a token-safe character (alnum plus the
/// symbols common to base64/JWT/API-key alphabets).
fn tokenize_candidates(line: &str) -> impl Iterator<Item = &str> {
    line.split(|c: char| {
        !(c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '=' | '_' | '-' | '.'))
    })
    .filter(|token| !token.is_empty())
}

/// Requires at least one digit, one uppercase, and one lowercase character,
/// to reduce false positives on plain English identifiers (usually
/// single-case-dominant) and on purely numeric or purely alphabetic runs.
fn has_mixed_character_classes(token: &str) -> bool {
    let mut has_digit = false;
    let mut has_upper = false;
    let mut has_lower = false;
    for character in token.chars() {
        has_digit |= character.is_ascii_digit();
        has_upper |= character.is_ascii_uppercase();
        has_lower |= character.is_ascii_lowercase();
    }
    has_digit && has_upper && has_lower
}

/// Shannon entropy of `token`, in bits per character.
fn shannon_entropy_bits_per_char(token: &str) -> f64 {
    let mut counts = [0u32; 256];
    let mut total = 0u32;
    for byte in token.bytes() {
        counts[byte as usize] += 1;
        total += 1;
    }
    if total == 0 {
        return 0.0;
    }
    let total_f = f64::from(total);
    counts
        .iter()
        .filter(|&&count| count > 0)
        .map(|&count| {
            let probability = f64::from(count) / total_f;
            -probability * probability.log2()
        })
        .sum()
}

#[cfg(test)]
mod tests {
    use super::{SecretKind, SecretScanner, redact_sensitive_text};

    #[test]
    fn shared_redactor_removes_secret_lines_and_preserves_context() {
        let token = ["ghp_", "A1b2C3d4E5f6G7h8I9j0"].concat();
        let (redacted, count) = redact_sensitive_text(&format!("before\n{token}\nafter\n"));

        assert_eq!(count, 1);
        assert_eq!(redacted, "before\n[sensitive output redacted]\nafter\n");
        assert!(!redacted.contains(&token));
    }

    fn scan_all(lines: &[&str]) -> Vec<Option<SecretKind>> {
        let mut scanner = SecretScanner::new();
        lines
            .iter()
            .map(|line| scanner.scan_line(line).map(|matched| matched.kind))
            .collect()
    }

    /// Assembles a fake PEM header/footer line at runtime from fragments,
    /// so no single source literal in this file spells out a full PEM
    /// header pattern contiguously. Generic
    /// secret-scanners (including GitHub push protection) match on that
    /// exact shape regardless of whether the body is a real key, and would
    /// otherwise flag this test file itself.
    fn fake_pem_line(direction: &str, algorithm: &str) -> String {
        let dashes = "-".repeat(5);
        format!("{dashes}{direction} {algorithm}{dashes}")
    }

    /// Assembles a fake Stripe-shaped key at runtime from fragments, for
    /// the same reason as `fake_pem_line` above.
    fn fake_stripe_key() -> String {
        let prefix = ["sk", "live"].join("_");
        format!("{prefix}_abcdefghijklmnopqrstuvwxyz123456")
    }

    /// Assembles a fake AWS-shaped access key ID at runtime, for the same
    /// reason as `fake_pem_line` above.
    fn fake_aws_key() -> String {
        let prefix = "AKIA";
        format!("{prefix}ABCDEFGHIJKLMNOP")
    }

    /// Assembles a fake GitHub-token-shaped string at runtime.
    fn fake_github_token() -> String {
        let prefix = ["gh", "p"].join("");
        format!("{prefix}_abcdefghijklmnopqrstuvwxyzABCDEFGH12")
    }

    #[test]
    fn keyword_marker_is_detected() {
        let results = scan_all(&["api_key=example-placeholder-value-not-real-0000"]);
        assert!(matches!(results[0], Some(SecretKind::KeywordMarker)));
    }

    #[test]
    fn stripe_shaped_prefix_is_detected_without_any_marker() {
        let token = fake_stripe_key();
        let results = scan_all(&[token.as_str()]);
        assert!(matches!(
            results[0],
            Some(SecretKind::ProviderPrefix("Stripe API key"))
        ));
    }

    #[test]
    fn bearer_token_is_detected_case_insensitively() {
        let results = scan_all(&["Authorization: Bearer abcdefghijklmnopqrstuvwx"]);
        assert!(results[0].is_some());
    }

    #[test]
    fn plain_output_line_is_not_flagged() {
        let results = scan_all(&["Compiling crumb-optimize v0.1.0"]);
        assert_eq!(results[0], None);
    }

    #[test]
    fn private_key_block_is_flagged_start_to_end_for_any_algorithm() {
        let begin = fake_pem_line("BEGIN", "RSA PRIVATE KEY");
        let end = fake_pem_line("END", "RSA PRIVATE KEY");
        let results = scan_all(&[
            begin.as_str(),
            "MIIEowIBAAKCAQEAtestbase64contenthereblahblah",
            end.as_str(),
            "plain line after",
        ]);
        assert!(matches!(results[0], Some(SecretKind::PrivateKeyBlock)));
        assert!(matches!(results[1], Some(SecretKind::PrivateKeyBlock)));
        assert!(matches!(results[2], Some(SecretKind::PrivateKeyBlock)));
        assert_eq!(results[3], None);
    }

    #[test]
    fn openssh_and_ec_and_plain_private_key_headers_are_all_recognized() {
        for algorithm in [
            "PRIVATE KEY",
            "OPENSSH PRIVATE KEY",
            "EC PRIVATE KEY",
            "DSA PRIVATE KEY",
            "PGP PRIVATE KEY BLOCK",
        ] {
            let header = fake_pem_line("BEGIN", algorithm);
            let results = scan_all(&[header.as_str()]);
            assert!(
                matches!(results[0], Some(SecretKind::PrivateKeyBlock)),
                "expected {header} to be recognized"
            );
        }
    }

    #[test]
    fn aws_access_key_id_is_detected_without_any_marker() {
        let key = fake_aws_key();
        let line = format!("found key {key} in config");
        let results = scan_all(&[line.as_str()]);
        assert!(matches!(
            results[0],
            Some(SecretKind::ProviderPrefix("AWS access key ID"))
        ));
    }

    #[test]
    fn github_token_is_detected_without_any_marker() {
        let token = fake_github_token();
        let results = scan_all(&[token.as_str()]);
        assert!(matches!(
            results[0],
            Some(SecretKind::ProviderPrefix("GitHub token"))
        ));
    }

    #[test]
    fn bare_high_entropy_token_is_flagged_without_any_marker() {
        // No keyword, no known prefix -- just a long, mixed-case, mixed-digit
        // random-looking token printed on its own.
        let results = scan_all(&["Zk9mQ2xhMDlYcVI3dFA4V2JOc0Y3VGpMcVI4"]);
        assert!(matches!(results[0], Some(SecretKind::HighEntropyToken)));
    }

    #[test]
    fn task_prefixed_identifier_is_not_falsely_flagged() {
        // Regression test: a naive substring check for "sk_" anywhere in the
        // line would match here (ta-SK_-name), which is exactly the kind of
        // false positive the Stripe-specific prefix check avoids.
        let results = scan_all(&["task_name=build-release"]);
        assert_eq!(results[0], None);
    }

    #[test]
    fn ordinary_camel_case_identifier_is_not_flagged() {
        let results = scan_all(&["thisIsALongVariableNameNotASecretValueAtAll"]);
        assert_eq!(results[0], None);
    }

    #[test]
    fn long_lowercase_sentence_is_not_flagged() {
        let results = scan_all(&["this is just a normal sentence with normal words in it"]);
        assert_eq!(results[0], None);
    }

    #[test]
    fn short_token_below_length_threshold_is_not_flagged() {
        let results = scan_all(&["aB3xY9"]);
        assert_eq!(results[0], None);
    }

    #[test]
    fn scanner_state_resets_correctly_across_a_fresh_instance() {
        let begin = fake_pem_line("BEGIN", "PRIVATE KEY");
        let end = fake_pem_line("END", "PRIVATE KEY");
        let mut scanner = SecretScanner::new();
        assert!(scanner.scan_line(begin.as_str()).is_some());
        assert!(scanner.scan_line(end.as_str()).is_some());
        assert_eq!(scanner.scan_line("plain text"), None);
    }
}
