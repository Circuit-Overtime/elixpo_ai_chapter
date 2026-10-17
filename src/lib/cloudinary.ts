/**
 * Cloudinary integration for Elixpo Chat media storage.
 *
 * Upload and retrieve media (news audio, podcast audio, banners, thumbnails)
 * from Cloudinary instead of Firebase Storage.
 *
 * Environment variables required:
 *   CLOUDINARY_CLOUD_NAME
 *   CLOUDINARY_API_KEY
 *   CLOUDINARY_API_SECRET
 */

export function getCloudinaryUrl(publicId: string, options?: { width?: number; height?: number; format?: string }) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error("CLOUDINARY_CLOUD_NAME is not set");

  const transforms: string[] = [];
  if (options?.width) transforms.push(`w_${options.width}`);
  if (options?.height) transforms.push(`h_${options.height}`);
  if (transforms.length > 0) transforms.push("c_fill");

  const transformStr = transforms.length > 0 ? transforms.join(",") + "/" : "";
  const format = options?.format || "auto";

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformStr}f_${format}/${publicId}`;
}

export function getCloudinaryAudioUrl(publicId: string) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) throw new Error("CLOUDINARY_CLOUD_NAME is not set");
  return `https://res.cloudinary.com/${cloudName}/video/upload/${publicId}`;
}
