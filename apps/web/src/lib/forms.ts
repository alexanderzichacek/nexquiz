/** Value of a number input as a number; empty / unparsable input becomes NaN (fails Zod validation). */
export function inputNumber(event: Event): number {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return Number.NaN;
  const raw = target.value.trim().replace(",", ".");
  return raw === "" ? Number.NaN : Number(raw);
}

/** Value of a text input / textarea / select. */
export function inputText(event: Event): string {
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
    return target.value;
  }
  return "";
}

/** `/media/:id` URL of an uploaded file. */
export function mediaUrl(id: string): string {
  return `/media/${encodeURIComponent(id)}`;
}
