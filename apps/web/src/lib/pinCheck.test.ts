import { afterEach, describe, expect, it, vi } from "vitest";
import { sk } from "@/i18n/sk";
import { checkPin, CONFIRMED_PIN_TTL_MS, pinCheckMessage, rememberConfirmedPin, takeConfirmedPin } from "./pinCheck";

function respond(status: number, body: unknown): void {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkPin", () => {
  it("reports an existing and a missing game", async () => {
    respond(200, { exists: true });
    expect(await checkPin("123456")).toBe("exists");
    respond(200, { exists: false });
    expect(await checkPin("123456")).toBe("missing");
  });

  it("does not report a 429 as a missing game", async () => {
    respond(429, { error: "RATE_LIMITED" });
    const result = await checkPin("123456");
    expect(result).toBe("rateLimited");
    expect(pinCheckMessage(result)).toBe(sk.errors.rateLimited);
  });

  it("does not report a network or server error as a missing game", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await checkPin("123456")).toBe("failed");
    respond(502, "Bad Gateway");
    expect(await checkPin("123456")).toBe("failed");
    expect(pinCheckMessage("failed")).toBe(sk.errors.connectionFailed);
    expect(pinCheckMessage("missing")).toBe(sk.errors.pinNotFound);
    expect(pinCheckMessage("exists")).toBeNull();
  });
});

describe("confirmed PINs", () => {
  it("are trusted once and only within the TTL", () => {
    rememberConfirmedPin("111111", 1000);
    expect(takeConfirmedPin("222222", 1000)).toBe(false);
    expect(takeConfirmedPin("111111", 1000 + CONFIRMED_PIN_TTL_MS - 1)).toBe(true);
    expect(takeConfirmedPin("111111", 1000)).toBe(false);

    rememberConfirmedPin("333333", 1000);
    expect(takeConfirmedPin("333333", 1000 + CONFIRMED_PIN_TTL_MS)).toBe(false);
  });
});
