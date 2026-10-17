"use client";

import { X, Bookmark } from "lucide-react";
import { BookmarkButton } from "./BookmarkButton";
import { highlightText } from "@/lib/chat/search-utils";
import type { BookmarkedMessage } from "@/lib/chat/use-bookmarks";

interface BookmarkedMessagesPanelProps {
  messages: BookmarkedMessage[];
  isOpen: boolean;
  onClose: () => void;
  onSelectMessage?: (messageId: string) => void;
  onRemoveBookmark?: (messageId: string) => void;
  onClearAll?: () => void;
}

export function BookmarkedMessagesPanel({
  messages,
  isOpen,
  onClose,
  onSelectMessage,
  onRemoveBookmark,
  onClearAll,
}: BookmarkedMessagesPanelProps) {
  return (
    <div
      className={`fixed right-0 top-0 h-screen w-96 bg-white dark:bg-slate-900 shadow-2xl transform transition-transform duration-300 z-40 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
    >
      {/* Header */}
      <div className="sticky top-0 border-b dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-yellow-600 dark:text-yellow-400 fill-current" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Starred ({messages.length})
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages List */}
      {messages.length === 0 ? (
        <div className="p-8 text-center text-slate-500 dark:text-slate-400">
          <Bookmark className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm">No starred messages yet</p>
          <p className="text-xs mt-1">Click the star icon on messages to bookmark them</p>
        </div>
      ) : (
        <div className="overflow-y-auto h-[calc(100vh-80px)]">
          {messages.map((msg, idx) => (
            <div
              key={msg.id}
              className="border-b dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors group"
            >
              <button
                onClick={() => onSelectMessage?.(msg.id)}
                className="w-full text-left p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {/* Role badge + timestamp */}
                <div className="flex items-center justify-between mb-1.5">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      msg.role === "user"
                        ? "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
                        : "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-200"
                    }`}
                  >
                    {msg.role === "user" ? "You" : "Assistant"}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {new Date(msg.bookmarkedAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Message preview */}
                <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed">
                  {msg.content}
                </p>

                {/* Images preview */}
                {msg.images && msg.images.length > 0 && (
                  <div className="mt-2 flex gap-1">
                    {msg.images.slice(0, 2).map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt=""
                        className="w-12 h-12 rounded object-cover"
                      />
                    ))}
                    {msg.images.length > 2 && (
                      <div className="w-12 h-12 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300">
                        +{msg.images.length - 2}
                      </div>
                    )}
                  </div>
                )}
              </button>

              {/* Remove bookmark button - shown on hover */}
              <div className="px-3 pb-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onRemoveBookmark?.(msg.id)}
                  className="w-full py-1 text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors text-center"
                >
                  Remove bookmark
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer - Clear all button */}
      {messages.length > 1 && (
        <div className="sticky bottom-0 border-t dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
          <button
            onClick={onClearAll}
            className="w-full py-2 text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            Clear all bookmarks
          </button>
        </div>
      )}
    </div>
  );
}
