<script setup lang="ts">
import { onBeforeUnmount, onMounted, useTemplateRef } from "vue";
import { prefersReducedMotion } from "@/lib/motion";

/**
 * Winner confetti (own canvas code, DESIGN.md: 2 s). Colors come from the
 * option tokens `--opt-1` … `--opt-6`. Not rendered at all with
 * `prefers-reduced-motion`.
 */
const DURATION_MS = 2000;
const PARTICLES = 160;
/** Gravity in px / ms² per px of canvas height (apex after ≈ 0.6 s). */
const GRAVITY = 0.0000027;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  spin: number;
  color: string;
}

const canvas = useTemplateRef<HTMLCanvasElement>("canvas");
let frame = 0;

function tokenColors(el: HTMLElement): string[] {
  const style = getComputedStyle(el);
  return [1, 2, 3, 4, 5, 6].map((n) => style.getPropertyValue(`--opt-${n}`).trim()).filter((c) => c !== "");
}

onMounted(() => {
  const el = canvas.value;
  if (!el || prefersReducedMotion()) return;
  const ctx = el.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = el.clientWidth;
  const height = el.clientHeight;
  el.width = Math.round(width * dpr);
  el.height = Math.round(height * dpr);
  ctx.scale(dpr, dpr);

  const colors = tokenColors(el);
  const particles: Particle[] = Array.from({ length: PARTICLES }, (_, i) => {
    const fromLeft = i % 2 === 0;
    const angle = (fromLeft ? -1 : 1) * (Math.PI / 6 + Math.random() * (Math.PI / 5));
    const speed = (0.6 + Math.random() * 0.7) * (height / 1000);
    return {
      x: fromLeft ? width * 0.15 : width * 0.85,
      y: height * 0.85,
      vx: Math.sin(angle) * speed * -1,
      vy: -Math.cos(angle) * speed * 1.6,
      size: 6 + Math.random() * 8,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.02,
      color: colors[i % Math.max(1, colors.length)] ?? "currentColor",
    };
  });

  const startedAt = performance.now();
  let last = startedAt;
  const step = (now: number): void => {
    const dt = Math.min(32, now - last);
    last = now;
    const elapsed = now - startedAt;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = elapsed > DURATION_MS * 0.7 ? Math.max(0, 1 - (elapsed - DURATION_MS * 0.7) / (DURATION_MS * 0.3)) : 1;
    for (const p of particles) {
      p.vy += GRAVITY * height * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < DURATION_MS) frame = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, width, height);
  };
  frame = requestAnimationFrame(step);
});

onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template>
  <canvas ref="canvas" class="confetti" aria-hidden="true"></canvas>
</template>

<style scoped>
.confetti {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 50;
}
</style>
