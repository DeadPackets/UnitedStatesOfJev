import { PhotonImage, SamplingFilter, crop, resize } from "@cf-wasm/photon";
import { UpstreamError, post, type Env } from "./jev";

export type Rgb = [number, number, number];

const PALETTE = 16;
const LEVELS = 3;
// Bayer 8x8 ordered dither, the classic recursive matrix; values 0-63.
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
];

const scaled = (bytes: Uint8Array, w: number, h: number): PhotonImage => {
  const src = PhotonImage.new_from_byteslice(bytes);
  const out = resize(src, w, h, SamplingFilter.Lanczos3);
  src.free();
  return out;
};

const encode = (data: Uint8Array, w: number, h: number): Uint8Array => {
  const img = new PhotonImage(data, w, h);
  const png = img.get_bytes();
  img.free();
  return png;
};

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const luma = (d: Uint8Array, i: number) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

export async function muse(env: Env, prompt: string, aspect: string): Promise<Uint8Array> {
  const r = await post(env, "images", { model: "meta/muse-image", prompt, aspect_ratio: aspect, resolution: "1K" });
  const b64 = r?.data?.[0]?.b64_json;
  if (typeof b64 !== "string") throw new UpstreamError(502, "muse returned no image");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function cells(sheetBytes: Uint8Array): Uint8Array[] {
  const img = PhotonImage.new_from_byteslice(sheetBytes);
  const w = Math.floor(img.get_width() / 4), h = Math.floor(img.get_height() / 4);
  const out: Uint8Array[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cell = crop(img, c * w, r * h, c * w + w, r * h + h);
      out.push(cell.get_bytes());
      cell.free();
    }
  }
  img.free();
  return out;
}

export async function sheet(env: Env, prompt: string): Promise<Uint8Array[]> {
  return cells(await muse(env, prompt, "1:1"));
}

function medianCut(d: Uint8Array, n: number): Rgb[] {
  const all: Rgb[] = [];
  for (let i = 0; i < d.length; i += 4) all.push([d[i], d[i + 1], d[i + 2]]);
  let boxes: Rgb[][] = [all];
  while (boxes.length < n) {
    let bi = -1, bc = 0, best = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of b) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; }
        if (hi - lo > best) { best = hi - lo; bi = i; bc = c; }
      }
    }
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi];
    b.sort((x, y) => x[bc] - y[bc]);
    boxes.splice(bi, 1, b.slice(0, b.length >> 1), b.slice(b.length >> 1));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (const p of b) { r += p[0]; g += p[1]; bl += p[2]; }
    return [Math.round(r / b.length), Math.round(g / b.length), Math.round(bl / b.length)] as Rgb;
  });
}

function floydSteinberg(d: Uint8Array, w: number, h: number, pal: Rgb[]): void {
  const buf = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; j < buf.length; i += 4, j += 3) { buf[j] = d[i]; buf[j + 1] = d[i + 1]; buf[j + 2] = d[i + 2]; }
  const spread = (x: number, y: number, k: number, er: number, eg: number, eb: number) => {
    if (x < 0 || x >= w || y >= h) return;
    const j = (y * w + x) * 3;
    buf[j] += er * k; buf[j + 1] += eg * k; buf[j + 2] += eb * k;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 3;
      // Clamp before matching: unbounded diffused error blows out smooth highlights.
      const r = clamp(buf[j]), g = clamp(buf[j + 1]), b = clamp(buf[j + 2]);
      let hit = pal[0], near = Infinity;
      for (const p of pal) {
        const dr = r - p[0], dg = g - p[1], db = b - p[2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < near) { near = dist; hit = p; }
      }
      const er = r - hit[0], eg = g - hit[1], eb = b - hit[2];
      spread(x + 1, y, 7 / 16, er, eg, eb);
      spread(x - 1, y + 1, 3 / 16, er, eg, eb);
      spread(x, y + 1, 5 / 16, er, eg, eb);
      spread(x + 1, y + 1, 1 / 16, er, eg, eb);
      const i = (y * w + x) * 4;
      d[i] = hit[0]; d[i + 1] = hit[1]; d[i + 2] = hit[2]; d[i + 3] = 255;
    }
  }
}

export function face(cell: Uint8Array): Uint8Array {
  const img = scaled(cell, 128, 128);
  const d = img.get_raw_pixels();
  img.free();
  floydSteinberg(d, 128, 128, medianCut(d, PALETTE));
  return encode(d, 128, 128);
}

function halftone(bytes: Uint8Array, w: number, h: number, ink: Rgb, paper: Rgb): Uint8Array {
  const img = scaled(bytes, w, h);
  const d = img.get_raw_pixels();
  img.free();
  const n = w * h;
  const g = new Float32Array(n);
  let lo = 1, hi = 0;
  for (let i = 0; i < n; i++) {
    const v = luma(d, i * 4);
    g[i] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const out = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // normalize, then levels 10%-85%: black point 0.10, white point 0.85.
      const v = Math.min(1, Math.max(0, ((g[i] - lo) / span - 0.1) / 0.75));
      const t = (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64 - 0.5;
      const q = Math.min(LEVELS - 1, Math.max(0, Math.round(v * (LEVELS - 1) + t))) / (LEVELS - 1);
      const o = i * 4;
      out[o] = Math.round(ink[0] + (paper[0] - ink[0]) * q);
      out[o + 1] = Math.round(ink[1] + (paper[1] - ink[1]) * q);
      out[o + 2] = Math.round(ink[2] + (paper[2] - ink[2]) * q);
      out[o + 3] = 255;
    }
  }
  return encode(out, w, h);
}

export const plate = (cell: Uint8Array, ink: Rgb, paper: Rgb) => halftone(cell, 256, 256, ink, paper);
export const crest = (bytes: Uint8Array, color: Rgb, paper: Rgb) => halftone(bytes, 256, 256, color, paper);
export const masthead = (bytes: Uint8Array, ink: Rgb, paper: Rgb) => halftone(bytes, 1600, 400, ink, paper);

function eyeRow(cell: Uint8Array): number {
  const img = scaled(cell, 128, 128);
  const d = img.get_raw_pixels();
  img.free();
  const rows = new Float64Array(128);
  for (let y = 0; y < 128; y++) {
    let s = 0;
    for (let x = 0; x < 128; x++) s += luma(d, (y * 128 + x) * 4);
    rows[y] = s;
  }
  // Darkest 8-row band in 25%–60%; a beard below 50% loses to eyes above it that are within 15% of its darkness.
  const band = (lo: number, hi: number) => {
    let at = lo, dark = Infinity;
    for (let y = lo; y + 8 <= hi; y++) {
      let s = 0;
      for (let k = 0; k < 8; k++) s += rows[y + k];
      if (s < dark) { dark = s; at = y; }
    }
    return { at, dark };
  };
  let { at, dark } = band(32, 77);
  if (at + 4 > 64) {
    const up = band(32, 64);
    if (up.dark <= dark * 1.15) at = up.at;
  }
  return at + 4;
}

export function alignment(cellBytes: Uint8Array[]): { ok: boolean; rows: number[] } {
  const rows = cellBytes.map(eyeRow);
  const median = [...rows].sort((a, b) => a - b)[rows.length >> 1];
  const off = rows.filter((r) => Math.abs(r - median) > 12).length;
  return { ok: off <= 2, rows };
}
