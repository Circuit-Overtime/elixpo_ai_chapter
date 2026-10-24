import StatsPage from '../../../src/views/StatsPage';

export const metadata = {
  title: 'Stats',
  description: 'Author analytics — track views, reads, engagement, and audience growth on LixBlogs.',
  robots: { index: false, follow: false },
};

export default function SettingsStats() {
  return <StatsPage />;
}
