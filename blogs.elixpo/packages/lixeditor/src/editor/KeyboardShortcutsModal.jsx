'use client';

import { useEffect, useRef } from 'react';

const SHORTCUT_GROUPS = [
  {
    title: 'General',
    shortcuts: [
      { keys: ['Ctrl', 'S'], desc: 'Save & sync to cloud' },
      { keys: ['Ctrl', 'O'], desc: 'Import markdown file (.md)' },
      { keys: ['Ctrl', 'Shift', 'I'], desc: 'Invite collaborators' },
      { keys: ['Ctrl', 'D'], desc: 'Insert date chip' },
      { keys: ['Ctrl', 'Shift', 'P'], desc: 'Toggle editor / preview' },
      { keys: ['Ctrl', 'Z'], desc: 'Undo' },
      { keys: ['Ctrl', 'Shift', 'Z'], desc: 'Redo' },
      { keys: ['Ctrl', 'A'], desc: 'Select all' },
      { keys: ['?'], desc: 'Show this help' },
    ],
  },
  {
    title: 'Text Formatting',
    shortcuts: [
      { keys: ['Ctrl', 'B'], desc: 'Bold' },
      { keys: ['Ctrl', 'I'], desc: 'Italic' },
      { keys: ['Ctrl', 'U'], desc: 'Underline' },
      { keys: ['Ctrl', 'E'], desc: 'Code (inline)' },
      { keys: ['Ctrl', 'Shift', 'S'], desc: 'Strikethrough' },
      { keys: ['Ctrl', 'K'], desc: 'Add link' },
    ],
  },
  {
    title: 'Blocks',
    shortcuts: [
      { keys: ['/'], desc: 'Slash commands menu' },
      { keys: ['Space'], desc: 'AI assistant (on empty line)' },
      { keys: ['@'], desc: 'Mention user/blog/org' },
      { keys: ['Tab'], desc: 'Indent block' },
      { keys: ['Shift', 'Tab'], desc: 'Outdent block' },
      { keys: ['Enter'], desc: 'New block' },
      { keys: ['Backspace'], desc: 'Delete block (when empty)' },
    ],
  },
  {
    title: 'AI',
    shortcuts: [
      { keys: ['Space'], desc: 'Open AI prompt (empty line)' },
      { keys: ['★', 'click'], desc: 'AI edit selected text' },
      { keys: ['Esc'], desc: 'Cancel AI / close menu' },
    ],
  },
];

export default function KeyboardShortcutsModal({ onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div
        ref={ref}
        className="w-full max-w-[520px] max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--divider)' }}>
          <div className="flex items-center gap-2.5">
            <ion-icon name="keypad-outline" style={{ fontSize: '18px', color: '#9b7bf7' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="transition-colors p-1"
            style={{ color: 'var(--text-faint)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(80vh-60px)] p-6 space-y-6 scrollbar-thin">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#9b7bf7' }}>{group.title}</h3>
              <div className="space-y-1">
                {group.shortcuts.map((s, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <span className="text-[13px]" style={{ color: 'var(--text-body)' }}>{s.desc}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key, j) => (
                        <span key={j}>
                          {j > 0 && <span className="text-[10px] mx-0.5" style={{ color: 'var(--text-faint)' }}>+</span>}
                          <kbd
                            className="inline-block min-w-[24px] text-center px-1.5 py-0.5 text-[11px] font-medium rounded-md"
                            style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
                          >
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
