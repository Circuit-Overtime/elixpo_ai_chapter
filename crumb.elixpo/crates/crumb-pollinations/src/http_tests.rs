use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crumb_llm::{
    ChatEvent, ChatMessage, ChatRequest, ChatRole, EmbeddingRequest, FinishReason, LlmProvider,
    ModelCapability, ProviderErrorKind, TokenUsage, ToolChoice,
};

use crate::{PollinationsConfig, PollinationsProvider, RetryPolicy};

struct Fixture {
    method: &'static str,
    path: &'static str,
    authenticated: bool,
    status: &'static str,
    content_type: &'static str,
    body: &'static str,
}

struct FixtureServer {
    origin: String,
    thread: JoinHandle<()>,
}

impl FixtureServer {
    fn spawn(fixtures: Vec<Fixture>) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").expect("fixture server should bind");
        let origin = format!(
            "http://{}",
            listener
                .local_addr()
                .expect("fixture address should be available")
        );
        let thread = thread::spawn(move || {
            for fixture in fixtures {
                let (mut stream, _) = listener.accept().expect("fixture request should connect");
                let request = read_request(&mut stream);
                let request_lowercase = request.to_ascii_lowercase();
                assert!(
                    request.starts_with(&format!("{} {} ", fixture.method, fixture.path)),
                    "unexpected request: {request}"
                );
                assert_eq!(
                    request_lowercase.contains("authorization: bearer sk_fixture"),
                    fixture.authenticated
                );
                write_response(&mut stream, &fixture);
            }
        });
        Self { origin, thread }
    }

    fn finish(self) {
        self.thread.join().expect("fixture server should finish");
    }
}

fn read_request(stream: &mut TcpStream) -> String {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .expect("fixture timeout should apply");
    let mut bytes = Vec::new();
    let mut chunk = [0_u8; 4096];
    let header_end = loop {
        let count = stream
            .read(&mut chunk)
            .expect("fixture request should read");
        assert!(count > 0, "request ended before its headers");
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(position) = find_subslice(&bytes, b"\r\n\r\n") {
            break position + 4;
        }
    };
    let headers = String::from_utf8_lossy(&bytes[..header_end]);
    let content_length = headers
        .lines()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("content-length:")
                .map(str::trim)
                .and_then(|value| value.parse::<usize>().ok())
        })
        .unwrap_or(0);
    while bytes.len() < header_end + content_length {
        let count = stream.read(&mut chunk).expect("fixture body should read");
        assert!(count > 0, "request ended before its body");
        bytes.extend_from_slice(&chunk[..count]);
    }
    String::from_utf8(bytes).expect("fixture request should be UTF-8")
}

fn write_response(stream: &mut TcpStream, fixture: &Fixture) {
    write!(
        stream,
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        fixture.status,
        fixture.content_type,
        fixture.body.len(),
        fixture.body
    )
    .expect("fixture response should write");
    stream.flush().expect("fixture response should flush");
}

fn find_subslice(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("test runtime should build")
}

#[test]
fn provider_maps_models_chat_and_embeddings_over_http() {
    let chat_body = concat!(
        "data: {\"choices\":[{\"delta\":{\"content\":\"hello\"},\"finish_reason\":null}]}\n\n",
        "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],",
        "\"usage\":{\"prompt_tokens\":2,\"completion_tokens\":1}}\n\n",
        "data: [DONE]\n\n"
    );
    let server = FixtureServer::spawn(vec![
        Fixture {
            method: "GET",
            path: "/text/models",
            authenticated: false,
            status: "200 OK",
            content_type: "application/json",
            body: r#"[{"name":"openai","displayName":"OpenAI","contextLength":128000,"capabilities":{"tool_calling":true},"inputModalities":["text","image"]}]"#,
        },
        Fixture {
            method: "POST",
            path: "/v1/chat/completions",
            authenticated: true,
            status: "200 OK",
            content_type: "text/event-stream",
            body: chat_body,
        },
        Fixture {
            method: "POST",
            path: "/v1/embeddings",
            authenticated: true,
            status: "200 OK",
            content_type: "application/json",
            body: r#"{"data":[{"index":0,"embedding":[0.25,0.75]}],"usage":{"prompt_tokens":3}}"#,
        },
    ]);
    let config = PollinationsConfig::new("sk_fixture")
        .expect("config should be valid")
        .with_base_url(&server.origin)
        .expect("fixture URL should be valid");
    let provider = PollinationsProvider::new(config).expect("provider should build");

    runtime().block_on(async {
        let models = provider.list_models().await.expect("models should load");
        assert_eq!(models[0].id, "openai");
        assert!(models[0].capabilities.contains(&ModelCapability::Tools));
        assert!(models[0].capabilities.contains(&ModelCapability::Vision));

        let mut stream = provider
            .chat_stream(ChatRequest {
                model: "openai".to_owned(),
                messages: vec![ChatMessage::text(ChatRole::User, "hello")],
                tools: Vec::new(),
                tool_choice: ToolChoice::None,
                max_output_tokens: Some(16),
            })
            .await
            .expect("chat stream should start");
        let mut events = Vec::new();
        while let Some(event) = stream.next().await.expect("chat event should decode") {
            events.push(event);
        }
        assert_eq!(
            events,
            vec![
                ChatEvent::TextDelta("hello".to_owned()),
                ChatEvent::Usage(TokenUsage {
                    input_tokens: 2,
                    cached_input_tokens: 0,
                    output_tokens: 1,
                }),
                ChatEvent::Finished(FinishReason::Stop),
            ]
        );

        let embeddings = provider
            .embeddings(EmbeddingRequest {
                model: "openai-3-small".to_owned(),
                input: vec!["crumb".to_owned()],
                dimensions: Some(2),
            })
            .await
            .expect("embeddings should load");
        assert_eq!(embeddings.vectors, vec![vec![0.25, 0.75]]);
        assert_eq!(embeddings.usage.input_tokens, 3);
    });
    server.finish();
}

#[test]
fn model_discovery_retries_only_to_its_configured_bound() {
    let server = FixtureServer::spawn(
        (0..2)
            .map(|_| Fixture {
                method: "GET",
                path: "/text/models",
                authenticated: false,
                status: "503 Service Unavailable",
                content_type: "application/json",
                body: "{}",
            })
            .collect(),
    );
    let mut config = PollinationsConfig::new("sk_fixture")
        .expect("config should be valid")
        .with_base_url(&server.origin)
        .expect("fixture URL should be valid");
    config.retry = RetryPolicy {
        max_attempts: 2,
        base_delay: Duration::ZERO,
    };
    let provider = PollinationsProvider::new(config).expect("provider should build");

    let error = runtime()
        .block_on(provider.list_models())
        .expect_err("both fixture attempts should fail");

    assert_eq!(error.kind, ProviderErrorKind::Unavailable);
    assert!(error.retryable);
    server.finish();
}

fn chat_request() -> ChatRequest {
    ChatRequest {
        model: "openai".to_owned(),
        messages: vec![ChatMessage::text(ChatRole::User, "hi")],
        tools: Vec::new(),
        tool_choice: ToolChoice::Auto,
        max_output_tokens: None,
    }
}

async fn collect_text(provider: &PollinationsProvider) -> String {
    let mut stream = provider
        .chat_stream(chat_request())
        .await
        .expect("chat stream should open");
    let mut text = String::new();
    while let Some(event) = stream.next().await.expect("stream should not fail") {
        if let ChatEvent::TextDelta(delta) = event {
            text.push_str(&delta);
        }
    }
    text
}

#[test]
fn chat_retries_a_transient_failure_before_any_response() {
    let server = FixtureServer::spawn(vec![
        Fixture {
            method: "POST",
            path: "/v1/chat/completions",
            authenticated: true,
            status: "503 Service Unavailable",
            content_type: "application/json",
            body: "{}",
        },
        Fixture {
            method: "POST",
            path: "/v1/chat/completions",
            authenticated: true,
            status: "200 OK",
            content_type: "text/event-stream",
            body: "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n",
        },
    ]);
    let mut config = PollinationsConfig::new("sk_fixture")
        .expect("config should be valid")
        .with_base_url(&server.origin)
        .expect("fixture URL should be valid");
    config.retry.base_delay = Duration::ZERO;
    let provider = PollinationsProvider::new(config).expect("provider should build");

    assert_eq!(runtime().block_on(collect_text(&provider)), "ok");
    server.finish();
}

#[test]
fn slow_streams_outlive_the_request_timeout_while_chunks_keep_arriving() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("fixture server should bind");
    let origin = format!("http://{}", listener.local_addr().expect("fixture address"));
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("fixture request should connect");
        read_request(&mut stream);
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n"
        )
        .expect("headers should write");
        for word in ["slow ", "but ", "steady"] {
            thread::sleep(Duration::from_millis(150));
            write!(
                stream,
                "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{word}\"}},\"finish_reason\":null}}]}}\n\n"
            )
            .expect("chunk should write");
            stream.flush().expect("chunk should flush");
        }
        write!(
            stream,
            "data: {{\"choices\":[{{\"delta\":{{}},\"finish_reason\":\"stop\"}}]}}\n\ndata: [DONE]\n\n"
        )
        .expect("end should write");
    });
    let mut config = PollinationsConfig::new("sk_fixture")
        .expect("config should be valid")
        .with_base_url(&origin)
        .expect("fixture URL should be valid");
    // The whole stream takes ~450 ms; only the per-read idle limit applies.
    config.request_timeout = Duration::from_millis(200);
    config.stream_idle_timeout = Duration::from_secs(2);
    let provider = PollinationsProvider::new(config).expect("provider should build");

    assert_eq!(
        runtime().block_on(collect_text(&provider)),
        "slow but steady"
    );
    server.join().expect("fixture server should finish");
}
