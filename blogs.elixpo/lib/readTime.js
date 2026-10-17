// Single source of truth for reading-time. Cards show the stored
// `read_time_minutes`; the reader/editor compute with the SAME formula so the
// number never disagrees across surfaces.
export const READ_WPM = 250;

export function readTimeFromWords(words) {
  return Math.max(1, Math.ceil((Number(words) || 0) / READ_WPM));
}
