"use client";

import { Star } from "lucide-react";

interface BookmarkButtonProps {
  isBookmarked: boolean;
  onToggle: () => void;
  tooltipText?: string;
}

export function BookmarkButton({
  isBookmarked,
  onToggle,
  tooltipText = isBookmarked ? "Remove bookmark" : "Bookmark this message",
}: BookmarkButtonProps) {
  return (
    <button
      onClick={onToggle}
      title={tooltipText}
      className={`p-1.5 rounded-lg transition-all duration-200 ${
        isBookmarked
          ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-600 dark:text-yellow-400"
          : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
      aria-label={tooltipText}
    >
      <Star
        className={`w-4 h-4 transition-transform ${
          isBookmarked ? "fill-current scale-110" : ""
        }`}
      />
    </button>
  );
}
