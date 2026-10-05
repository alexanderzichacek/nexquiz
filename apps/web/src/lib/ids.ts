/**
 * Random ids for new questions (UUID v4) and options (`localIdSchema`).
 * Uses `crypto.getRandomValues`, which – unlike `crypto.randomUUID` – also
 * works outside secure contexts (plain http on the LAN).
 */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** RFC 4122 version 4 UUID. */
export function uuidV4(): string {
  const b = randomBytes(16);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Short option / item id matching `[A-Za-z0-9_-]{1,64}`. */
export function localId(): string {
  return `o${hex(randomBytes(5))}`;
}
