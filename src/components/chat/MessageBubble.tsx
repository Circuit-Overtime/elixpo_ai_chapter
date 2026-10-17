"use client";

import { marked } from "marked";
import { useMemo, useState, useEffect, memo} from "react";
import { toast } from "sonner";
import TaskGroup from "./TaskBlock";
import { BookmarkButton } from "./BookmarkButton";
import PollinationsBadge from "./PollinationsBadge";
import type { DisplayMessage } from "@/lib/chat/use-chat";

marked.setOptions({ breaks: true, gfm: true });

const IMG_EXT = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|tiff?)(?:[?#].*)?$/i;
const ELIXPO_IMG = /search\.elixpo\.com\/api\/image\//;

function isImageUrl(url: string): boolean {
  return IMG_EXT.test(url) || ELIXPO_IMG.test(url);
}

/** Extract source URLs, related images, and strip all references from content */
function extractContent(text: string): {
  sources: { domain: string; url: string }[];
  images: string[];
  cleanText: string;
} {
  const sources: { domain: string; url: string }[] = [];
  const images: string[] = [];
  const seenDomains = new Set<string>();
  const seenImages = new Set<string>();

  // Extract all URLs from the original text
  const urlRegex = /\[([^\]]*)\]\((https?:\/\/[^)]+)\)|(?<!\()https?:\/\/[^\s)]+/g;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    const url = match[2] || match[0];
    try {
      const u = new URL(url);
      if (isImageUrl(url)) {
        if (!seenImages.has(url)) {
          seenImages.add(url);
          // Proxy elixpo images, keep others as-is
          if (ELIXPO_IMG.test(url)) {
            const id = url.match(/\/api\/image\/([a-f0-9-]+)/i)?.[1];
            if (id) images.push(`/api/image?id=${id}`);
          } else {
            images.push(url);
          }
        }
      } else {
        if (/search\.elixpo\.com/.test(url)) continue;
        const domain = u.hostname.replace(/^www\./, "");
        if (!seenDomains.has(domain)) {
          seenDomains.add(domain);
          sources.push({ domain, url });
        }
      }
    } catch { /* */ }
  }

  // Strip "Sources:" / "Related Images:" blocks (---\n**heading**\n... to end)
  let cleanText = text.replace(/\n*-{3,}\n\*{0,2}(?:Sources?|Related\s+Images?)\*{0,2}:?.*(?:\n.*)*$/i, "");
  // Fallback: strip these headings without --- separator (heading + numbered list to end)
  cleanText = cleanText.replace(/\n*\*{0,2}(?:Sources?|Related\s+Images?)\*{0,2}:?\s*\n(?:\s*\d+\.\s*\[.*?\]\(.*?\)\s*\n?)+/gi, "");
  // Catch any remaining standalone heading lines for these sections
  cleanText = cleanText.replace(/^\s*\*{0,2}(?:Sources?|Related\s+Images?)\*{0,2}:?\s*$/gim, "");
  // Remove all markdown image links ![text](url)
  cleanText = cleanText.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, "");
  // Remove all markdown links [text](url)
  cleanText = cleanText.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, "");
  // Remove any remaining bare URLs
  cleanText = cleanText.replace(/https?:\/\/[^\s)]+/g, "");
  // Clean up excess blank lines
  cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim();

  return { sources, images, cleanText };
}

function renderMarkdown(text: string): string {
  return marked.parse(text) as string;
}

interface MessageBubbleProps {
  message: DisplayMessage;
  onRetry?: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

interface SourceMeta {
  domain: string;
  url: string;
  title: string;
  description: string;
  loading: boolean;
}

const MessageBubble = memo(function MessageBubble({ message, onRetry, isBookmarked = false, onToggleBookmark }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const { sources, images: relatedImages, cleanText } = useMemo(() => {
    if (isUser) return { sources: [], images: [], cleanText: message.content };
    return extractContent(message.content);
  }, [message.content, isUser]);
  const html = useMemo(() => (isUser ? null : renderMarkdown(cleanText)), [cleanText, isUser]);
  const [liked, setLiked] = useState<"like" | "dislike" | null>(null);
  const [metas, setMetas] = useState<SourceMeta[]>([]);

  // Fetch meta for each source once streaming is done
  useEffect(() => {
    if (isUser || message.isStreaming || sources.length === 0) return;

    // Init with loading state
    setMetas(sources.slice(0, 8).map((s) => ({ ...s, title: "", description: "", loading: true })));

    sources.slice(0, 8).forEach((s, i) => {
      fetch(`/api/meta?url=${encodeURIComponent(s.url)}`)
        .then((r) => r.json())
        .then((data: any) => {
          setMetas((prev) => {
            const updated = [...prev];
            if (updated[i]) {
              const denied = /access\s*denied|forbidden|blocked/i;
              const title = denied.test(data.title) ? "" : data.title;
              const desc = denied.test(data.description) ? "" : data.description;
              updated[i] = { ...updated[i], title: title || s.domain, description: desc, loading: false };
            }
            return updated;
          });
        })
        .catch(() => {
          setMetas((prev) => {
            const updated = [...prev];
            if (updated[i]) {
              updated[i] = { ...updated[i], title: s.domain, description: "", loading: false };
            }
            return updated;
          });
        });
    });
  }, [isUser, message.isStreaming, sources]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copied to clipboard", {
        duration: 2000,
        description: "Response text copied successfully",
      });
    } catch (error) {
      toast.error("Failed to copy", {
        duration: 2000,
        description: "Could not copy response text",
      });
    }
  };

  // User message — right aligned, dark bubble
  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%]">
          {message.images?.map((img, i) => (
            <img key={i} src={img} alt="" className="rounded-xl mb-2 max-w-full max-h-48 object-cover ml-auto" />
          ))}
          <div className="bg-accent-500 text-white rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed shadow-sm">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message — left/center, no bubble bg
  return (
    <div className="max-w-3xl">
      {/* Identity row */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
          </svg>
        </div>
        <span className="text-xs font-medium text-secondary">Elixpo Chat</span>
        <PollinationsBadge />
      </div>

      {/* Task group — single collapsible header for all tasks */}
      {message.taskBlocks && message.taskBlocks.length > 0 && (
        <TaskGroup tasks={message.taskBlocks} isStreaming={!!message.isStreaming} />
      )}

      {/* Main content */}
      {message.content ? (
        <div
          className="prose prose-invert prose-sm max-w-none text-primary leading-relaxed select-text
            [&_img]:rounded-xl [&_img]:my-3 [&_img]:max-h-80
            [&_a]:text-blue-400 [&_a]:no-underline [&_a:hover]:underline
            [&_code]:bg-white/10 [&_code]:text-primary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-[13px]
            [&_pre]:bg-surface [&_pre]:border [&_pre]:border-border-default [&_pre]:text-primary [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words
            [&_pre_code]:bg-transparent [&_pre_code]:text-primary [&_pre_code]:p-0 [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words
            [&_blockquote]:border-l-border-strong [&_blockquote]:text-secondary
            [&_table]:text-sm [&_th]:bg-overlay [&_td]:border-border-default
            [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold"
          dangerouslySetInnerHTML={{ __html: html || "" }}
        />
      ) : message.isStreaming && !(message.taskBlocks && message.taskBlocks.length > 0) ? (
        <div className="flex items-center gap-2 text-xs text-neutral-500 py-2">
          <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
          <span>Connecting to Pollinations...</span>
        </div>
      ) : null}

      {/* Streaming state */}
      {message.isStreaming && message.content && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Generating on CPU...</span>
        </div>
      )}

      {/* Artifact cards */}
      {!message.isStreaming && metas.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mt-4">
          {metas.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2.5 w-60 px-3 py-2.5 rounded-xl border border-border-default bg-surface hover:bg-overlay hover:border-border-strong transition-colors"
            >
              <img
                src={`https://www.google.com/s2/favicons?domain=${s.domain}&sz=32`}
                alt=""
                width={16}
                height={16}
                className="rounded-sm mt-0.5 shrink-0"
              />
              {s.loading ? (
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3 w-20 bg-neutral-100 rounded animate-pulse" />
                  <div className="h-3 w-full bg-neutral-100 rounded animate-pulse" />
                </div>
              ) : (
                <div className="min-w-0">
                  <p className="text-xs font-medium text-secondary truncate">{s.domain}</p>
                  <p className="text-[13px] text-primary leading-snug line-clamp-2">
                    {s.description || s.title}
                  </p>
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {/* Related images */}
      {!message.isStreaming && relatedImages.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4">
          {relatedImages.map((src, i) => (
            <a key={i} href={src} target="_blank" rel="noopener noreferrer" className="relative block">
              <div className="w-full h-36 rounded-xl bg-surface animate-pulse absolute inset-0" />
              <img
                src={src}
                alt=""
                loading="lazy"
                className="relative w-full h-36 object-cover rounded-xl border border-border-default hover:border-border-strong transition-colors bg-surface"
                onLoad={(e) => { (e.target as HTMLImageElement).previousElementSibling?.remove(); }}
                onError={(e) => { const el = e.target as HTMLImageElement; el.previousElementSibling?.remove(); el.style.display = "none"; }}
              />
            </a>
          ))}
        </div>
      )}

      {/* Action buttons — only show when done */}
      {!message.isStreaming && message.content && (
        <div className="flex items-center gap-1 mt-3">
          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Copy response"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
          </button>

          {/* Bookmark */}
          {onToggleBookmark && (
            <BookmarkButton
              isBookmarked={isBookmarked}
              onToggle={onToggleBookmark}
            />
          )}

          {/* Like */}
          <button
            onClick={() => setLiked(liked === "like" ? null : "like")}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${liked === "like" ? "text-green-400 bg-green-500/10" : "text-secondary hover:text-primary hover:bg-overlay"}`}
            title="Good response"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={liked === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3" /></svg>
          </button>

          {/* Dislike */}
          <button
            onClick={() => setLiked(liked === "dislike" ? null : "dislike")}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${liked === "dislike" ? "text-red-400 bg-red-500/10" : "text-secondary hover:text-primary hover:bg-overlay"}`}
            title="Bad response"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill={liked === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17" /></svg>
          </button>

          {/* Retry */}
          {onRetry && (
            <button
              onClick={onRetry}
              className="p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-overlay transition-colors cursor-pointer"
              title="Retry"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default MessageBubble;
