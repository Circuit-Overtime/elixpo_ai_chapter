const MB = 1024 * 1024

export const PLAN_LIMITS = Object.freeze({
  guest: Object.freeze({
    workspaces: 1,
    imageBytesPerWorkspace: 2 * MB,
    collaborators: 1,
    pdfExport: false,
  }),
  free: Object.freeze({
    workspaces: 2,
    imageBytesPerWorkspace: 5 * MB,
    collaborators: 3,
    pdfExport: false,
  }),
  pro: Object.freeze({
    workspaces: 10,
    imageBytesPerWorkspace: 10 * MB,
    collaborators: 5,
    pdfExport: true,
  }),
})

export function normalizePlanTier(tier, authenticated = false) {
  if (tier === 'pro' || tier === 'team') return 'pro'
  if (tier === 'free' || authenticated) return 'free'
  return 'guest'
}

export function getPlanLimits(tier, authenticated = false) {
  return PLAN_LIMITS[normalizePlanTier(tier, authenticated)]
}

export function formatMegabytes(bytes) {
  return `${Math.round(bytes / MB)} MB`
}
