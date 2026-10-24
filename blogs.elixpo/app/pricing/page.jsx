import PricingPage from '../../src/views/PricingPage';
import { staticPageMeta } from '../../lib/pageMeta';

export const metadata = staticPageMeta({
  title: 'Pricing',
  description: 'Compare LixBlogs publishing plans, storage, collaboration limits, and creator features.',
  path: '/pricing',
});

export default function Pricing() {
  return <PricingPage />;
}
