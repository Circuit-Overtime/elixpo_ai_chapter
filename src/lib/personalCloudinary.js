export async function testCloudinaryOAuthConnection({ cloudName, oauthToken }) {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/resources/image?max_results=1`,
    { headers: { Authorization: `Bearer ${oauthToken}`, Accept: 'application/json' } },
  )
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Cloudinary rejected the connection (${response.status}): ${detail.slice(0, 180)}`)
  }
}

export async function getPersonalCloudinaryUsage({ cloudName, oauthToken }) {
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/usage`,
    { headers: { Authorization: `Bearer ${oauthToken}`, Accept: 'application/json' } },
  )
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    throw new Error(data?.error?.message || `Cloudinary usage lookup failed (${response.status})`)
  }

  const usedBytes = Number(data.storage?.usage)
  const limitBytes = Number(data.storage?.limit)
  const creditUsage = Number(data.credits?.usage)
  const creditLimit = Number(data.credits?.limit)
  const hasStorageUsage = Number.isFinite(usedBytes) && usedBytes >= 0
  const hasStorageLimit = Number.isFinite(limitBytes) && limitBytes > 0
  const hasCreditLimit = Number.isFinite(creditUsage) && creditUsage >= 0
    && Number.isFinite(creditLimit) && creditLimit > 0

  if (!hasStorageUsage && !hasCreditLimit) throw new Error('Cloudinary did not return usage data')

  return {
    mode: hasStorageLimit ? 'storage' : hasCreditLimit ? 'credits' : 'storage-used',
    usedBytes: hasStorageUsage ? usedBytes : 0,
    limitBytes: hasStorageLimit ? limitBytes : null,
    remainingBytes: hasStorageLimit ? Math.max(0, limitBytes - usedBytes) : null,
    creditUsage: hasCreditLimit ? creditUsage : null,
    creditLimit: hasCreditLimit ? creditLimit : null,
    remainingCredits: hasCreditLimit ? Math.max(0, creditLimit - creditUsage) : null,
    usedPercent: hasStorageLimit
      ? (Number.isFinite(Number(data.storage?.used_percent))
          ? Number(data.storage.used_percent)
          : Math.min(100, (usedBytes / limitBytes) * 100))
      : hasCreditLimit
        ? (Number.isFinite(Number(data.credits?.used_percent))
            ? Number(data.credits.used_percent)
            : Math.min(100, (creditUsage / creditLimit) * 100))
        : null,
    plan: data.plan || null,
    lastUpdated: data.last_updated || null,
  }
}

export async function uploadToPersonalCloudinary(file, { cloudName, oauthToken, folder, publicId }) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('folder', folder)
  formData.append('public_id', publicId)
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${oauthToken}` },
      body: formData,
    },
  )
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.secure_url) {
    throw new Error(data?.error?.message || `Cloudinary upload failed (${response.status})`)
  }
  return data
}

export async function deleteFromPersonalCloudinary(publicId, { cloudName, oauthToken }) {
  const formData = new FormData()
  formData.append('public_id', publicId)
  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${oauthToken}` },
      body: formData,
    },
  )
  if (!response.ok) throw new Error(`Cloudinary delete failed (${response.status})`)
  return response.json()
}
