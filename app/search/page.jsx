import { Suspense } from 'react';
import SearchPage from '../../src/views/SearchPage';

export const metadata = {
  title: 'Search',
  description: 'Search blogs, people, and organizations on LixBlogs.',
  // Search results are an unbounded, crawlable query space and carry no standalone
  // value in an index — keep them out of it, but let crawlers follow through to the
  // real pages they link to.
  robots: { index: false, follow: true },
};

// This static route takes precedence over the app/[...path] catch-all, which would
// otherwise read "search" as a profile handle.
export default function Search() {
  return (
    // useSearchParams needs a Suspense boundary, or the whole route opts out of
    // static rendering at build time.
    <Suspense fallback={null}>
      <SearchPage />
    </Suspense>
  );
}
