"use client";

import { useState } from "react";

interface TaskGroupProps {
  tasks: string[];
  isStreaming: boolean;
}

type TaskType = "search" | "memory" | "time" | "done" | "read" | "think" | "image" | "generic";

function detectType(text: string): TaskType {
  const lower = text.toLowerCase();
  if (lower === "done" || lower.includes("complete") || lower.includes("finished")) return "done";
  if (lower.includes("image") || lower.includes("generat") || lower.includes("drawing") || lower.includes("illustrat") || lower.includes("photo") || lower.includes("picture")) return "image";
  if (lower.includes("search") || lower.includes("web") || lower.includes("query") || lower.includes("looking")) return "search";
  if (lower.includes("recall") || lower.includes("memory") || lower.includes("snippet") || lower.includes("context")) return "memory";
  if (lower.includes("time") || lower.includes("date") || lower.includes("local") || lower.includes("location")) return "time";
  if (lower.includes("read") || lower.includes("fetch") || lower.includes("load") || lower.includes("source")) return "read";
  if (lower.includes("analy") || lower.includes("think") || lower.includes("reason") || lower.includes("process")) return "think";
  return "generic";
}

function TaskIcon({ type, className }: { type: TaskType; className?: string }) {
  const base = `flex-shrink-0 ${className || ""}`;
  switch (type) {
    case "search":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
        </svg>
      );
    case "memory":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2a7 7 0 017 7c0 3-2 5.5-4 7.5S12 20 12 22c0-2-1-2.5-3-4.5S5 12 5 9a7 7 0 017-7z" />
        </svg>
      );
    case "time":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
      );
    case "done":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      );
    case "read":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "think":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      );
    case "image":
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
        </svg>
      );
    default:
      return (
        <svg className={base} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      );
  }
}

function typeColor(): string {
  return "text-neutral-400";
}

export default function TaskGroup({ tasks, isStreaming }: TaskGroupProps) {
  const [expanded, setExpanded] = useState(true);

  if (!tasks.length) return null;

  return (
    <div className="mb-4">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2.5 cursor-pointer group"
      >
        {isStreaming ? (
          <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin flex-shrink-0" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round" className="flex-shrink-0">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" />
          </svg>
        )}
        <span className={`text-[13px] font-semibold tracking-tight ${isStreaming ? "text-neutral-700" : "text-neutral-400"}`}>
          {isStreaming ? "Processing your request" : "Processed your request"}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          className={`text-neutral-300 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Task steps */}
      {expanded && (
        <div className="mt-2 ml-[7px] border-l-2 border-neutral-150 pl-4 space-y-1.5" style={{ borderColor: "#e0e0e0" }}>
          {tasks.map((task, i) => {
            const type = detectType(task);
            const isDone = type === "done";
            return (
              <div key={i} className="flex items-center gap-2.5">
                <TaskIcon type={type} className={typeColor()} />
                <span className={`text-[13px] leading-snug ${isDone ? "font-semibold text-emerald-500" : "text-neutral-500"}`}>
                  {task}
                </span>
              </div>
            );
          })}
          {isStreaming && (
            <div className="flex items-center gap-2.5 pl-0.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
