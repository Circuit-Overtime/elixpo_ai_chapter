export const docsNav = [
  {
    title: 'Using LixBlogs',
    items: [
      { title: 'Overview', slug: 'overview', description: 'Learn how publishing, profiles, organizations, and discovery work.' },
      { title: 'Write and publish', slug: 'writing-publishing', description: 'Create, preview, publish, update, and control the visibility of a story.' },
      { title: 'Collaboration', slug: 'collaboration', description: 'Invite co-authors and edit a story together safely.' },
      { title: 'Media and storage', slug: 'media-storage', description: 'Upload, track, replace, and delete covers and editor images.' },
      { title: 'Creator analytics', slug: 'creator-analytics', description: 'Read creator metrics, compare date ranges, and export reports.' },
      { title: 'Curated collections', slug: 'collections', description: 'Curate public stories while preserving authorship, canonical ownership, and licenses.' },
      { title: 'Writing contests', slug: 'contests', description: 'Create contests, submit immutable blog revisions, judge entries, and publish results.' },
      { title: 'LixBlogs CLI', slug: 'cli', description: 'Authenticate, write, publish, and automate through the supported command line.' },
      { title: 'API automation', slug: 'api', description: 'Create scoped access tokens and automate publishing through the versioned API.' },
    ],
  },
  {
    title: 'Connected Services',
    items: [
      { title: 'Integrations overview', slug: 'integrations', description: 'Connect services, understand permissions, and disconnect them safely.' },
      { title: 'Cloudinary storage', slug: 'cloudinary', description: 'Store new blog media in your own Cloudinary product environment.' },
      { title: 'LixRL short links', slug: 'lixrl', description: 'Create account-owned lixrl.com links from the editor.' },
      { title: 'Pollinations images', slug: 'pollinations', description: 'Generate blog images with your own Pollen balance and scoped authorization.' },
    ],
  },
  {
    title: 'Find and manage content',
    items: [
      { title: 'Search qualifiers', slug: 'search-syntax', description: 'Use filters and GitHub-style qualifiers to find stories.' },
    ],
  },
  {
    title: 'LixEditor Developers',
    items: [
      { title: 'LixEditor Developer Guide', slug: 'lixeditor', description: 'Overview, installation, quick start, props, imperative API, block model, markdown shortcuts, and rendering.' },
    ],
  },
];

export const docsNavFlat = docsNav.flatMap((section) => section.items);

export function getDocsSiblings(slug) {
  const flat = docsNavFlat;
  const i = flat.findIndex((item) => item.slug === slug);
  return { prev: flat[i - 1] || null, next: flat[i + 1] || null };
}
