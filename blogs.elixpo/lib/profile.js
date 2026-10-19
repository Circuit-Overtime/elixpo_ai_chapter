export const MAX_DESIGNATION_LENGTH = 100;

export function normalizeDesignation(value) {
  if (value === undefined) return undefined;
  if (value === null) return '';
  if (typeof value !== 'string') throw new TypeError('Designation must be text.');
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (normalized.length > MAX_DESIGNATION_LENGTH) {
    throw new RangeError(`Designation must be ${MAX_DESIGNATION_LENGTH} characters or fewer.`);
  }
  return normalized;
}
