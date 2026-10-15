// Tier limits for free and member accounts

export const TIER_LIMITS = {
  free: {
    totalStorageBytes: 10 * 1024 * 1024,       // 10 MB managed storage
    imagePerBlogBytes: 2 * 1024 * 1024,         // 2 MB total images per blog
    aiRequestsPerDay: 15,
    coAuthorsPerBlog: 3,
    ownedOrgs: 1,
    canReadMemberOnly: false,
    canMarkMemberOnly: false,
    canUseSubpages: false,
  },
  member: {
    totalStorageBytes: 2 * 1024 * 1024 * 1024,  // 2 GB
    imagePerBlogBytes: 10 * 1024 * 1024,         // 10 MB total images per blog
    aiRequestsPerDay: 50,
    coAuthorsPerBlog: 5,
    ownedOrgs: 5,
    canReadMemberOnly: true,
    canMarkMemberOnly: true,
    canUseSubpages: true,
  },
};

export function getLimits(tier) {
  return Object.hasOwn(TIER_LIMITS, tier) ? TIER_LIMITS[tier] : TIER_LIMITS.free;
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.max(0, Math.floor(Math.log(bytes) / Math.log(1024))), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
