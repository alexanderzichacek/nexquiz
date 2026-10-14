import { z } from "zod";

/**
 * Player avatar chosen at the nickname step: a body and a head (required)
 * plus optional glasses, hat and mustache. Every part is the index of a
 * variant; the drawings themselves live in the web client.
 */
export const AVATAR_VARIANTS = {
  body: 5,
  head: 5,
  glasses: 3,
  hat: 3,
  mustache: 3,
} as const;

export type AvatarPart = keyof typeof AVATAR_VARIANTS;
export const AVATAR_PARTS = Object.keys(AVATAR_VARIANTS) as AvatarPart[];
/** Parts the player may leave out (`null` = none). */
export const AVATAR_OPTIONAL_PARTS = ["glasses", "hat", "mustache"] as const satisfies readonly AvatarPart[];

function variantSchema(part: AvatarPart) {
  return z
    .number()
    .int()
    .min(0)
    .max(AVATAR_VARIANTS[part] - 1);
}

export const avatarSchema = z.object({
  body: variantSchema("body"),
  head: variantSchema("head"),
  glasses: variantSchema("glasses").nullable(),
  hat: variantSchema("hat").nullable(),
  mustache: variantSchema("mustache").nullable(),
});
export type Avatar = z.infer<typeof avatarSchema>;

/** Used when a client does not send an avatar and for players stored before avatars existed. */
export const DEFAULT_AVATAR: Avatar = { body: 0, head: 0, glasses: null, hat: null, mustache: null };
