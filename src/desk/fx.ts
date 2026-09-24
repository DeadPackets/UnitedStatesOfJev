// The desk's motion toolkit, ported from the approved mock (docs/design/mock/desk.html): one canvas layer for couriers,
// rings, bursts and the shockwave; number rolls; the desk shake; springs as native easing; the frame meter; sound hooks.
// Everything here moves the DOM or the canvas directly, never React state, so a moment never re-renders.
import { animate, type AnimationOptions, type DOMKeyframesDefinition } from "motion";
import { sound } from "../sound";

export class Stale extends Error {}
let run = 0;
/** Starts a moment. Every sleep and play of an older moment rejects with Stale from here on. */
export const beginMoment = () => ++run;
export const cancelMoments = () => {
  run++;
  layer.items = [];
};

export const reduced = () => document.documentElement.classList.contains("rm");
const MOTION_FACTOR: Record<string, number> = {
  stately: 1.18,
  brisk: 0.9,
  mechanical: 1,
  fluid: 1,
};
/** The world's motion personality: sleeps and couriers run this much longer or shorter. */
export const pace = () => MOTION_FACTOR[document.documentElement.dataset.motion ?? ""] ?? 1;
/** The root scale k (1 to 1.8): 1rem is 16px when k is 1. */
export const scale = () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16;
export const token = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const signed = (delta: number) => (delta > 0 ? "+" : delta < 0 ? "−" : "") + Math.abs(delta);
export type Point = { x: number; y: number };
export const centre = (el: Element) => {
  const box = el.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, box };
};

export function sleep(ms: number): Promise<void> {
  const mine = run;
  return new Promise((resolve, reject) =>
    setTimeout(
      () => (mine === run ? resolve() : reject(new Stale())),
      ms * (reduced() ? 0.4 : pace()),
    ),
  );
}

/** Motion's animate; under reduced motion a short fade with no delay unless `keep`. Rejects with Stale when cancelled. */
export async function play(
  target: Element | Element[],
  keyframes: DOMKeyframesDefinition,
  options: AnimationOptions & { keep?: boolean } = {},
): Promise<void> {
  const mine = run;
  const { keep, ...rest } = options;
  const settings =
    reduced() && !keep
      ? {
          ...rest,
          duration: Math.min(Number(rest.duration ?? 0.3), 0.18),
          type: undefined,
          delay: 0,
        }
      : rest;
  await animate(target, keyframes, settings);
  if (mine !== run) throw new Stale();
}

/** Counts a number from one value to another on screen, easing out. */
export function roll(el: Element, from: number, to: number, ms = 600): Promise<void> {
  return new Promise((resolve) => {
    if (reduced() || ms <= 0 || from === to) {
      el.textContent = String(to);
      return resolve();
    }
    const start = performance.now();
    const frame = (now: number) => {
      const progress = Math.min(1, (now - start) / ms);
      el.textContent = String(Math.round(from + (to - from) * (1 - (1 - progress) ** 3)));
      progress < 1 ? requestAnimationFrame(frame) : resolve();
    };
    requestAnimationFrame(frame);
  });
}

/** Decaying noise on the whole desk (Vlambeer), never on the numbers alone. */
export function shake(
  amplitude = 8,
  ms = 380,
  direction: [number, number] | null = null,
  el?: HTMLElement,
) {
  const target = el ?? document.getElementById("dk");
  if (reduced() || !target) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const start = performance.now();
    const frame = (now: number) => {
      const progress = (now - start) / ms;
      if (progress >= 1) {
        target.style.transform = "";
        return resolve();
      }
      const size = amplitude * (1 - progress) * (1 - progress);
      const x = direction
        ? direction[0] * size * Math.cos(progress * 28)
        : (Math.random() * 2 - 1) * size;
      const y = direction
        ? direction[1] * size * Math.cos(progress * 28)
        : (Math.random() * 2 - 1) * size;
      target.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

/* ---------- the canvas layer: items step and draw until they return false ---------- */
export type LayerItem = {
  step(seconds: number, context: CanvasRenderingContext2D, now: number): boolean | void;
};
const layer = {
  items: [] as LayerItem[],
  running: false,
  last: 0,
  ratio: 1,
  canvas: null as HTMLCanvasElement | null,
  context: null as CanvasRenderingContext2D | null,
};
function sizeLayer() {
  if (!layer.canvas) return;
  layer.ratio = Math.min(2, devicePixelRatio || 1);
  layer.canvas.width = innerWidth * layer.ratio;
  layer.canvas.height = innerHeight * layer.ratio;
}
/** Binds the desk's canvas; returns the unbinding. */
export function mountLayer(canvas: HTMLCanvasElement): () => void {
  layer.canvas = canvas;
  layer.context = canvas.getContext("2d");
  sizeLayer();
  addEventListener("resize", sizeLayer);
  return () => {
    removeEventListener("resize", sizeLayer);
    layer.items = [];
    layer.canvas = null;
    layer.context = null;
  };
}
function tick(now: number) {
  const context = layer.context;
  if (!context) {
    layer.running = false;
    return;
  }
  const seconds = Math.min(0.05, (now - layer.last) / 1000);
  layer.last = now;
  context.setTransform(layer.ratio, 0, 0, layer.ratio, 0, 0);
  context.clearRect(0, 0, innerWidth, innerHeight);
  layer.items = layer.items.filter((item) => item.step(seconds, context, now) !== false);
  if (layer.items.length) requestAnimationFrame(tick);
  else {
    layer.running = false;
    context.clearRect(0, 0, innerWidth, innerHeight);
  }
}
export function addToLayer(item: LayerItem, evenWhenReduced = false) {
  if (reduced() && !evenWhenReduced) return;
  layer.items.push(item);
  if (layer.running) return;
  layer.running = true;
  layer.last = performance.now();
  requestAnimationFrame(tick);
}

/* ---------- particles: dots, shards and paper flecks, with gravity and drag per burst ---------- */
export type BurstOptions = {
  colours: string[];
  count?: number;
  direction?: number;
  spread?: number;
  speed?: number;
  life?: number;
  size?: number;
  gravity?: number;
  drag?: number;
  shape?: "dot" | "shard" | "fleck";
  shrink?: boolean;
};
export function burst(x: number, y: number, options: BurstOptions) {
  const {
    colours,
    count = 24,
    direction = 0,
    spread = Math.PI * 2,
    speed = 260,
    life = 0.9,
  } = options;
  const { size = 4, gravity = 600, drag = 0.12, shape = "dot", shrink = false } = options;
  const particles = Array.from({ length: count }, (_, i) => {
    const angle = direction + spread * (Math.random() - 0.5);
    const velocity = speed * (0.35 + Math.random() * 0.9);
    return {
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: life * (0.6 + Math.random() * 0.6),
      age: 0,
      size: size * (0.5 + Math.random()),
      colour: colours[i % colours.length],
      turn: Math.random() * 6,
      spin: (Math.random() - 0.5) * 12,
    };
  });
  addToLayer({
    step(seconds, context) {
      let alive = 0;
      for (const particle of particles) {
        particle.age += seconds;
        if (particle.age > particle.life) continue;
        alive++;
        particle.vy += gravity * seconds;
        const slow = drag ** seconds;
        particle.vx *= slow;
        particle.vy *= slow;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;
        particle.turn += particle.spin * seconds;
        const left = 1 - particle.age / particle.life;
        context.globalAlpha = Math.min(1, left * 1.6);
        context.fillStyle = particle.colour;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.turn);
        context.beginPath();
        if (shape === "shard") {
          context.moveTo(-particle.size, -particle.size * 0.4);
          context.lineTo(particle.size, 0);
          context.lineTo(-particle.size * 0.6, particle.size * 0.5);
        } else if (shape === "fleck") {
          context.scale(1, Math.cos(particle.turn * 1.7));
          context.rect(
            -particle.size,
            -particle.size * 0.6,
            particle.size * 2,
            particle.size * 1.2,
          );
        } else context.arc(0, 0, particle.size * (shrink ? left : 1), 0, 7);
        context.fill();
        context.restore();
      }
      context.globalAlpha = 1;
      return alive > 0;
    },
  });
}

/* ---------- couriers (P1-B): a head, a fading trail, a label; the landing is the change ---------- */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export type Courier = {
  from: Point;
  to: Point;
  colour: string;
  label?: string | null;
  radius?: number;
  duration?: number;
  arc?: number;
  delay?: number;
  coin?: boolean;
  onLand?: () => void;
};
// The world's courier token shapes the head; dot and coin are the mock's circle.
function head(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  const shape = document.documentElement.dataset.courier;
  context.beginPath();
  if (shape === "shard") {
    context.moveTo(x - radius, y - radius * 0.4);
    context.lineTo(x + radius, y);
    context.lineTo(x - radius * 0.6, y + radius * 0.5);
  } else if (shape === "fleck")
    context.rect(x - radius, y - radius * 0.6, radius * 2, radius * 1.2);
  else context.arc(x, y, radius, 0, 7);
  context.fill();
}
export function fly(courier: Courier): Promise<void> {
  const {
    from,
    to,
    colour,
    label = null,
    radius = 7,
    duration = 0.7,
    arc = 0.28,
    delay = 0,
  } = courier;
  const { coin = false, onLand } = courier;
  return new Promise((resolve) => {
    const land = () => {
      onLand?.();
      resolve();
    };
    if (reduced()) return land();
    const dx = to.x - from.x,
      dy = to.y - from.y,
      distance = Math.hypot(dx, dy) || 1;
    let px = -dy / distance,
      py = dx / distance;
    if (py > 0) {
      px = -px;
      py = -py;
    }
    const control = {
      x: from.x + dx / 2 + px * distance * arc,
      y: from.y + dy / 2 + py * distance * arc,
    };
    const total = duration * pace(),
      mono = token("--mono"),
      card = token("--card"),
      k = scale();
    const at = (q: number): [number, number] => {
      const u = 1 - q;
      return [
        u * u * from.x + 2 * u * q * control.x + q * q * to.x,
        u * u * from.y + 2 * u * q * control.y + q * q * to.y,
      ];
    };
    let time = -delay * pace();
    addToLayer({
      step(seconds, context) {
        time += seconds;
        if (time < 0) return true;
        const progress = time / total;
        if (progress >= 1) {
          land();
          return false;
        }
        const eased = easeInOut(progress),
          tail = Math.max(0, eased - (coin ? 0.12 : 0.22));
        context.lineCap = "round";
        for (let i = 0; i < 10; i++) {
          const [ax, ay] = at(tail + ((eased - tail) * i) / 10);
          const [bx, by] = at(tail + ((eased - tail) * (i + 1)) / 10);
          context.strokeStyle = colour;
          context.globalAlpha = ((i + 1) / 10) * (coin ? 0.35 : 0.55);
          context.lineWidth = (radius * 1.3 * (i + 1)) / 10;
          context.beginPath();
          context.moveTo(ax, ay);
          context.lineTo(bx, by);
          context.stroke();
        }
        const [hx, hy] = at(eased);
        context.globalAlpha = 1;
        context.fillStyle = colour;
        head(context, hx, hy, radius);
        context.fillStyle = "rgba(255,255,255,.55)";
        context.beginPath();
        context.arc(hx - radius * 0.3, hy - radius * 0.3, radius * 0.38, 0, 7);
        context.fill();
        if (label) {
          context.font = `700 ${Math.round(15 * k)}px ${mono}`;
          const width = context.measureText(label).width + 14 * k,
            left = hx + radius + 5 * k,
            top = hy - 11.5 * k;
          context.fillStyle = card;
          context.strokeStyle = colour;
          context.lineWidth = 1.5;
          context.beginPath();
          context.roundRect(left, top, width, 23 * k, 6 * k);
          context.fill();
          context.stroke();
          context.fillStyle = colour;
          context.textBaseline = "middle";
          context.fillText(label, left + 7 * k, top + 12 * k);
        }
      },
    });
  });
}

export function ring(
  x: number,
  y: number,
  colour: string,
  radius = 34,
  width = 2.5,
  duration = 0.52,
) {
  let time = 0;
  addToLayer({
    step(seconds, context) {
      time += seconds;
      const progress = time / duration;
      if (progress >= 1) return false;
      context.globalAlpha = 1 - progress;
      context.strokeStyle = colour;
      context.lineWidth = width * (1 - progress) + 0.5;
      context.beginPath();
      context.arc(x, y, 6 + radius * (1 - (1 - progress) ** 3), 0, 7);
      context.stroke();
      context.globalAlpha = 1;
    },
  });
}

/* ---------- the shockwave: a ring that runs out from a point and hits each target as it passes ---------- */
function ringDraw(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colour: string,
  alpha: number,
  width: number,
) {
  context.globalAlpha = alpha * 0.22;
  context.strokeStyle = colour;
  context.lineWidth = width * 3.2;
  context.beginPath();
  context.arc(x, y, Math.max(1, radius - width), 0, 7);
  context.stroke();
  context.globalAlpha = alpha;
  context.lineWidth = width * 0.5;
  context.beginPath();
  context.arc(x, y, radius, 0, 7);
  context.stroke();
  context.globalAlpha = 1;
}
export type WaveTarget = { el: Element; x: number; y: number; distance: number; done?: boolean };
export function wave(
  originX: number,
  originY: number,
  options: {
    colour: string;
    targets: Element[];
    hit: (target: WaveTarget) => void;
    duration?: number;
    width?: number;
  },
): Promise<void> {
  const { colour, targets, hit, duration = 0.9, width = 30 } = options;
  const reach = Math.hypot(
    Math.max(originX, innerWidth - originX),
    Math.max(originY, innerHeight - originY),
  );
  const marks: WaveTarget[] = targets.map((el) => {
    const point = centre(el);
    return {
      el,
      x: point.x,
      y: point.y,
      distance: Math.hypot(point.x - originX, point.y - originY),
    };
  });
  if (reduced()) return sleep(100);
  return new Promise((resolve) => {
    let time = 0;
    addToLayer({
      step(seconds, context) {
        time += seconds;
        const progress = Math.min(1, time / duration),
          radius = (1 - (1 - progress) ** 2.2) * reach;
        ringDraw(
          context,
          originX,
          originY,
          radius,
          colour,
          1 - progress * 0.7,
          width * (1 - progress * 0.5),
        );
        for (const mark of marks)
          if (!mark.done && mark.distance <= radius) {
            mark.done = true;
            hit(mark);
          }
        if (progress >= 1) {
          resolve();
          return false;
        }
      },
    });
  });
}

/** A spring as a native easing: simulated once and handed to WAAPI as linear(), so it runs on the compositor. */
export function spring(stiffness = 170, damping = 18): { easing: string; duration: number } {
  let x = 0,
    velocity = 0,
    time = 0;
  const step = 1 / 240,
    points = [0];
  while (time < 2.5) {
    const force = -stiffness * (x - 1) - damping * velocity;
    velocity += force * step;
    x += velocity * step;
    time += step;
    if (Math.round(time * 240) % 4 === 0) points.push(+x.toFixed(4));
    if (time > 0.25 && Math.abs(x - 1) < 0.002 && Math.abs(velocity) < 0.02) break;
  }
  points.push(1);
  return { easing: `linear(${points.join(",")})`, duration: Math.round(time * 1000) };
}

/* ---------- the frame meter: every rAF delta while a moment runs, kept on window.deskFps for the end-to-end check ---------- */
// `at` and `ms` place the moment on the page's clock, so the end-to-end check can pin long tasks to it.
type FpsRecord = {
  moment: string;
  avg: number;
  low1: number;
  frames: number;
  at: number;
  ms: number;
};
declare global {
  interface Window {
    deskFps?: FpsRecord[];
  }
}
function record(name: string, deltas: number[], start: number) {
  // The first delta runs from the start call to the first frame: a hitch as the moment begins counts too.
  const sorted = [...deltas].sort((a, b) => b - a);
  if (!sorted.length) return;
  (window.deskFps ??= []).push({
    moment: name,
    avg: Math.round(1000 / (sorted.reduce((a, b) => a + b) / sorted.length)),
    low1: Math.round(1000 / sorted[Math.floor(sorted.length * 0.01)]),
    frames: sorted.length,
    at: Math.round(start),
    ms: Math.round(performance.now() - start),
  });
}
let current: { name: string; deltas: number[]; start: number; last: number; on: boolean } | null =
  null;
export function fpsStart(name: string) {
  const start = performance.now();
  const mine = (current = { name, deltas: [] as number[], start, last: start, on: true });
  const frame = (now: number) => {
    if (current !== mine || !mine.on) return;
    mine.deltas.push(now - mine.last);
    mine.last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
export function fpsStop() {
  if (!current) return;
  current.on = false;
  record(current.name, current.deltas, current.start);
  current = null;
}
/** A fixed-length meter for the desk's own moments (opening a file or the sheet). */
export function meter(name: string, ms: number) {
  const start = performance.now();
  let last = start;
  const deltas: number[] = [],
    end = last + ms;
  const frame = (now: number) => {
    deltas.push(now - last);
    last = now;
    if (now < end) requestAnimationFrame(frame);
    else record(name, deltas, start);
  };
  requestAnimationFrame(frame);
}

// The mock's sound hooks were silent; three map to the cues the game already has, the rest stay silent (Track F).
const CUES: Record<string, Parameters<typeof sound.play>[0]> = {
  seat: "tick",
  "verdict-pass": "gavel",
  "verdict-fail": "thud",
};
export function sfx(name: string, pitch = 0) {
  const cue = CUES[name];
  if (cue) sound.play(cue, { pitch });
}
