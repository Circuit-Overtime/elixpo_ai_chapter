import { useEffect, useState } from "react";
import type { DisplayMessage } from "./use-chat";

export interface BookmarkedMessage extends DisplayMessage {
  bookmarkedAt: number; // Timestamp when bookmarked
}

const BOOKMARK_KEY = "elixpo_bookmarks";

/**
 * Hook to manage bookmarked messages in localStorage
 */
export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Map<string, BookmarkedMessage>>(new Map());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load bookmarks from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(BOOKMARK_KEY);
      if (raw) {
        const data: Array<[string, BookmarkedMessage]> = JSON.parse(raw);
        setBookmarks(new Map(data));
      }
    } catch {
      console.warn("Failed to load bookmarks from localStorage");
    }
    setIsLoaded(true);
  }, []);

  // Save bookmarks to localStorage whenever they change
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const data = Array.from(bookmarks.entries());
      localStorage.setItem(BOOKMARK_KEY, JSON.stringify(data));
    } catch {
      console.warn("Failed to save bookmarks to localStorage");
    }
  }, [bookmarks, isLoaded]);

  const toggleBookmark = (message: DisplayMessage) => {
    setBookmarks((prev) => {
      const next = new Map(prev);
      if (next.has(message.id)) {
        next.delete(message.id);
      } else {
        next.set(message.id, {
          ...message,
          bookmarkedAt: Date.now(),
        });
      }
      return next;
    });
  };

  const addBookmark = (message: DisplayMessage) => {
    setBookmarks((prev) => {
      const next = new Map(prev);
      if (!next.has(message.id)) {
        next.set(message.id, {
          ...message,
          bookmarkedAt: Date.now(),
        });
      }
      return next;
    });
  };

  const removeBookmark = (messageId: string) => {
    setBookmarks((prev) => {
      const next = new Map(prev);
      next.delete(messageId);
      return next;
    });
  };

  const isBookmarked = (messageId: string): boolean => {
    return bookmarks.has(messageId);
  };

  const getBookmarkedMessages = (): BookmarkedMessage[] => {
    return Array.from(bookmarks.values()).sort(
      (a, b) => b.bookmarkedAt - a.bookmarkedAt
    );
  };

  const clearAllBookmarks = () => {
    setBookmarks(new Map());
  };

  return {
    bookmarks,
    toggleBookmark,
    addBookmark,
    removeBookmark,
    isBookmarked,
    getBookmarkedMessages,
    clearAllBookmarks,
    isLoaded,
  };
}
