import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { UpstreamError, type Env } from "./jev";
import { luna } from "./luna";
import { alignment, cells, crest, face, masthead as mastheadPlate, muse, plate, type Rgb } from "./art";
import { failScenario, markPortrait, putMeta, putPack, putStatus } from "./db";
import { PackSchema, type Member, type Pack } from "./pack";
import { fetchWikipedia, lookupParty, lookupPerson } from "./sources";
import { plan, type Plan } from "./gen/plan";
import { facts } from "./gen/facts";
import { FrameSchema, frame, settle } from "./gen/frame";
import { assign } from "./gen/assign";
import { membersStep, citizensStep, names } from "./gen/personas";
import { dedupe } from "./gen/dedupe";
import { deck } from "./gen/deck";
import { calendarStep } from "./gen/calendar";
import { constitution } from "./gen/constitution";
import { NeedsRepair, matchName, realNames } from "./gen/validate";
import { CONTENT_RULE, FRAME_RULES, HISTORIAN, chunk, sourceBlock, type GenCtx } from "./gen/prompts";

export type BuildParams = { id: string; prompt: string };

const ASTRA = "openai/gpt-6-astra";
const GROK = "x-ai/grok-4.7";
// A live sheet printed name captions under each bust without the last four clauses.
const NO_TEXT = "no text, no captions, no labels, no borders, no watermark";
// timeout: an OpenRouter call can stall with no answer; without it the step, and the build, hang forever.
const RETRY = { retries: { limit: 2, delay: "5 seconds", backoff: "exponential" }, timeout: "4 minutes" } as const;
// A generation step already retries inside luna() and post(); a third layer multiplies the paid calls.
const GEN_RETRY = { ...RETRY, retries: { ...RETRY.retries, limit: 1 } } as const;
const PAGES = 6, PEOPLE = 12, PARTIES = 12;
export const SHEET = 16;

const nonNull = <T>(a: (T | null)[]): T[] => a.filter((x): x is T => x !== null);
const rgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const plain = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// ---- refusals: one retry of the whole step on Grok, then the build fails with a plain message ----

// Narrow on purpose: a bare "content" or "policy" also matches an ordinary schema or content-type 400,
// which then costs a Grok retry and tells the player the models would not write their scenario.
const REFUSAL_MARKERS = ["refus", "content_policy", "content policy", "content_filter", "moderation", "safety", "cannot help", "can't help"];
const refused = (e: unknown): e is UpstreamError =>
  e instanceof UpstreamError && (e.status === 400 || e.status === 403) &&
  REFUSAL_MARKERS.some((m) => e.message.toLowerCase().includes(m));

async function onRefusal<T>(env: Env, step: string, fn: (env: Env) => Promise<T>): Promise<T> {
  try {
    return await fn(env);
  } catch (e) {
    if (!refused(e)) {
      if (e instanceof UpstreamError) {
        console.error(`upstream error at ${step}`, e.message);
        throw new NonRetryableError(`The generator failed at ${step}. Try again in a minute.`);
      }
      throw e;
    }
    try {
      return await fn({ ...env, MODEL: GROK });
    } catch {
      throw new NonRetryableError("The models would not write this scenario. Try a different prompt.");
    }
  }
}

// ---- fetch: the one step Task 4 left to the Workflow ----

const signedYear = (y: number) => `${y < 0 ? "-" : ""}${String(Math.abs(y)).padStart(4, "0")}-01-01`;

async function fetchStep(p: Plan): Promise<Partial<GenCtx>> {
  const start = signedYear(p.year);
  const [wikipedia, people, parties] = await Promise.all([
    Promise.all(p.lookups.slice(0, PAGES).map((t) => fetchWikipedia(p.lang, t, p.keywords).catch(() => null))),
    Promise.all(p.people.slice(0, PEOPLE).map((l) => lookupPerson(l, start).catch(() => null))),
    Promise.all(p.parties.slice(0, PARTIES).map((l) => lookupParty(l).catch(() => null))),
  ]);
  return { sources: { wikipedia: nonNull(wikipedia), people: nonNull(people), parties: nonNull(parties) } };
}

// ---- frame: the Luna path first, Astra only when validation still fails ----

const FRAME_SYSTEM = [HISTORIAN, CONTENT_RULE, FRAME_RULES].join("\n");

async function frameStep(env: Env, id: string, ctx: GenCtx, repaired: { done: boolean }): Promise<Partial<GenCtx>> {
  let out: Partial<GenCtx>;
  try {
    out = await onRefusal(env, "frame", (e) => frame(e, ctx));
  } catch (err) {
    if (!(err instanceof NeedsRepair)) throw err;
    // ponytail: repaired lives in a closure outside step.do, so it only caps the Astra repair to
    // once per build if the retry replays in the same isolate; if not, the retries.limit: 1 below is the real cap.
    if (repaired.done) throw err;
    repaired.done = true;
    console.warn(`frame repair ${id}`, err.violations.join("; "));
    const user = [
      sourceBlock(ctx, ctx.facts),
      `An earlier attempt returned this pack:\n${err.last}`,
      `Validation found these violations:\n- ${err.violations.join("\n- ")}`,
      "Return the corrected full pack. Keep everything else the same. Never mention the game, its design, or that anything is fictional.",
    ].join("\n\n");
    const f = await luna(env, FrameSchema, "frame", FRAME_SYSTEM, user, 9000, ASTRA);
    const cal = ctx.calendar ?? { start_date: f.start_date, unit: "week" as const };
    const fixed = settle({ ...f, start_date: cal.start_date }, ctx.facts, cal.start_date);
    if (fixed.violations.length) throw new NonRetryableError(`The repair still broke the period: ${fixed.violations.slice(0, 2).join("; ")}`);
    out = { frame: fixed.frame, calendar: cal };
  }
  const f = out.frame!;
  await putMeta(env, id, { lang: ctx.lang, title: f.title, era: f.era, place: f.place, description: f.description });
  return out;
}

// ---- personas ----

// membersStep rejects a member carrying a real name of the period. Swapping in a surname the roster already
// holds clears most clashes for free, which beats paying for a rewrite round on a 60-seat chamber.
function renameClashes(members: Member[], real: string[]): Member[] {
  const surnames = [...new Set(members.map((m) => m.name.trim().split(/\s+/).pop() ?? "").filter(Boolean))];
  return members.map((m) => {
    if (!matchName(m.name, real)) return m;
    const parts = m.name.trim().split(/\s+/);
    const name = surnames.map((s) => [...parts.slice(0, -1), s].join(" ")).find((n) => n && !matchName(n, real));
    return name ? { ...m, name } : m;
  });
}

async function personasStep(env: Env, ctx: GenCtx): Promise<Partial<GenCtx>> {
  const real = realNames(ctx.frame, ctx.facts);
  const both = async (c: GenCtx) => {
    const [m, z] = await Promise.all([membersStep(env, c), citizensStep(env, c)]);
    return { ...m, ...z };
  };
  try {
    return await both({ ...ctx, members: renameClashes(ctx.members, real) });
  } catch (e) {
    if (!(e instanceof NeedsRepair)) throw e;
    const fresh = { ...ctx, ...(await names(env, ctx)) };
    try {
      return await both({ ...fresh, members: renameClashes(fresh.members, real) });
    } catch (e2) {
      if (!(e2 instanceof NeedsRepair)) throw e2;
      throw new NonRetryableError(`The roster kept naming real people of the period: ${e2.violations.slice(0, 2).join("; ")}`);
    }
  }
}

// ---- art: written to R2 inside the step, because Workflows cap a step result at 1 MiB ----

const put = (env: Env, key: string, bytes: Uint8Array) =>
  env.ART.put(key, bytes as unknown as ArrayBuffer, { httpMetadata: { contentType: "image/png" } }).then(() => key);

async function artStep(env: Env, id: string, ctx: GenCtx): Promise<Pack["art"]> {
  const t = ctx.frame.theme, ink = rgb(t.ink), paper = rgb(t.paper);
  const ornament = t.ornament === "none" ? "plain" : `${t.ornament} ornament`;
  const [head, ...crests] = await Promise.all([
    muse(env, `wide ${ctx.frame.era} engraving of a landmark of ${ctx.frame.place}, ${NO_TEXT}`, "4:1")
      .then((b) => put(env, `scenarios/${id}/masthead.png`, mastheadPlate(b, ink, paper))),
    ...ctx.frame.factions.map((f) =>
      muse(env, `${f.name} emblem, flat, centered, ${ornament}, ${NO_TEXT}`, "1:1")
        .then((b) => put(env, `scenarios/${id}/crests/${f.id}.png`, crest(b, rgb(f.color), paper)))),
  ]);
  return { masthead: head, crests: ctx.frame.factions.map((f, i) => ({ id: f.id, value: crests[i] })), portraits: [] };
}

// ---- portraits: after ready, never blocking play ----

const AGE: Record<Member["years"], string> = { new: "young", mid: "middle-aged", long: "old" };

export const sheetPrompt = (pack: Pack, group: Member[]) =>
  `4x4 grid of 16 different ${pack.era} ${pack.vocabulary.member}, passport framing, head and shoulders, same face size, eyes on one horizontal line, plain wall. ` +
  `Faces in reading order: ${group.map((m) => m.gender && m.look ? `${AGE[m.years]} ${m.gender}, ${m.look}, ${m.temperament}` : `${AGE[m.years]} and ${m.temperament}`).join("; ")}. ${NO_TEXT}`;

// One sheet of at most 16 faces. The GameDO reuses it for the members a midterm puts in the chamber.
export async function portraitSheet(env: Env, scenario: string, pack: Pack, group: Member[]): Promise<boolean> {
  const ink = rgb(pack.theme.ink), paper = rgb(pack.theme.paper);
  try {
    const prompt = sheetPrompt(pack, group);
    let cut = cells(await muse(env, prompt, "1:1"));
    if (!alignment(cut).ok) cut = cells(await muse(env, prompt, "1:1"));
    await Promise.all(group.map(async (m, i) => {
      const cell = cut[i];
      if (!cell) return;
      await Promise.all([
        put(env, `scenarios/${scenario}/members/${m.id}.png`, face(cell)),
        put(env, `scenarios/${scenario}/members/${m.id}-plate.png`, plate(cell, ink, paper)),
      ]);
    }));
    return true;
  } catch (e) {
    console.warn(`portraits ${scenario}`, plain(e));
    return false;
  }
}

async function portraitsStep(env: Env, id: string, pack: Pack) {
  // The sheets run at once but share one pack row, so the D1 read-modify-writes are chained.
  let writes: Promise<unknown> = Promise.resolve();
  await Promise.all(chunk(pack.members, SHEET).map(async (group, gi) => {
    const ok = await portraitSheet(env, id, pack, group);
    writes = writes.then(() => markPortrait(env, id, `sheet-${gi + 1}`, ok ? "done" : "failed"));
  }));
  await writes;
}

// ---- index and assemble ----

async function indexStep(env: Env, id: string, ctx: GenCtx) {
  const f = ctx.frame;
  const text = `${f.title} ${f.era} ${f.place} ${f.description} ${ctx.prompt}`;
  const r = (await env.AI.run("@cf/baai/bge-m3", { text: [text] } as never)) as any;
  const values: number[] | undefined = r?.data?.[0] ?? r?.response?.data?.[0];
  if (!Array.isArray(values)) throw new Error("bge-m3 returned no vector");
  await env.VEC.upsert([{ id, values, metadata: { title: f.title, era: f.era, place: f.place, description: f.description } }]);
}

function assemble(id: string, ctx: GenCtx, art: Pack["art"]): Pack {
  const f = ctx.frame;
  return PackSchema.parse({
    ...f, v: 1, id, lang: ctx.lang, prompt: ctx.prompt, fiction: ctx.fiction,
    sources: ctx.sources.wikipedia.map((p) => ({ title: p.title, url: p.url })),
    starts: f.factions.map((x) => f.starts.find((s) => s.faction === x.id)),
    members: ctx.members, citizens: ctx.citizens, deck: ctx.deck, art, calendar: ctx.calendar,
    constitution: ctx.constitution ?? undefined,
  });
}

// ---- the Workflow ----

export class ScenarioBuild extends WorkflowEntrypoint<Env, BuildParams> {
  async run(event: WorkflowEvent<BuildParams>, step: WorkflowStep) {
    const env = this.env;
    const { id, prompt } = event.payload;
    let ctx = { prompt, lang: "en", fiction: false, sources: { wikipedia: [], people: [], parties: [] } } as unknown as GenCtx;
    const merge = (p: Partial<GenCtx>) => { ctx = { ...ctx, ...p }; };

    // step.do types its result through Serializable<T>, which a generic T can never satisfy; every step here returns JSON.
    const stage = <T>(name: string, fn: (env: Env) => Promise<T>, fragment?: (r: T) => unknown, config: WorkflowStepConfig = RETRY): Promise<T> =>
      step.do(name, config, async () => {
        await putStatus(env, id, name);
        const r = await fn(env);
        if (fragment) await putStatus(env, id, name, JSON.stringify(fragment(r)));
        return r as never;
      }) as Promise<T>;
    const gen = <T>(name: string, fn: (env: Env) => Promise<T>, fragment?: (r: T) => unknown) =>
      stage(name, (e) => onRefusal(e, name, fn), fragment, GEN_RETRY);

    let pack: Pack;
    try {
      const p = await gen("plan", (e) => plan(e, ctx));
      merge({ fiction: p.fiction, lang: p.lang });
      merge(await stage("fetch", () => fetchStep(p)));
      merge(await gen("facts", (e) => facts(e, ctx)));
      merge(await stage("calendar", (e) => calendarStep(e, ctx)));
      const frameRepaired = { done: false };
      merge(await stage("frame", (e) => frameStep(e, id, ctx, frameRepaired), (r) => {
        const f = r.frame!;
        return {
          kind: "frame", title: f.title, era: f.era, place: f.place, description: f.description, vocabulary: f.vocabulary,
          theme: { fonts: f.theme.fonts, ink: f.theme.ink, paper: f.theme.paper, accent: f.theme.accent },
          factions: f.factions.map((x) => ({ id: x.id, name: x.name, short: x.short, color: x.color })),
          problems: f.problems.slice(0, 3),
        };
      }, GEN_RETRY));
      merge(await gen("constitution", (e) => constitution(e, ctx), (r) => ({
        kind: "constitution",
        holders: r.constitution!.holders.map((h) => ({
          id: h.id, name: h.name, where: h.where,
          weight: r.constitution!.retention.weights.find((w) => w.id === h.id)?.value ?? 0,
        })),
      })));
      merge(await stage("assign", (e) => assign(e, ctx)));
      merge(await gen("names", (e) => names(e, ctx)));
      merge(await gen("personas", (e) => personasStep(e, ctx),
        (r) => ({ kind: "members", names: r.members!.slice(0, 8).map((m) => m.name) })));
      merge(await gen("dedupe", (e) => dedupe(e, ctx)));
      // A dedupe rewrite hands out a new name after membersStep's real-name check has already run.
      merge({ members: renameClashes(ctx.members, realNames(ctx.frame, ctx.facts)) });
      merge(await gen("deck", (e) => deck(e, ctx)));
      const art = await stage("art", (e) => artStep(e, id, ctx), (r) => ({ kind: "art", masthead: r.masthead, crests: r.crests.length }));
      await stage("index", (e) => indexStep(e, id, ctx));
      // putPack writes status 'ready', so it is the last write of the build.
      pack = await stage("assemble", async (e) => {
        const built = assemble(id, ctx, art);
        await putPack(e, id, built);
        return built;
      });
    } catch (e) {
      // Only the sentences the build writes on purpose are for the player; everything else is a log line.
      const why = e instanceof NonRetryableError ? plain(e) : "The build failed. Try another prompt.";
      await step.do("failed", RETRY, () => failScenario(env, id, why));
      throw e;
    }

    try {
      await step.do("portraits", RETRY, () => portraitsStep(env, id, pack));
    } catch (e) {
      console.warn(`portraits ${id}`, plain(e));
    }
  }
}
