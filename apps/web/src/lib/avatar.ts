import { AVATAR_VARIANTS, type Avatar } from "@nexquiz/shared";

/** Returns an integer in `[0, max)`; `random` returns a number in `[0, 1)`. */
function pick(max: number, random: () => number): number {
  return Math.min(max - 1, Math.floor(random() * max));
}

/**
 * Random starting avatar for the nickname step: random body and head,
 * accessories off (the player adds them deliberately).
 */
export function randomAvatar(random: () => number = Math.random): Avatar {
  return {
    body: pick(AVATAR_VARIANTS.body, random),
    head: pick(AVATAR_VARIANTS.head, random),
    glasses: null,
    hat: null,
    mustache: null,
  };
}
