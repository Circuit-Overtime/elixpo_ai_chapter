/**
 * lixblogs integrations cloudinary disconnect
 *
 * Disconnects the user's Cloudinary integration (owned by the web UI —
 * this command only reads/revokes, it never establishes a new connection).
 * Per #135's consent principle ("destructive and publishing scopes require
 * clear consent" / "destructive commands cannot run accidentally in a
 * non-interactive session"), this follows the same shape as authRevoke.
 *
 * This function does not itself prompt — that's the CLI shell's job
 * (interactive confirmation prompt, or requiring an explicit --yes flag in
 * non-interactive mode). This function requires the caller to have already
 * obtained consent and pass confirmed: true; if confirmed is not exactly
 * true, it refuses to proceed.
 */
/**
 * @param {Object} params
 * @param {import("../../api/IntegrationsClient.js").IntegrationsClient} params.integrationsClient
 * @param {boolean} params.confirmed - must be exactly `true`; caller is
 *   responsible for having obtained real user consent before setting this.
 * @returns {Promise<{ ok: true, data: object } | { ok: false, reason: string }>}
 */
export async function cloudinaryDisconnect({ integrationsClient, confirmed }) {
  if (confirmed !== true) {
    return {
      ok: false,
      reason:
        "Disconnect was not confirmed. This is a destructive action and requires " +
        "explicit confirmation (interactive prompt, or --yes in a non-interactive session).",
    };
  }

  try {
    const data = await integrationsClient.cloudinaryDisconnect();
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error };
  }
}
