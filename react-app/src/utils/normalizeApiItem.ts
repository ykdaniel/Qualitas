/**
 * Parse JSON string fields in an API item into arrays/objects.
 * Used when the backend returns JSON-serialized strings for fields like defectPhotos, attachments.
 */
export function parseJsonFields<T extends Record<string, unknown>>(
  item: T,
  keys: (keyof T)[]
): T {
  const result = { ...item };
  for (const key of keys) {
    const value = result[key];
    if (typeof value === 'string') {
      try {
        (result as Record<string, unknown>)[key as string] = value
          ? JSON.parse(value)
          : [];
      } catch {
        (result as Record<string, unknown>)[key as string] = [];
      }
    }
  }
  return result;
}
