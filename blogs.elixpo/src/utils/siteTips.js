export const SITE_TIPS = [
  'Press Ctrl or Cmd + S in the editor to save immediately.',
  'Add up to five focused topics so the right readers can discover your story.',
  'Use a punchline to make your story easier to understand in the feed and search.',
  'Invite co-authors from Publish settings when a story needs a second pair of eyes.',
  'Your reading list keeps useful stories ready for later.',
  'A descriptive cover and title make shared links easier to recognize.',
  'Preview your post before publishing to catch layout surprises.',
];

export const PROFILE_AGE_STAGES = {
  guest: { label: 'Discover LixBlogs', minDays: null, maxDays: null },
  newcomer: { label: 'Getting started', minDays: 0, maxDays: 14 },
  growing: { label: 'Build your writing habit', minDays: 15, maxDays: 89 },
  established: { label: 'Grow your publication', minDays: 90, maxDays: 364 },
  veteran: { label: 'Creator workflow', minDays: 365, maxDays: null },
};

export function profileAgeStage(user, now = Date.now()) {
  const createdAt = Number(user?.created_at || user?.createdAt || 0);
  if (!createdAt) return user ? 'newcomer' : 'guest';
  const ageDays = Math.max(0, (now - createdAt * 1000) / 86_400_000);
  if (ageDays <= PROFILE_AGE_STAGES.newcomer.maxDays) return 'newcomer';
  if (ageDays <= PROFILE_AGE_STAGES.growing.maxDays) return 'growing';
  if (ageDays <= PROFILE_AGE_STAGES.established.maxDays) return 'established';
  return 'veteran';
}

export const LOADING_MESSAGES_BY_STAGE = {
  guest: [
    { text: 'Explore public stories, writers, organizations, and live writing contests.' },
    { text: 'LixBlogs supports rich stories, live collaboration, and publishing from the web, CLI, or API.' },
    { text: 'LixBlogs is built in public and shaped by its community.', action: 'Star the project', href: 'https://github.com/elixpo/blogs.elixpo' },
  ],
  newcomer: [
    { text: 'Complete your profile so readers can recognize the person behind your stories.', action: 'Complete profile', href: '/settings?tab=account' },
    { text: 'Add focused topics to your first story so the right readers can discover it.' },
    { text: 'Type / on an empty editor line to discover every available block.' },
    { text: 'Preview your first post before publishing to catch layout surprises.' },
  ],
  growing: [
    { text: 'Invite a co-author or reviewer when a draft needs a second pair of eyes.' },
    { text: 'Version history lets you inspect and restore an earlier cloud-saved draft.' },
    { text: 'Use a focused title, punchline, cover, and topics to improve discovery.' },
    { text: 'A live writing contest can help your next story reach a focused audience.', action: 'View contests', href: '/contests' },
  ],
  established: [
    { text: 'Creator analytics can show which topics and stories retain your readers.', action: 'View analytics', href: '/settings/stats' },
    { text: 'Organizations and collections can turn related stories into a recognizable publication.' },
    { text: 'Connect personal media storage to keep a growing archive under your control.', action: 'Open integrations', href: '/settings?tab=Integrations' },
    { text: 'The CLI can turn a repeatable writing workflow into a documented command.', action: 'CLI docs', href: '/docs/cli' },
  ],
  veteran: [
    { text: 'Personal access tokens let trusted workflows publish without an interactive login.', action: 'API settings', href: '/settings?tab=API' },
    { text: 'Host a writing contest when you want the community to explore one focused prompt.', action: 'Create contest', href: '/contests/new' },
    { text: 'Curate public work into collections while preserving author attribution and licensing.' },
    { text: 'Use analytics exports to compare long-term topic and publication performance.', action: 'View analytics', href: '/settings/stats' },
  ],
};

// Kept as a flat export for callers that do not have profile context.
export const LOADING_MESSAGES = LOADING_MESSAGES_BY_STAGE.guest;

export function loadingMessageForProfile(user, now = Date.now()) {
  const stage = profileAgeStage(user, now);
  const pool = LOADING_MESSAGES_BY_STAGE[stage] || LOADING_MESSAGES_BY_STAGE.guest;
  const day = Math.floor(now / 86_400_000);
  const seed = String(user?.id || user?.username || stage)
    .split('')
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return { stage, label: PROFILE_AGE_STAGES[stage].label, message: pool[(day + seed) % pool.length] };
}

export const ONBOARDING_TIP_DAYS = 14;

export function tipForDay(seed = '') {
  const day = Math.floor(Date.now() / 86_400_000);
  const seedValue = String(seed).split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return { day, tip: SITE_TIPS[(day + seedValue) % SITE_TIPS.length] };
}
