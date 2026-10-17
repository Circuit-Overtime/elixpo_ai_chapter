import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Stats',
  robots: { index: false, follow: false },
};

export default function Stats() {
  redirect('/settings/stats');
}
