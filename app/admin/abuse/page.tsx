import { redirect } from 'next/navigation';
import AbuseQueueClient, { type AbuseReport } from './AbuseQueueClient';
import { getCurrentUser } from '@/lib/auth';
import { getDB } from '@/lib/db';

export const runtime = 'edge';

export default async function AbuseQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');
  const result = await getDB().prepare(
    `SELECT id, short_code, reason, details, reporter_email, status, created_at
     FROM abuse_reports WHERE status IN ('open', 'reviewing') ORDER BY created_at ASC LIMIT 100`,
  ).all<AbuseReport>();
  return <main className="min-h-screen bg-[#faf9f7] px-5 py-12"><div className="mx-auto max-w-4xl"><p className="text-xs font-bold uppercase tracking-wider text-red-700">Administrator</p><h1 className="mt-2 mb-8 text-3xl font-extrabold">Abuse review queue</h1><AbuseQueueClient reports={result.results} /></div></main>;
}
