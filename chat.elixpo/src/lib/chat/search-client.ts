/**
 * ElixSearch API client for chat.elixpo.com
 * All requests go through /api/chat proxy to avoid CORS.
 */

const PROXY = "/api/chat";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
}

export interface ContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

export interface ChatRequest {
  messages: ChatMessage[];
  session_id?: string;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: { index: number; message: { role: string; content: string }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/**
 * Send a chat request (non-streaming).
 */
export async function chatCompletion(request: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...request, stream: false }),
  });

  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `API error: ${res.status}`);
  }

  return res.json();
}

/**
 * Send a chat request with SSE streaming.
 */
export async function chatStream(
  request: ChatRequest,
  callbacks: {
    onChunk: (text: string) => void;
    onDone: (fullText: string) => void;
    onError: (error: Error) => void;
  }
): Promise<AbortController> {
  const controller = new AbortController();

  try {
    const res = await fetch(PROXY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...request, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err: any = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error: ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let fullText = "";
    let buffer = "";

    const processLine = (line: string) => {
      if (!line.startsWith("data: ")) return;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          callbacks.onChunk(delta);
        }
      } catch {
        // Non-JSON SSE line
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    }

    if (buffer) processLine(buffer);
    callbacks.onDone(fullText);
  } catch (err) {
    if ((err as Error).name !== "AbortError") {
      callbacks.onError(err as Error);
    }
  }

  return controller;
}

/**
 * Create a new session.
 */
export async function createSession(): Promise<string> {
  const res = await fetch(`${PROXY}?action=create_session`);
  if (!res.ok) throw new Error(`Session create failed: ${res.status}`);
  const data: any = await res.json();
  return data.session_id;
}

/**
 * Get session history.
 */
export async function getSession(sessionId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${PROXY}?action=get_session&session_id=${sessionId}`);
  if (!res.ok) return [];
  const data: any = await res.json();
  return data.messages || [];
}

/**
 * Delete a session.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await fetch(`${PROXY}?session_id=${sessionId}`, { method: "DELETE" });
}
