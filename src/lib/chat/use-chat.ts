"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { chatStream, getSession, type ChatMessage } from "./search-client";

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  isStreaming?: boolean;
  taskBlocks?: string[];
}

interface CachedSession {
  sessionId: string;
  title: string;
  messages: DisplayMessage[];
  updatedAt: number;
}

// ── LocalStorage buffer ──

const CACHE_KEY = "elixpo_chat_buffer";

function loadCache(sid: string): CachedSession | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const cached: CachedSession = JSON.parse(raw);
    if (cached.sessionId === sid) return cached;
    return null;
  } catch { return null; }
}

function saveCache(session: CachedSession) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(session));
  } catch { /* quota exceeded — ignore */ }
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* */ }
}

// ── Task parser ──

function parseTaskBlocks(raw: string): { tasks: string[]; cleanContent: string } {
  const tasks: string[] = [];
  const cleanContent = raw.replace(/<TASK>([\s\S]*?)<\/TASK>/g, (_, inner) => {
    tasks.push(inner.trim());
    return "";
  });
  return { tasks, cleanContent: cleanContent.trim() };
}

// ── Hook ──

export function useChat(initialSessionId?: string) {
  const [sessionId] = useState(() => initialSessionId || crypto.randomUUID().slice(0, 11));
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [chatTitle, setChatTitle] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const streamTextRef = useRef("");
  const initialized = useRef(false);

  // On mount: load from cache or fetch from server
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const cached = loadCache(sessionId);
    if (cached) {
      // Cache hit — use local buffer
      setMessages(cached.messages);
      setChatTitle(cached.title);
      return;
    }

    // Cache miss — if this is an existing session, fetch from server
    if (initialSessionId) {
      loadSession(initialSessionId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist to localStorage on every message change (acts as buffer)
  useEffect(() => {
    if (!messages.length) return;
    // Don't save while streaming (wait for final state)
    const hasStreaming = messages.some((m) => m.isStreaming);
    if (hasStreaming) return;

    saveCache({
      sessionId,
      title: chatTitle,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        images: m.images,
        taskBlocks: m.taskBlocks,
      })),
      updatedAt: Date.now(),
    });
  }, [messages, sessionId, chatTitle]);

  /** Load session from server */
  const loadSession = useCallback(async (sid: string) => {
    setIsLoadingHistory(true);
    try {
      const history = await getSession(sid);
      const displayMsgs: DisplayMessage[] = history.map((msg, i) => {
        const { tasks, cleanContent } = parseTaskBlocks(typeof msg.content === "string" ? msg.content : "");
        return {
          id: `hist-${i}`,
          role: msg.role as "user" | "assistant",
          content: cleanContent || (typeof msg.content === "string" ? msg.content : ""),
          taskBlocks: tasks.length ? tasks : undefined,
        };
      });
      setMessages(displayMsgs);
      const firstUser = displayMsgs.find((m) => m.role === "user");
      if (firstUser) setChatTitle(firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? "..." : ""));
    } catch (err) {
      console.error("Failed to load session:", err);
    }
    setIsLoadingHistory(false);
  }, []);

  /** Send a message */
  const sendMessage = useCallback(async (content: string, images?: string[]) => {
    if (!content.trim() && !images?.length) return;

    const sid = sessionId;

    const userContent: ChatMessage["content"] = images?.length
      ? [
          { type: "text", text: content },
          ...images.map((url) => ({ type: "image_url" as const, image_url: { url } })),
        ]
      : content;

    const userMsg: DisplayMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
      images,
    };

    if (!chatTitle) setChatTitle(content.slice(0, 50) + (content.length > 50 ? "..." : ""));

    const assistantMsg: DisplayMessage = {
      id: `asst-${Date.now()}`,
      role: "assistant",
      content: "",
      isStreaming: true,
      taskBlocks: [],
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsLoading(true);
    streamTextRef.current = "";

    const controller = await chatStream(
      {
        messages: [{ role: "user", content: userContent }],
        session_id: sid,
        stream: true,
      },
      {
        onChunk: (delta) => {
          streamTextRef.current += delta;
          const { tasks, cleanContent } = parseTaskBlocks(streamTextRef.current);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: cleanContent, taskBlocks: tasks.length ? tasks : undefined, isStreaming: true };
            }
            return updated;
          });
        },
        onDone: (fullText) => {
          const { tasks, cleanContent } = parseTaskBlocks(fullText);
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: cleanContent, taskBlocks: tasks.length ? tasks : undefined, isStreaming: false };
            }
            return updated;
          });
          setIsLoading(false);
        },
        onError: (err) => {
          // Detect rate limit errors
          const isRateLimit = err.message?.includes("429") || err.message?.toLowerCase().includes("too many") || err.message?.toLowerCase().includes("rate");
          
          if (isRateLimit) {
            toast.error("Rate limit reached", {
              duration: 5000,
              description: "Too many requests. Please wait a moment before trying again.",
            });
          } else {
            toast.error("Error", {
              duration: 3000,
              description: err.message || "Failed to send message",
            });
          }

          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { 
                ...last, 
                content: isRateLimit 
                  ? "Rate limit reached. Please wait a moment before sending another message."
                  : `Error: ${err.message}`, 
                isStreaming: false 
              };
            }
            return updated;
          });
          setIsLoading(false);
        },
      }
    );

    abortRef.current = controller;
  }, [sessionId, chatTitle]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages((prev) => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last?.isStreaming) updated[updated.length - 1] = { ...last, isStreaming: false };
      return updated;
    });
  }, []);

  const retryLast = useCallback(() => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => m.role === "assistant");
      if (idx >= 0) return prev.filter((_, i) => i !== idx);
      return prev;
    });
    sendMessage(lastUser.content, lastUser.images);
  }, [messages, sendMessage]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setChatTitle("");
    clearCache();
  }, []);

  return {
    messages, isLoading, isLoadingHistory, sessionId,
    chatTitle, setChatTitle,
    sendMessage, stopStreaming, loadSession, retryLast, clearChat,
  };
}
