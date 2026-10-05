import { describe, expect, it } from "vitest";
import { clientIp } from "./clientIp.js";

describe("clientIp (rate-limit key)", () => {
  it("prefers CF-Connecting-IP", () => {
    expect(clientIp({ "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "1.1.1.1, 203.0.113.7" }, "172.18.0.5")).toBe(
      "203.0.113.7",
    );
  });

  it("ignores a spoofed left-most X-Forwarded-For entry", () => {
    // Cloudflare appends the real client to a client-supplied header.
    expect(clientIp({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }, "172.18.0.5")).toBe("203.0.113.7");
    expect(clientIp({ "x-forwarded-for": ["6.6.6.6", "203.0.113.8"] }, "172.18.0.5")).toBe("203.0.113.8");
  });

  it("falls back to the socket address", () => {
    expect(clientIp({}, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp({ "x-forwarded-for": " , " }, "127.0.0.1")).toBe("127.0.0.1");
    expect(clientIp({}, undefined)).toBe("unknown");
  });
});
