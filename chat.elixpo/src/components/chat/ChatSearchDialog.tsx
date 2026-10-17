"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { searchMessages, getHighlightSnippet, highlightText, type SearchResult } from "@/lib/chat/search-utils";
import type { DisplayMessage } from "@/lib/chat/use-chat";

interface ChatSearchProps {
  messages: DisplayMessage[];
  onSelectResult?: (messageId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export function ChatSearchDialog({
  messages,
  onSelectResult,
  isOpen,
  onClose,
}: ChatSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [isOpen]);

  // Search as user types
  useEffect(() => {
    if (query.trim()) {
      const searchResults = searchMessages(messages, query);
      setResults(searchResults);
      setSelectedIndex(0);
    } else {
      setResults([]);
    }
  }, [query, messages]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results.length > 0) {
        e.preventDefault();
        const selected = results[selectedIndex];
        if (selected) {
          onSelectResult?.(selected.messageId);
          onClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, onSelectResult]);

  // Scroll selected result into view
  useEffect(() => {
    if (resultsContainerRef.current) {
      const selected = resultsContainerRef.current.children[selectedIndex];
      if (selected) {
        selected.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [selectedIndex, results.length]); // Added results.length for safety

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-20">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Search Input */}
        <div className="border-b dark:border-slate-700 p-4">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Search conversations... (Ctrl+Shift+F)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-lg outline-none placeholder:text-slate-400 dark:text-white"
            />
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {results.length > 0 && (
            <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {results.length} result{results.length !== 1 ? "s" : ""} found
              {results.length > 0 && ` • Use ↑↓ to navigate, Enter to select, Esc to close`}
            </div>
          )}
        </div>

        {/* Results List */}
        <div
          ref={resultsContainerRef}
          className="max-h-[60vh] overflow-y-auto"
        >
          {results.length === 0 && query ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              No messages found matching "{query}"
            </div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-slate-500 dark:text-slate-400">
              Start typing to search...
            </div>
          ) : (
            results.map((result, idx) => (
              <SearchResultItem
                key={result.messageId}
                result={result}
                isSelected={idx === selectedIndex}
                onSelect={() => {
                  onSelectResult?.(result.messageId);
                  onClose();
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Individual result item
function SearchResultItem({
  result,
  isSelected,
  onSelect,
}: {
  result: SearchResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Get snippet around first match
  const firstHighlight = result.highlights[0];
  const { snippet, highlightStart, highlightEnd } = getHighlightSnippet(
    result.content,
    firstHighlight,
    60
  );

  const parts = highlightText(snippet, [
    { start: highlightStart, end: highlightEnd },
  ]);

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
        isSelected
          ? "bg-blue-50 dark:bg-blue-900/30 border-l-4 border-l-blue-500"
          : ""
      }`}
    >
      {/* Role badge */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            result.role === "user"
              ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
              : "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200"
          }`}
        >
          {result.role === "user" ? "You" : "Assistant"}
        </span>
        {result.matchCount > 1 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {result.matchCount} matches
          </span>
        )}
      </div>

      {/* Snippet with highlight */}
      <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-2">
        {parts.map((part, i) =>
          typeof part === "string" ? (
            <span key={i}>{part}</span>
          ) : (
            <mark
              key={i}
              className="bg-yellow-200 dark:bg-yellow-500/50 text-slate-900 dark:text-slate-100 font-semibold no-underline px-1"
            >
              {part.text}
            </mark>
          )
        )}
        {snippet.length < result.content.length && (
          <span className="text-slate-400 dark:text-slate-500">...</span>
        )}
      </p>
    </button>
  );
}
