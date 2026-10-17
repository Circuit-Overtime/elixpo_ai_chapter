'use client';

import { useEffect, useRef } from 'react';

export default function AICommandMenu({ position, onSubmit, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'Enter') {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'absolute',
        top: position?.top ?? 0,
        left: 0,
        right: 0,
        zIndex: 100,
      }}
    >
      <div className="ai-inline-input-container">
        <div className="flex items-center gap-2.5 px-3 py-2">
          <div className="flex-shrink-0 w-6 h-6 rounded-full overflow-hidden opacity-60">
            <img src="/logo-mark.png" alt="AI" className="w-full h-full object-cover" />
          </div>
          <div className="flex-1 flex items-center gap-2">
            <span className="text-[14px] text-[var(--text-secondary)]">AI features are coming soon</span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
              style={{ color: '#9b7bf7', backgroundColor: 'rgba(155, 123, 247, 0.12)', border: '1px solid rgba(155, 123, 247, 0.3)' }}
            >
              Coming soon
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-[12px] text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors"
          >
            Esc
          </button>
        </div>
      </div>
    </div>
  );
}
