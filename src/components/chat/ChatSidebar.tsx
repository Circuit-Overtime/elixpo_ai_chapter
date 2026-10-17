"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: number;
}

export default function ChatSidebar({ collapsed, onToggle }: SidebarProps) {
  const { id } = useParams<{ id: string }>();
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    fetch("/api/chat/conversations")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setConversations(data);
      })
      .catch(console.error);
  }, [id]);

  return (
    <div className={`flex flex-col h-full bg-[#0D1220]/80 border-r border-[rgba(255,255,255,0.05)] transition-all duration-300 ${collapsed ? "w-14" : "w-64"}`}>
      {/* Toggle */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-center h-12 text-secondary hover:text-primary transition-colors cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {collapsed
            ? <><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></>
            : <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
          }
        </svg>
      </button>

      {/* Nav items */}
      <nav className="flex-1 flex flex-col gap-0.5 px-2 py-1 overflow-y-auto scrollbar-thin">
        <Link
          href="/chat/new"
          className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors mb-4 ${
            id === "new" ? "bg-overlay text-primary" : "text-secondary hover:text-primary hover:bg-white/5"
          }`}
          title={collapsed ? "New chat" : undefined}
        >
          <span className="flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18" />
            </svg>
          </span>
          {!collapsed && <span className="text-sm font-medium truncate">New chat</span>}
        </Link>

        {!collapsed && conversations.length > 0 && (
          <div className="px-3 mb-2 text-xs font-semibold text-muted uppercase tracking-wider">
            Conversations
          </div>
        )}

        {conversations.map((conv) => {
          const isActive = conv.id === id;
          return (
            <Link
              key={conv.id}
              href={`/chat/${conv.id}`}
              className={`flex items-center gap-3 px-2.5 py-2.5 rounded-xl transition-colors ${
                isActive ? "bg-overlay text-primary" : "text-secondary hover:text-primary hover:bg-white/5"
              }`}
              title={collapsed ? conv.title : undefined}
            >
              <span className="flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </span>
              {!collapsed && <span className="text-sm font-medium truncate">{conv.title}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Logo at bottom */}
      <div className="px-2 pb-4 pt-2 border-t border-[rgba(255,255,255,0.05)]">
        <Link href="/" className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-secondary hover:text-primary transition-colors">
          <img src="/images/logo.png" alt="" width={24} height={24} className="rounded-md opacity-50" />
          {!collapsed && <span className="text-xs font-medium">Elixpo Chat</span>}
        </Link>
      </div>
    </div>
  );
}
