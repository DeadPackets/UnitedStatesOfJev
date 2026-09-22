import { test, expect } from "bun:test";
import { PhotonImage, crop } from "@cf-wasm/photon";
import { alignment, cells, crest, face, masthead, plate } from "./art";

const SHEET = new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/sheet.webp`).arrayBuffer());
const CELLS = cells(SHEET);
const INK: [number, number, number] = [26, 26, 24];
const PAPER: [number, number, number] = [244, 244, 242];
const rgb = (c: [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];

function png(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: v.getUint32(16), height: v.getUint32(20) };
}

function palette(bytes: Uint8Array): Set<number> {
  const img = PhotonImage.new_from_byteslice(bytes);
  const d = img.get_raw_pixels();
  const seen = new Set<number>();
  for (let i = 0; i < d.length; i += 4) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
  img.free();
  return seen;
}

test("a sheet crops into 16 square cells", () => {
  expect(CELLS.length).toBe(16);
  for (const c of CELLS) expect(png(c)).toEqual({ width: 400, height: 400 });
});

test("alignment passes on the fixture sheet", () => {
  const a = alignment(CELLS);
  expect(a.rows.length).toBe(16);
  expect(a.ok).toBe(true);
});

test("alignment fails, without throwing, when more than 2 cells drift", () => {
  const sheet = PhotonImage.new_from_byteslice(SHEET);
  const shifted = [...CELLS];
  for (let i = 0; i < 3; i++) {
    const c = crop(sheet, i * 400, 60, i * 400 + 400, 460);
    shifted[i] = c.get_bytes();
    c.free();
  }
  sheet.free();
  const a = alignment(shifted);
  expect(a.rows.length).toBe(16);
  expect(a.ok).toBe(false);
});

test("face is a 128x128 PNG of at most 16 colors", () => {
  const out = face(CELLS[0]);
  expect(png(out)).toEqual({ width: 128, height: 128 });
  expect(palette(out).size).toBeLessThanOrEqual(16);
});

test("plate is a 256x256 PNG of three tones from ink to paper", () => {
  const out = plate(CELLS[0], INK, PAPER);
  expect(png(out)).toEqual({ width: 256, height: 256 });
  const seen = palette(out);
  expect(seen.size).toBe(3);
  expect(seen.has(rgb(INK))).toBe(true);
  expect(seen.has(rgb(PAPER))).toBe(true);
});

test("crest prints in a faction color", () => {
  const red: [number, number, number] = [158, 42, 43];
  const out = crest(CELLS[1], red, PAPER);
  expect(png(out)).toEqual({ width: 256, height: 256 });
  expect(palette(out).has(rgb(red))).toBe(true);
});

test("masthead is a 1600x400 plate", () => {
  expect(png(masthead(CELLS[0], INK, PAPER))).toEqual({ width: 1600, height: 400 });
});
