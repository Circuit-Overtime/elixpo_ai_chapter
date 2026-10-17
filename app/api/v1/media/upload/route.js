export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The canonical media pipeline performs permission checks, metadata stripping,
// storage selection, idempotency and Cloudinary tracking for both web and CLI.
export { POST, DELETE } from '../../../media/upload/route';
