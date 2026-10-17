const GEN_URL = 'https://gen.pollinations.ai'

function modelName(row) {
  const name = String(row.model || row.model_id || '').toLowerCase()
  return ({
    'black-forest-labs/flux.1-schnell': 'flux',
    'black-forest-labs/flux.2-klein-4b': 'klein',
  })[name] || name
}

async function providerJson(path, accessToken) {
  const response = await fetch(`${GEN_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error?.message || data?.error || `Pollinations request failed (${response.status})`)
  return data
}

function rowsFrom(value) {
  if (Array.isArray(value)) return value
  for (const key of ['data', 'usage', 'rows', 'records', 'items']) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

function numberFrom(value, keys, fallback = 0) {
  for (const key of keys) {
    const number = Number(value?.[key])
    if (Number.isFinite(number)) return number
  }
  return fallback
}

export async function getPollinationsAccountSnapshot(accessToken) {
  const [balanceResult, usageResult, healthResult] = await Promise.allSettled([
    providerJson('/account/balance', accessToken),
    providerJson('/account/usage?limit=100', accessToken),
    providerJson('/v1/models/status?minutes=60', accessToken),
  ])

  if (balanceResult.status === 'rejected') throw balanceResult.reason
  const balanceData = balanceResult.value
  const balance = numberFrom(balanceData, ['pollen', 'balance', 'available', 'remaining', 'total'], undefined)
  const usageRows = usageResult.status === 'fulfilled' ? rowsFrom(usageResult.value) : []
  const imageRows = usageRows.filter((row) => ['flux', 'klein'].includes(modelName(row)))
  const usage = imageRows.reduce((total, row) => ({
    requests: total.requests + (numberFrom(row, ['requests', 'request_count', 'count']) || 1),
    promptTokens: total.promptTokens + numberFrom(row, ['prompt_tokens', 'promptTokens', 'input_tokens']),
    imageTokens: total.imageTokens + numberFrom(row, ['completion_image_tokens', 'completionImageTokens', 'image_tokens', 'output_tokens']),
    totalTokens: total.totalTokens + numberFrom(row, ['total_tokens', 'totalTokens']),
    pollenSpent: total.pollenSpent + numberFrom(row, ['cost_usd', 'cost', 'pollen', 'pollen_spent']),
  }), { requests: 0, promptTokens: 0, imageTokens: 0, totalTokens: 0, pollenSpent: 0 })
  if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.imageTokens

  const healthRows = healthResult.status === 'fulfilled' ? rowsFrom(healthResult.value) : []
  const health = ['flux', 'klein'].map((model) => {
    const row = healthRows.find((entry) => modelName(entry) === model)
    const success = numberFrom(row, ['status_2xx', 'success_count', 'successes', 'ok'])
    const serverErrors = numberFrom(row, ['errors_5xx', 'status_5xx', 'server_error_count', 'errors'])
    const total = success + serverErrors
    return {
      model,
      available: Boolean(row) && (total === 0 || success > 0),
      successRate: total ? Math.round((success / total) * 1000) / 10 : null,
      latencyMs: numberFrom(row, ['latency_p50_ms', 'latency_p50', 'p50_latency', 'latency_ms', 'avg_latency_ms']) || null,
    }
  })

  return {
    balance,
    usage,
    health,
    usageAvailable: usageResult.status === 'fulfilled',
    healthAvailable: healthResult.status === 'fulfilled',
  }
}
