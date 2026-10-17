'use client';

import { createReactInlineContentSpec } from '@blocknote/react';
import { useState, useRef, useEffect, useCallback } from 'react';

function MiniCalendar({ selectedDate, onSelect, onClose, anchorEl }) {
  const ref = useRef(null);
  const [viewDate, setViewDate] = useState(() => {
    const d = selectedDate ? new Date(selectedDate) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [pos, setPos] = useState(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Position below the anchor, clamped to viewport
  useEffect(() => {
    if (!anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const calWidth = 240;
    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - calWidth - 8));
    setPos({ top: rect.bottom + 4, left });
  }, [anchorEl]);

  const { year, month } = viewDate;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const prev = () => setViewDate(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  const next = () => setViewDate(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });

  const toDateStr = (d) => `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  if (!pos) return null;

  return (
    <div
      ref={ref}
      className="fixed z-[100] rounded-xl shadow-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-default)', width: '240px', top: pos.top, left: pos.left }}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--divider)' }}>
        <button onClick={prev} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] transition-colors" style={{ color: 'var(--text-muted)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{monthName}</span>
        <button onClick={next} className="w-6 h-6 flex items-center justify-center rounded hover:bg-[var(--bg-hover)] transition-colors" style={{ color: 'var(--text-muted)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[10px] font-medium py-1" style={{ color: 'var(--text-faint)' }}>{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7 px-2 pb-2 gap-0.5">
        {days.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const dateStr = toDateStr(d);
          const isSelected = dateStr === selectedDate;
          const isToday = dateStr === todayStr;
          return (
            <button
              key={d}
              onClick={() => { onSelect(dateStr); onClose(); }}
              className="w-7 h-7 rounded-lg text-[11px] font-medium flex items-center justify-center transition-all"
              style={{
                backgroundColor: isSelected ? '#9b7bf7' : 'transparent',
                color: isSelected ? 'white' : isToday ? '#9b7bf7' : 'var(--text-body)',
                border: isToday && !isSelected ? '1px solid #9b7bf7' : '1px solid transparent',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderTop: '1px solid var(--divider)' }}>
        <button
          onClick={() => { onSelect(''); onClose(); }}
          className="text-[10px] font-medium transition-colors" style={{ color: 'var(--text-faint)' }}
        >Clear</button>
        <button
          onClick={() => { onSelect(todayStr); onClose(); }}
          className="text-[10px] font-medium transition-colors" style={{ color: '#9b7bf7' }}
        >Today</button>
      </div>
    </div>
  );
}

function DateChip({ inlineContent }) {
  const [showPicker, setShowPicker] = useState(false);
  const chipRef = useRef(null);
  const d = inlineContent.props.date;

  let formatted;
  try {
    formatted = new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    formatted = d;
  }

  const handleSelect = useCallback((newDate) => {
    if (newDate) {
      inlineContent.props.date = newDate;
    }
    setShowPicker(false);
  }, [inlineContent]);

  return (
    <span className="relative inline-flex items-center">
      <span
        ref={chipRef}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowPicker(!showPicker); }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[13px] font-medium mx-0.5 cursor-pointer transition-all hover:ring-2 hover:ring-[#9b7bf7]/30"
        style={{ color: '#9b7bf7', backgroundColor: 'rgba(155,123,247,0.06)', border: '1px solid rgba(155,123,247,0.15)' }}
        title="Click to change date (Ctrl+D to insert)"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" strokeWidth={2} /><line x1="16" y1="2" x2="16" y2="6" strokeWidth={2} /><line x1="8" y1="2" x2="8" y2="6" strokeWidth={2} /><line x1="3" y1="10" x2="21" y2="10" strokeWidth={2} /></svg>
        {formatted}
      </span>
      {showPicker && (
        <MiniCalendar
          selectedDate={d}
          onSelect={handleSelect}
          onClose={() => setShowPicker(false)}
          anchorEl={chipRef.current}
        />
      )}
    </span>
  );
}

export const DateInline = createReactInlineContentSpec(
  {
    type: 'dateInline',
    propSchema: {
      date: { default: new Date().toISOString().split('T')[0] },
    },
    content: 'none',
  },
  {
    render: (props) => <DateChip {...props} />,
  }
);
