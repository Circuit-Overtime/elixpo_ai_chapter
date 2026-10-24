'use client';

/**
 * Shared tab bar with icons, spacing, and hover pill effects.
 *
 * @param {Array} tabs - Array of { label, icon?, count? } or just strings
 * @param {number|string} active - Active tab index or key
 * @param {function} onChange - Called with index or key when tab is clicked
 * @param {string} [keyField] - If set, uses tab[keyField] instead of index for active/onChange
 */
export default function TabBar({ tabs, active, onChange, keyField }) {
  return (
    <div className="flex gap-1 border-b border-[var(--border-default)] mb-8 overflow-x-auto scrollbar-none">
      {tabs.map((tab, i) => {
        const isObj = typeof tab === 'object';
        const label = isObj ? tab.label : tab;
        const icon = isObj ? tab.icon : null;
        const count = isObj ? tab.count : undefined;
        const key = keyField && isObj ? tab[keyField] : i;
        const isActive = active === key;

        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`
              relative flex items-center gap-2 px-3.5 py-2.5 text-[13px] font-medium rounded-t-lg
              transition-all duration-150 whitespace-nowrap flex-shrink-0
              ${isActive
                ? 'text-[var(--text-primary)] bg-[var(--bg-hover)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }
            `}
          >
            {/* Icon */}
            {icon && (
              <span className={`text-[15px] transition-colors ${isActive ? 'text-[#9b7bf7]' : 'text-[var(--text-faint)]'}`}>
                {typeof icon === 'string' ? <ion-icon name={icon} /> : icon}
              </span>
            )}

            {/* Label */}
            {label}

            {/* Count badge */}
            {count !== undefined && (
              <span className={`text-[11px] px-1.5 py-0 rounded-full font-medium ${
                isActive ? 'bg-[#9b7bf720] text-[#9b7bf7]' : 'bg-[var(--bg-elevated)] text-[var(--text-faint)]'
              }`}>
                {count}
              </span>
            )}

            {/* Active indicator bar */}
            {isActive && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[var(--accent)] rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}
