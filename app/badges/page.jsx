import BadgesPage from '../../src/views/BadgesPage';

export const metadata = {
  title: 'Creator Badges',
  description: 'Learn how LixBlogs creator badges are earned, displayed, and protected from artificial engagement.',
  alternates: { canonical: 'https://blogs.elixpo.com/badges' },
};

export default function Badges() {
  return <BadgesPage />;
}
