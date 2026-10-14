import { avatarSchema } from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import { randomAvatar } from "./avatar";

describe("randomAvatar", () => {
  it("picks a valid body and head without accessories", () => {
    for (const r of [0, 0.5, 0.999999]) {
      const avatar = randomAvatar(() => r);
      expect(avatarSchema.safeParse(avatar).success).toBe(true);
      expect(avatar).toMatchObject({ glasses: null, hat: null, mustache: null });
    }
  });

  it("maps the edges of the random range onto the first and last variant", () => {
    expect(randomAvatar(() => 0)).toMatchObject({ body: 0, head: 0 });
    expect(randomAvatar(() => 0.999999)).toMatchObject({ body: 4, head: 4 });
  });
});
