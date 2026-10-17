'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/app/components/Modal';
import type { UrlRecord } from '@/lib/types';

interface Props {
  urls: UrlRecord[];
  page: number;
  totalPages: number;
  search: string;
  status: string;
}

const COL_HEAD =
  'text-left text-[0.7rem] text-white/45 uppercase tracking-wider pb-3 font-semibold';

export default function UrlsListClient({
  urls,
  page,
  totalPages,
  search,
  status,
}: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const allSelected =
    urls.length > 0 && urls.every((u) => selected.has(u.short_code));

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(urls.map((u) => u.short_code)));
    }
  };

  const toggleOne = (code: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    setDeleting(true);
    try {
      await fetch('/api/urls/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: Array.from(selected) }),
      });
      setSelected(new Set());
      setConfirmOpen(false);
      // Refresh server data
      router.refresh();
    } finally {
      setDeleting(false);
    }
  };

  // Build pagination URLs that preserve search + status
  const paramsString = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (status && status !== 'all') p.set('status', status);
    return p.toString();
  }, [search, status]);

  return (
    <>
      {/* Selection toolbar — slides above the table when any rows are picked */}
      {selected.size > 0 && (
        <div
          className="flex items-center justify-between gap-3 mb-3 p-3 rounded-lg"
          style={{
            background: 'rgba(229,57,53,0.08)',
            border: '1px solid rgba(229,57,53,0.3)',
          }}
        >
          <div className="text-sm text-white/85">
            <span className="font-semibold text-white">
              {selected.size}
            </span>{' '}
            selected
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-white/55 hover:text-white px-3 py-1.5"
              style={{ background: 'transparent', border: 'none' }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all"
              style={{
                background:
                  'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
                boxShadow: '0 4px 14px rgba(239,68,68,0.35)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-2 14a2 2 0 01-2 2H9a2 2 0 01-2-2L5 6" />
              </svg>
              Delete {selected.size}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px]">
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(0,0,0,0.10)' }}>
              <th className="w-8 pb-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label="Select all"
                  className="cursor-pointer"
                  style={{ accentColor: '#e53935' }}
                />
              </th>
              <th className={COL_HEAD}>Code</th>
              <th className={COL_HEAD}>Destination</th>
              <th className={COL_HEAD}>Title</th>
              <th className={COL_HEAD}>Clicks</th>
              <th className={COL_HEAD}>Status</th>
              <th className={COL_HEAD}>Created</th>
            </tr>
          </thead>
          <tbody>
            {urls.length > 0 ? (
              urls.map((u) => (
                <tr
                  key={u.short_code}
                  style={{
                    borderBottom: '1px solid rgba(0,0,0,0.05)',
                    background: selected.has(u.short_code)
                      ? 'rgba(229,57,53,0.04)'
                      : 'transparent',
                  }}
                >
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(u.short_code)}
                      onChange={() => toggleOne(u.short_code)}
                      aria-label={`Select ${u.short_code}`}
                      className="cursor-pointer"
                      style={{ accentColor: '#e53935' }}
                    />
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/dashboard/urls/${u.short_code}`}
                      className="text-[#c62828] text-sm font-mono font-semibold no-underline hover:underline"
                    >
                      /{u.short_code}
                    </Link>
                  </td>
                  <td className="py-3 text-sm text-white/65 max-w-[280px] truncate">
                    {u.original_url}
                  </td>
                  <td className="py-3 text-sm text-white/55">
                    {u.title || '—'}
                  </td>
                  <td className="py-3 text-sm font-semibold text-white">
                    {u.clicks}
                  </td>
                  <td className="py-3">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[0.65rem] font-bold uppercase tracking-wider"
                      style={
                        u.is_active
                          ? {
                              background: 'rgba(34,197,94,0.1)',
                              color: '#86efac',
                              border: '1px solid rgba(34,197,94,0.3)',
                            }
                          : {
                              background: 'rgba(239,68,68,0.1)',
                              color: '#f87171',
                              border: '1px solid rgba(239,68,68,0.3)',
                            }
                      }
                    >
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="py-3 text-sm text-white/45">
                    {new Date(u.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={7}
                  className="py-12 text-center text-white/45 text-sm"
                >
                  {search || status !== 'all'
                    ? 'No URLs match those filters'
                    : 'No URLs yet'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center mt-4">
          {page > 1 && (
            <Link
              href={`/dashboard/urls?${
                paramsString ? `${paramsString}&` : ''
              }page=${page - 1}`}
              className="px-3 py-1.5 rounded-lg text-xs no-underline transition-colors text-white/75"
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.12)',
              }}
            >
              ← Prev
            </Link>
          )}
          <span className="text-xs text-white/45 px-3 py-1.5">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/dashboard/urls?${
                paramsString ? `${paramsString}&` : ''
              }page=${page + 1}`}
              className="px-3 py-1.5 rounded-lg text-xs no-underline transition-colors text-white/75"
              style={{
                background: 'rgba(0,0,0,0.05)',
                border: '1px solid rgba(0,0,0,0.12)',
              }}
            >
              Next →
            </Link>
          )}
        </div>
      )}

      {/* Bulk delete confirm */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !deleting && setConfirmOpen(false)}
        onConfirm={handleBulkDelete}
        title={`Delete ${selected.size} link${selected.size === 1 ? '' : 's'}?`}
        description="The short links will stop redirecting immediately and their analytics will be lost. This cannot be undone."
        confirmLabel={`Delete ${selected.size}`}
        variant="danger"
        loading={deleting}
      />
    </>
  );
}
