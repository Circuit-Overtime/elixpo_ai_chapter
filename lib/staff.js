/**
 * Staff org ID — blogs published under this org get a STAFF badge.
 * This is the Elixpo org. Update this if the org ID ever changes.
 */
export const STAFF_ORG_ID = '0ef5e5a2-0f44-4c8d-9abf-c8bebddeb58d';

export function isStaffBlog(publishedAs) {
  return publishedAs === `org:${STAFF_ORG_ID}`;
}
