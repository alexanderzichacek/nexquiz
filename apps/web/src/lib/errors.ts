import { sk } from "@/i18n/sk";
import { ApiError } from "./api";

/** Friendly Slovak message for an error thrown by `apiRequest` / `apiUpload`. */
export function errorMessage(err: unknown, fallback: string = sk.errors.generic): string {
  if (!(err instanceof ApiError)) return fallback;
  switch (err.code) {
    case "RATE_LIMITED":
      return sk.errors.rateLimited;
    case "PAYLOAD_TOO_LARGE":
      return sk.editor.uploadTooLarge;
    case "UNSUPPORTED_MEDIA_TYPE":
      return sk.editor.uploadUnsupported;
    default:
      return fallback;
  }
}
