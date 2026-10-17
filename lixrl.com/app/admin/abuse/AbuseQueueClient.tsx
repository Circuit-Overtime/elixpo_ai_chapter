'use client';

import { useState } from 'react';

export interface AbuseReport {
  id: number;
  short_code: string;
  reason: string;
  details: string;
  reporter_email: string | null;
  status: string;
  created_at: string;
}

export default function AbuseQueueClient({ reports }: { reports: AbuseReport[] }) {
  const [items, setItems] = useState(reports);
  async function review(id: number, status: string, quarantine: boolean) {
    const response = await fetch(`/api/admin/abuse/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, quarantine }),
    });
    if (response.ok) setItems((current) => current.filter((report) => report.id !== id));
  }
  return <div className="space-y-4">{items.length === 0 && <p className="text-black/60">No open reports.</p>}{items.map((report) => (
    <article key={report.id} className="rounded-xl border border-black/10 bg-white p-5">
      <div className="flex flex-wrap items-center gap-2"><code className="font-bold">/{report.short_code}</code><span className="rounded-full bg-red-50 px-2 py-1 text-xs font-bold text-red-700">{report.reason}</span><span className="ml-auto text-xs text-black/50">{report.created_at}</span></div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-black/75">{report.details}</p>
      {report.reporter_email && <p className="mt-2 text-xs text-black/50">Reporter: {report.reporter_email}</p>}
      <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => review(report.id, 'resolved', true)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white">Quarantine link</button><button onClick={() => review(report.id, 'dismissed', false)} className="rounded-lg border border-black/15 px-3 py-2 text-xs font-bold">Dismiss report</button></div>
    </article>
  ))}</div>;
}
