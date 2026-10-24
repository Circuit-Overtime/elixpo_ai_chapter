const badge = (id, name, description, category, difficulty, metric, target, icon) => ({
  id,
  name,
  description,
  category,
  difficulty,
  metric,
  target,
  icon,
  artwork: `/badges/${id}.webp`,
});

export const CREATOR_BADGES = Object.freeze([
  badge('first-light', 'First Light', 'Publish your first public story.', 'Getting started', 'Easy', 'publishedStories', 1, 'sunny-outline'),
  badge('finding-a-voice', 'Finding a Voice', 'Publish three public stories.', 'Getting started', 'Easy', 'publishedStories', 3, 'megaphone-outline'),
  badge('profile-complete', 'Profile Complete', 'Add an avatar, banner, bio, and website.', 'Getting started', 'Easy', 'profileComplete', 1, 'person-circle-outline'),
  badge('topic-explorer', 'Topic Explorer', 'Publish across three distinct topics.', 'Getting started', 'Easy', 'distinctTopics', 3, 'compass-outline'),
  badge('series-starter', 'Series Starter', 'Publish three stories in one collection.', 'Getting started', 'Easy', 'largestCollection', 3, 'albums-outline'),
  badge('ten-stories', 'Ten Stories', 'Publish ten public stories.', 'Writing', 'Moderate', 'publishedStories', 10, 'documents-outline'),
  badge('prolific-creator', 'Prolific Creator', 'Publish fifty public stories.', 'Writing', 'Hard', 'publishedStories', 50, 'library-outline'),
  badge('deep-diver', 'Deep Diver', 'Publish five stories of at least seven minutes with 40% average reading depth and ten readers each.', 'Writing', 'Hard', 'deepDiveStories', 5, 'water-outline'),
  badge('consistent-creator', 'Consistent Creator', 'Publish during four distinct weeks in an eight-week period.', 'Writing', 'Moderate', 'activeWeeks8', 4, 'calendar-outline'),
  badge('unbroken-voice', 'Unbroken Voice', 'Publish during twelve consecutive weeks.', 'Writing', 'Exceptional', 'longestWeeklyStreak', 12, 'pulse-outline'),
  badge('first-hundred', 'First Hundred', 'Reach one hundred qualified unique readers.', 'Reader impact', 'Easy', 'uniqueReaders', 100, 'people-outline'),
  badge('reader-favourite', 'Reader Favourite', 'Reach one thousand qualified unique readers.', 'Reader impact', 'Moderate', 'uniqueReaders', 1000, 'heart-outline'),
  badge('wide-reach', 'Wide Reach', 'Reach ten thousand qualified unique readers.', 'Reader impact', 'Hard', 'uniqueReaders', 10000, 'globe-outline'),
  badge('headliner', 'Headliner', 'Reach one hundred thousand qualified unique readers.', 'Reader impact', 'Exceptional', 'uniqueReaders', 100000, 'radio-outline'),
  badge('worth-saving', 'Worth Saving', 'Receive fifty bookmarks from distinct readers.', 'Reader impact', 'Moderate', 'distinctBookmarks', 50, 'bookmark-outline'),
  badge('shareworthy', 'Shareworthy', 'Receive one hundred qualified shares.', 'Reader impact', 'Hard', 'qualifiedShares', 100, 'share-social-outline'),
  badge('read-to-the-end', 'Read to the End', 'Maintain 60% completion across at least five hundred qualified reads.', 'Reader impact', 'Exceptional', 'completionQualified', 1, 'checkmark-done-outline'),
  badge('returning-audience', 'Returning Audience', 'Bring back two hundred and fifty distinct readers.', 'Reader impact', 'Hard', 'returningReaders', 250, 'repeat-outline'),
  badge('first-collaboration', 'First Collaboration', 'Publish one co-authored story.', 'Collaboration', 'Easy', 'collaborativeStories', 1, 'people-circle-outline'),
  badge('creative-partner', 'Creative Partner', 'Publish five collaborations with at least three creators.', 'Collaboration', 'Moderate', 'creativePartnerQualified', 1, 'git-merge-outline'),
  badge('team-player', 'Team Player', 'Publish twenty collaborations with at least ten creators.', 'Collaboration', 'Hard', 'teamPlayerQualified', 1, 'people-outline'),
  badge('conversation-starter', 'Conversation Starter', 'Receive one hundred comments from at least twenty-five readers.', 'Community', 'Hard', 'conversationQualified', 1, 'chatbubbles-outline'),
  badge('present-author', 'Present Author', 'Reply to discussions across twenty different stories.', 'Community', 'Moderate', 'repliedStories', 20, 'return-down-forward-outline'),
  badge('publication-builder', 'Publication Builder', 'Help a publication reach twenty-five stories and three active contributors.', 'Publication', 'Hard', 'publicationBuilderQualified', 1, 'business-outline'),
  badge('staff-pick', 'Staff Pick', 'Awarded by LixBlogs for exceptional writing or community contribution.', 'Recognition', 'Exceptional', null, null, 'ribbon-outline'),
]);

export const CREATOR_BADGE_MAP = new Map(CREATOR_BADGES.map((item) => [item.id, item]));

export function longestConsecutiveWeeks(weekKeys = []) {
  const weeks = [...new Set(weekKeys)].map((value) => Number(value)).filter(Number.isFinite).sort((a, b) => a - b);
  let longest = 0;
  let current = 0;
  let previous = null;
  for (const week of weeks) {
    current = previous !== null && week === previous + 1 ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = week;
  }
  return longest;
}

export function badgeProgress(definition, metrics) {
  if (!definition.metric || definition.target == null) return { value: 0, target: null, earned: false };
  const value = Number(metrics[definition.metric] || 0);
  return { value, target: definition.target, earned: value >= definition.target };
}
