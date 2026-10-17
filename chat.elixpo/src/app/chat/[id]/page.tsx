"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useBookmarks } from "@/lib/chat/use-bookmarks";
import MessageBubble from "@/components/chat/MessageBubble";
import ChatInput from "@/components/chat/ChatInput";
import ChatSidebar from "@/components/chat/ChatSidebar";
import { ChatSearchDialog } from "@/components/chat/ChatSearchDialog";
import { BookmarkedMessagesPanel } from "@/components/chat/BookmarkedMessagesPanel";
import ChatSkeleton from "@/components/skeletons/ChatSkeleton";
import PollinationsBadge from "@/components/chat/PollinationsBadge";


function SkeletonMessages() {
  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={`flex ${i % 2 === 1 ? "justify-end" : "justify-start"}`}>
          <div className={`rounded-2xl ${i % 2 === 1 ? "bg-neutral-100 w-48" : "bg-neutral-50 w-80"} h-12`} />
        </div>
      ))}
    </div>
  );
}


export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading, login } = useAuth();
  
  const [sessionId, setSessionId] = useState(
    id === "new" ? undefined : id
  );
  const [chatTitle, setChatTitle] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [model, setModel] = useState("openai");
  const [sharecopied, setShareCopied] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const { messages, sendMessage, stop, status, setMessages, regenerate } = useChat({
    id: sessionId ?? "new",
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { model, id: sessionId },
      fetch: async (url, options) => {
        const res = await fetch(url, options);
        const convId = res.headers.get("x-conversation-id");
        if (convId && convId !== sessionId) {
          setSessionId(convId);
        }
        return res;
      },
    }),
  });

  const isLoading = status === "streaming" || status === "submitted";

  const displayMessages = messages.map((msg: any) => ({
    ...msg,
    content: msg.content ?? (msg.parts?.filter((p: any) => p.type === "text").map((p: any) => p.text).join("") || ""),
  }));

  const sendMessageWrapper = (content: string, images?: string[]) => {
    sendMessage({ role: "user", parts: [{ type: "text", text: content }] } as any);
  };

  const { toggleBookmark, isBookmarked, getBookmarkedMessages } = useBookmarks();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (id !== "new") {
      setIsLoadingHistory(true);
      fetch(`/api/chat?id=${id}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setMessages(data);
        })
        .finally(() => setIsLoadingHistory(false));
    }
  }, [id, setMessages]);

  useEffect(() => {
    if (id === "new" && sessionId && displayMessages.length > 0) {
      router.replace(`/chat/${sessionId}`, { scroll: false });
    }
  }, [sessionId, id, router, displayMessages.length]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "F") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayMessages]);

  const prevLoading = useRef(false);
  useEffect(() => {
    if (prevLoading.current && !isLoading) {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
      textarea?.focus();
    }
    prevLoading.current = isLoading;
  }, [isLoading]);

  const handleShare = () => {
    const url = `${window.location.origin}/chat/${sessionId}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  const handleSelectSearchResult = (messageId: string) => {
    const element = messageRefs.current[messageId];
    if (element && scrollRef.current) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("ring-2", "ring-blue-400");
      setTimeout(() => element.classList.remove("ring-2", "ring-blue-400"), 2000);
    }
  };

  const handleDelete = async () => {
    if (!sessionId || !confirm("Are you sure you want to delete this chat permanently?")) return;
    try {
      await fetch(`/api/chat/conversations?id=${sessionId}`, { method: "DELETE" });
      router.replace("/chat/new");
    } catch (e) {
      console.error("Failed to delete chat", e);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#080C18]">
        <div className="w-8 h-8 border-2 border-border-default border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#080C18] px-6">
        <img src="/images/logo.png" alt="Elixpo" width={64} height={64} className="rounded-2xl mb-6 opacity-60" />
        <h2 className="text-2xl font-bold text-primary mb-2">Sign in to chat</h2>
        <p className="text-secondary text-sm leading-relaxed text-center max-w-sm mb-6">Connect with your Elixpo account to start AI conversations.</p>
        <button onClick={login} className="px-8 py-3 rounded-full text-sm font-semibold bg-white text-[#080C18] hover:bg-neutral-200 transition-colors cursor-pointer">Sign in with Elixpo</button>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#080C18]">
      <ChatSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />

      <div className="flex-1 flex flex-col min-w-0">
        <ChatSearchDialog
          messages={displayMessages as any}
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onSelectResult={handleSelectSearchResult}
        />

        <BookmarkedMessagesPanel
          messages={getBookmarkedMessages()}
          isOpen={bookmarksOpen}
          onClose={() => setBookmarksOpen(false)}
          onRemoveBookmark={(messageId) => {
            const msg = displayMessages.find((m) => m.id === messageId);
            if (msg) toggleBookmark(msg as any);
          }}
          onSelectMessage={handleSelectSearchResult}
        />

        <header className="flex items-center justify-between px-5 py-3 bg-[#0D1220]/80 backdrop-blur-sm border-b border-[rgba(255,255,255,0.05)] flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/images/logo.png" alt="" width={22} height={22} className="rounded-md flex-shrink-0 opacity-40" />
            <input
              type="text"
              value={chatTitle || ""}
              onChange={(e) => setChatTitle(e.target.value)}
              placeholder="New chat"
              className="text-sm font-semibold text-primary bg-transparent outline-none border-none truncate min-w-0 hover:bg-white/5 focus:bg-white/5 rounded px-1.5 py-0.5 -ml-1.5 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PollinationsBadge />
            {displayMessages.length > 0 && (
              <button
                onClick={() => setSearchOpen(true)}
                title="Search (Ctrl+Shift+F)"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-white/5 transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <span className="hidden sm:inline">Search</span>
              </button>
            )}
            {displayMessages.length > 0 && (
              <button
                onClick={() => setBookmarksOpen(true)}
                title="View bookmarks"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-white/5 transition-colors cursor-pointer relative"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
                <span className="hidden sm:inline">Bookmarks</span>
                {getBookmarkedMessages().length > 0 && (
                  <span className="absolute top-1 right-0 w-2 h-2 bg-yellow-500 rounded-full" />
                )}
              </button>
            )}
            {sessionId && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-secondary hover:bg-white/5 transition-colors cursor-pointer"
              >
                {sharecopied ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
                    <span className="text-green-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                    <span>Share</span>
                  </>
                )}
              </button>
            )}
            {sessionId && (
              <button
                onClick={handleDelete}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                title="Delete Chat"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            )}
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8" style={{ scrollbarWidth: "thin" }}>
          {isLoadingHistory ? (
            <ChatSkeleton />
          ) : (
            <div className="max-w-3xl mx-auto space-y-7">
              {displayMessages.length === 0 && !isLoadingHistory && (
                <div className="flex flex-col items-center justify-center pt-[22vh]">
                  <img src="/images/logo.png" alt="" width={44} height={44} className="rounded-xl mb-5 opacity-25" />
                  <h2 className="text-xl font-bold text-primary mb-1.5">Hey {user.displayName}!</h2>
                  <p className="text-sm text-secondary">What would you like to know?</p>
                </div>
              )}
              {displayMessages.map((msg, i) => {
                const isLastAssistant = msg.role === "assistant" && i === displayMessages.length - 1;
                const isLastLoading = isLoading && isLastAssistant;
                return (
                  <div
                    key={msg.id}
                    ref={(el) => {
                      if (el) messageRefs.current[msg.id] = el;
                    }}
                    id={`msg-${msg.id}`}
                    className={`${msg.role === "user" ? "animate-msg-user" : "animate-msg-assistant"} rounded-lg transition-all`}
                  >
                      <MessageBubble
                        message={{ ...msg, isStreaming: isLastLoading } as any}
                        onRetry={isLastAssistant && !isLoading ? regenerate : undefined}
                        isBookmarked={isBookmarked(msg.id)}
                        onToggleBookmark={() => toggleBookmark(msg as any)}
                      />
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <ChatInput onSend={sendMessageWrapper} onStop={stop} isLoading={isLoading} model={model} onModelChange={setModel} />
      </div>
    </div>
  );
}
