/**
 * lixblogs integrations cloudinary status
 *
 * Read-only check of the user's Cloudinary integration status. Unlike
 * disconnect, this needs no confirmation gate — it doesn't mutate anything.
 */
/**
 * @param {Object} params
 * @param {import("../../api/IntegrationsClient.js").IntegrationsClient} params.integrationsClient
 * @returns {Promise<{ ok: true, data: object } | { ok: false, reason: string }>}
 */
export async function cloudinaryStatus({ integrationsClient }) {
  try {
    const data = await integrationsClient.cloudinaryStatus();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}
