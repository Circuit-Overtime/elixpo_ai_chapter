// Cloudinary upload/delete helpers using the Upload API (no SDK needed)

export function getPlatformCloudinaryConfig() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  };
}

function resolveConfig(config) {
  return config || getPlatformCloudinaryConfig();
}

function assertCloudinaryConfig(config) {
  if (config?.cloudName && config?.oauthToken) return;
  const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
  const unresolved = Object.entries(config)
    .filter(([, value]) => typeof value === 'string' && /^ENC\[/.test(value.trim()))
    .map(([key]) => key);
  if (missing.length) throw new Error(`Cloudinary configuration missing: ${missing.join(', ')}`);
  if (unresolved.length) {
    throw new Error(`Cloudinary configuration contains unresolved encrypted values: ${unresolved.join(', ')}`);
  }
}

async function sha1(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-1', msgBuffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createCloudinaryUploadSignature({
  folder,
  publicId,
  overwrite = false,
  transformation,
  config: suppliedConfig,
}) {
  const config = resolveConfig(suppliedConfig);
  assertCloudinaryConfig(config);

  const timestamp = Math.floor(Date.now() / 1000);
  const params = { folder, timestamp };
  if (publicId) params.public_id = publicId;
  if (transformation) params.transformation = transformation;
  if (overwrite) {
    params.overwrite = 'true';
    params.invalidate = 'true';
  }

  const signStr = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&') + config.apiSecret;

  return {
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    timestamp,
    signature: await sha1(signStr),
    params,
  };
}

// Profile images (avatar/banner) get heavy compression + overwrite
const PROFILE_TRANSFORMS = 'q_auto:low,f_webp';
const AVATAR_TRANSFORMS = 'q_auto:low,f_webp,w_256,h_256,c_fill,g_face';
const BANNER_TRANSFORMS = 'q_auto:low,f_webp,w_1920,h_480,c_fill';

export async function uploadToCloudinary(fileBuffer, { folder, publicId, overwrite = false, transformation = '', resourceType = 'image', mimeType = 'application/octet-stream', config = null }) {
  const resolvedConfig = resolveConfig(config);
  assertCloudinaryConfig(resolvedConfig);

  const formData = new FormData();
  formData.append('file', new Blob([fileBuffer], { type: mimeType }));
  formData.append('folder', folder);
  if (publicId) formData.append('public_id', publicId);
  if (transformation) formData.append('transformation', transformation);
  if (overwrite) {
    formData.append('overwrite', 'true');
    formData.append('invalidate', 'true');
  }

  const headers = {};
  if (resolvedConfig.oauthToken) {
    headers.Authorization = `Bearer ${resolvedConfig.oauthToken}`;
  } else {
    const { apiKey, timestamp, signature } = await createCloudinaryUploadSignature({
      folder,
      publicId,
      overwrite,
      transformation,
      config: resolvedConfig,
    });
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', apiKey);
    formData.append('signature', signature);
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${resolvedConfig.cloudName}/${resourceType}/upload`,
    { method: 'POST', headers, body: formData }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }

  return res.json();
}

export async function deleteFromCloudinary(publicId, { resourceType = 'image', config: suppliedConfig = null } = {}) {
  const config = resolveConfig(suppliedConfig);
  assertCloudinaryConfig(config);

  const formData = new FormData();
  formData.append('public_id', publicId);
  const headers = {};
  if (config.oauthToken) {
    headers.Authorization = `Bearer ${config.oauthToken}`;
  } else {
    const timestamp = Math.floor(Date.now() / 1000);
    const signStr = `public_id=${publicId}&timestamp=${timestamp}${config.apiSecret}`;
    const signature = await sha1(signStr);
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', config.apiKey);
    formData.append('signature', signature);
  }

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/destroy`,
    { method: 'POST', headers, body: formData }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary delete failed: ${err}`);
  }

  return res.json();
}

export function getCloudinaryUrl(publicId, transforms = '', cloudName = null) {
  const config = cloudName ? { cloudName } : getPlatformCloudinaryConfig();
  const t = transforms ? `${transforms}/` : '';
  return `https://res.cloudinary.com/${config.cloudName}/image/upload/${t}${publicId}`;
}

export function getAvatarUrl(publicId) {
  return getCloudinaryUrl(publicId, AVATAR_TRANSFORMS);
}

export function getBannerUrl(publicId) {
  return getCloudinaryUrl(publicId, BANNER_TRANSFORMS);
}

/**
 * Deterministic avatar paths on Cloudinary.
 * Re-uploads overwrite the same public_id — one stable URL per entity.
 *
 *  Users: lixblogs/avatars/users/{username}
 *  Orgs:  lixblogs/avatars/orgs/{slug}
 */
export function userAvatarPublicId(username) {
  return `lixblogs/avatars/users/${username}`;
}

export function orgAvatarPublicId(slug) {
  return `lixblogs/avatars/orgs/${slug}`;
}

/**
 * Get the full Cloudinary URL for a user avatar at the deterministic path.
 * Pass the Cloudinary upload `version` to bust caches — the public_id is stable,
 * so without a version segment the CDN/browser keeps serving the old image even
 * after a re-upload (this is why avatars appeared not to sync).
 */
export function userAvatarCdnUrl(username, version) {
  const config = getPlatformCloudinaryConfig();
  const v = version ? `v${version}/` : '';
  return `https://res.cloudinary.com/${config.cloudName}/image/upload/${AVATAR_TRANSFORMS}/${v}${userAvatarPublicId(username)}`;
}

/** Get the full Cloudinary URL for an org avatar at the deterministic path */
export function orgAvatarCdnUrl(slug) {
  const config = getPlatformCloudinaryConfig();
  return `https://res.cloudinary.com/${config.cloudName}/image/upload/${AVATAR_TRANSFORMS}/${orgAvatarPublicId(slug)}`;
}

/**
 * Upload a remote image URL to Cloudinary at a deterministic public_id.
 * Used to mirror OAuth avatars (Google, etc.) onto Cloudinary.
 */
export async function uploadRemoteAvatar(imageUrl, publicId) {
  const config = getPlatformCloudinaryConfig();
  const timestamp = Math.floor(Date.now() / 1000);

  const params = {
    invalidate: 'true',
    overwrite: 'true',
    public_id: publicId,
    timestamp: timestamp.toString(),
  };

  const signStr = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&') + config.apiSecret;
  const signature = await sha1(signStr);

  const formData = new FormData();
  formData.append('file', imageUrl);
  formData.append('public_id', publicId);
  formData.append('overwrite', 'true');
  formData.append('invalidate', 'true');
  formData.append('timestamp', timestamp.toString());
  formData.append('api_key', config.apiKey);
  formData.append('signature', signature);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    { method: 'POST', body: formData }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Cloudinary remote upload failed: ${err}`);
  }

  return res.json();
}

export async function testCloudinaryConfig(config) {
  assertCloudinaryConfig(config);
  const authorization = config.oauthToken
    ? `Bearer ${config.oauthToken}`
    : `Basic ${btoa(`${config.apiKey}:${config.apiSecret}`)}`;
  const validationPath = config.oauthToken ? 'resources/image?max_results=1' : 'usage';
  const res = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/${validationPath}`, {
    headers: { Authorization: authorization },
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Cloudinary rejected the connection (${res.status}): ${detail.slice(0, 180)}`);
  }
  return res.json();
}

export { PROFILE_TRANSFORMS, AVATAR_TRANSFORMS, BANNER_TRANSFORMS };
