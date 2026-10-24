import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import AppShell from '../../../src/components/AppShell';
import ContestCreateForm from '../../../src/components/contests/ContestCreateForm';

export const runtime = 'edge';
export const metadata = { title: 'Create a writing contest', robots: { index: false, follow: false } };

export default async function NewContestPage() {
  const session = await getSession().catch(() => null);
  if (!session?.userId) redirect('/sign-in?next=%2Fcontests%2Fnew');
  return <AppShell><ContestCreateForm organizer={{
    username: session.profile?.username,
    displayName: session.profile?.display_name,
    avatarUrl: session.profile?.avatar_url,
  }} /></AppShell>;
}
