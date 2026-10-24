import BadgesPage from '../../src/views/BadgesPage';
import { staticPageMeta } from '../../lib/pageMeta';

export const metadata = staticPageMeta({
  title: 'Creator Badges',
  description: 'Learn how LixBlogs creator badges are earned, displayed, and protected from artificial engagement.',
  path: '/badges',
});

export default function Badges() {
  return <BadgesPage />;
}
