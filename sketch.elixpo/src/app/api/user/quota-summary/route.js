import { NextResponse } from 'next/server'
import { getCloudflareBindings } from '@/lib/cloudflare'
import { getPlanLimits, normalizePlanTier } from '@/lib/planLimits'

export const runtime = 'edge'

const AI_LIMITS = {
  guest: 5,
  free: 10,
  pro: 50,
}

export async function GET(request) {
  try {
    const { DB } = getCloudflareBindings()
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    const guestId = url.searchParams.get('guestId')

    if (!userId && !guestId) {
      return NextResponse.json({ error: 'Missing userId or guestId' }, { status: 400 })
    }

    const identifier = userId || guestId
    const ownerType = userId ? 'user' : 'guest'

    // Get tier
    let tier = 'guest'
    let email = null
    let displayName = null
    if (userId) {
      const user = await DB.prepare(
        `SELECT tier, email, display_name FROM users WHERE id = ?`
      ).bind(userId).first()
      tier = user?.tier || 'free'
      email = user?.email || null
      displayName = user?.display_name || null
    }

    // AI usage today
    const aiCol = userId ? 'user_id' : 'guest_id'
    const aiResult = await DB.prepare(
      `SELECT COUNT(*) as count FROM ai_usage
       WHERE ${aiCol} = ? AND used_at >= date('now')`
    ).bind(identifier).first()
    const aiUsed = aiResult?.count || 0
    const aiLimit = AI_LIMITS[tier] ?? 10

    // Workspace count
    const wsResult = await DB.prepare(
      `SELECT COUNT(*) as count FROM scenes
       WHERE created_by = ? AND owner_type = ?`
    ).bind(identifier, ownerType).first()
    const workspaceCount = wsResult?.count || 0
    const normalizedTier = normalizePlanTier(tier, Boolean(userId))
    const limits = getPlanLimits(normalizedTier)
    const workspaceLimit = limits.workspaces

    // Keep the enforced per-workspace figure and also expose the account-wide
    // total so profile storage can show the user's complete managed allowance.
    const storageResult = await DB.prepare(
      `SELECT COALESCE(MAX(workspace_bytes), 0) AS fullest,
              COALESCE(SUM(workspace_bytes), 0) AS total
       FROM (
         SELECT COALESCE(SUM(ia.size_bytes), 0) AS workspace_bytes
         FROM (
           SELECT DISTINCT session_id FROM scenes
           WHERE created_by = ? AND owner_type = ?
         ) owned
         LEFT JOIN image_assets ia ON ia.session_id = owned.session_id
           AND ia.status = 'complete' AND ia.storage_provider = 'platform_cloudinary'
         GROUP BY owned.session_id
       )`
    ).bind(identifier, ownerType).first()
    const storageUsed = Number(storageResult?.fullest || 0)
    const accountStorageUsed = Number(storageResult?.total || 0)
    const accountStorageLimit = limits.imageBytesPerWorkspace * workspaceLimit

    return NextResponse.json({
      tier,
      email,
      displayName,
      isGuest: !userId,
      ai: {
        used: aiUsed,
        limit: aiLimit === -1 ? 'unlimited' : aiLimit,
        remaining: aiLimit === -1 ? 'unlimited' : Math.max(0, aiLimit - aiUsed),
      },
      workspaces: {
        used: workspaceCount,
        limit: workspaceLimit,
      },
      storage: {
        usedBytes: storageUsed,
        limitBytes: limits.imageBytesPerWorkspace,
        perWorkspace: true,
        accountUsedBytes: accountStorageUsed,
        accountLimitBytes: accountStorageLimit,
        accountRemainingBytes: Math.max(0, accountStorageLimit - accountStorageUsed),
      },
      collaboration: { maxParticipants: limits.collaborators },
      exports: { pdf: limits.pdfExport },
    })
  } catch (err) {
    console.error('[api/user/quota-summary] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch quota summary' }, { status: 500 })
  }
}
