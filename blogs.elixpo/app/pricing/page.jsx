import PricingPage from '../../src/views/PricingPage';

export const metadata = {
  title: 'Pricing',
  description: 'Compare LixBlogs publishing plans, storage, collaboration limits, and creator features.',
  alternates: { canonical: 'https://blogs.elixpo.com/pricing' },
};

export default function Pricing() {
  return <PricingPage />;
}
