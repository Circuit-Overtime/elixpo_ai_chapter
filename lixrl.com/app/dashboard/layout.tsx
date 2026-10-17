export const runtime = 'edge';

import { redirect } from 'next/navigation';
import Sidebar from '@/app/components/Sidebar';
import { getCurrentUser } from '@/lib/auth';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  return (
    <div className="theme-light min-h-screen bg-white">
      <div className="relative">
        <Sidebar user={user} />
        <main className="px-4 sm:px-8 pb-4 sm:pb-8 pt-20 sm:pt-24">
          {children}
        </main>
      </div>
    </div>
  );
}
