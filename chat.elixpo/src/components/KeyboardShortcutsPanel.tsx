"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

const SHORTCUTS = [
  { key: "Ctrl+K", desc: "Show keyboard shortcuts" },
  { key: "Ctrl+N", desc: "New chat" },
  { key: "Ctrl+/", desc: "Focus search" },
  { key: "Esc", desc: "Close shortcuts panel" },
  { key: "?", desc: "Toggle help (when focussed)" },
];

export default function KeyboardShortcutsPanel() {
  const [isOpen, setIsOpen] = useState(false);

  // Handle Ctrl+K and Esc
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K to open shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }

      // Esc to close shortcuts
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-96 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-neutral-100">
          <h2 className="text-lg font-bold text-neutral-900">Keyboard Shortcuts</h2>
          <p className="text-xs text-neutral-500 mt-1">Use these shortcuts for faster navigation</p>
        </div>

        {/* Shortcuts List */}
        <div className="overflow-y-auto flex-1 px-6 py-4">
          <div className="space-y-3">
            {SHORTCUTS.map((shortcut, i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <p className="text-sm text-neutral-600">{shortcut.desc}</p>
                <kbd className="px-3 py-1.5 rounded-lg bg-neutral-100 border border-neutral-200 text-xs font-mono font-semibold text-neutral-700 whitespace-nowrap">
                  {shortcut.key}
                </kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-neutral-100 bg-neutral-50">
          <button
            onClick={() => setIsOpen(false)}
            className="w-full px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors cursor-pointer"
          >
            Close (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
