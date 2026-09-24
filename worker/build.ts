import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { UpstreamError, type Env } from "./jev";
import { luna } from "./luna";
import { failScenario, putMeta, putPack, putStatus } from "./db";
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
import { CONTENT_RULE, FRAME_RULES, HISTORIAN, sourceBlock, type GenCtx } from "./gen/prompts";

export type BuildParams = { id: string; prompt: string };

const ASTRA = "openai/gpt-6-astra";
const GROK = "x-ai/grok-4.7";
// timeout: an OpenRouter call can stall with no answer; without it the step, and the build, hang forever.
const RETRY = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
  timeout: "4 minutes",
} as const;
// A generation step already retries inside luna() and post(); a third layer multiplies the paid calls.
const GEN_RETRY = { ...RETRY, retries: { ...RETRY.retries, limit: 1 } } as const;
const PAGES = 6,
  PEOPLE = 12,
  PARTIES = 12;

const nonNull = <T>(a: (T | null)[]): T[] => a.filter((x): x is T => x !== null);
const plain = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// ---- refusals: one retry of the whole step on Grok, then the build fails with a plain message ----

// Narrow on purpose: a bare "content" or "policy" also matches an ordinary schema or content-type 400,
// which then costs a Grok retry and tells the player the models would not write their scenario.
const REFUSAL_MARKERS = [
  "refus",
  "content_policy",
  "content policy",
  "content_filter",
  "moderation",
  "safety",
  "cannot help",
  "can't help",
];
const refused = (e: unknown): e is UpstreamError =>
  e instanceof UpstreamError &&
  (e.status === 400 || e.status === 403) &&
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
      throw new NonRetryableError(
        "The models would not write this scenario. Try a different prompt.",
      );
    }
  }
}

// ---- fetch: the one step Task 4 left to the Workflow ----

const signedYear = (y: number) =>
  `${y < 0 ? "-" : ""}${String(Math.abs(y)).padStart(4, "0")}-01-01`;

async function fetchStep(p: Plan): Promise<Partial<GenCtx>> {
  const start = signedYear(p.year);
  const [wikipedia, people, parties] = await Promise.all([
    Promise.all(
      p.lookups.slice(0, PAGES).map((t) => fetchWikipedia(p.lang, t, p.keywords).catch(() => null)),
    ),
    Promise.all(p.people.slice(0, PEOPLE).map((l) => lookupPerson(l, start).catch(() => null))),
    Promise.all(p.parties.slice(0, PARTIES).map((l) => lookupParty(l).catch(() => null))),
  ]);
  return {
    sources: { wikipedia: nonNull(wikipedia), people: nonNull(people), parties: nonNull(parties) },
  };
}

// ---- frame: the Luna path first, Astra only when validation still fails ----

const FRAME_SYSTEM = [HISTORIAN, CONTENT_RULE, FRAME_RULES].join("\n");

async function frameStep(
  env: Env,
  id: string,
  ctx: GenCtx,
  repaired: { done: boolean },
): Promise<Partial<GenCtx>> {
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
    if (fixed.violations.length)
      throw new NonRetryableError(
        `The repair still broke the period: ${fixed.violations.slice(0, 2).join("; ")}`,
      );
    out = { frame: fixed.frame, calendar: cal };
  }
  const f = out.frame!;
  await putMeta(env, id, {
    lang: ctx.lang,
    title: f.title,
    era: f.era,
    place: f.place,
    description: f.description,
  });
  return out;
}

// ---- personas ----

// membersStep rejects a member carrying a real name of the period. Swapping in a surname the roster already
// holds clears most clashes for free, which beats paying for a rewrite round on a 60-seat chamber.
function renameClashes(members: Member[], real: string[]): Member[] {
  const surnames = [
    ...new Set(members.map((m) => m.name.trim().split(/\s+/).pop() ?? "").filter(Boolean)),
  ];
  return members.map((m) => {
    if (!matchName(m.name, real)) return m;
    const parts = m.name.trim().split(/\s+/);
    const name = surnames
      .map((s) => [...parts.slice(0, -1), s].join(" "))
      .find((n) => n && !matchName(n, real));
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
      throw new NonRetryableError(
        `The roster kept naming real people of the period: ${e2.violations.slice(0, 2).join("; ")}`,
      );
    }
  }
}

// ---- index and assemble ----

async function indexStep(env: Env, id: string, ctx: GenCtx) {
  const f = ctx.frame;
  const text = `${f.title} ${f.era} ${f.place} ${f.description} ${ctx.prompt}`;
  const r = (await env.AI.run("@cf/baai/bge-m3", { text: [text] } as never)) as any;
  const values: number[] | undefined = r?.data?.[0] ?? r?.response?.data?.[0];
  if (!Array.isArray(values)) throw new Error("bge-m3 returned no vector");
  await env.VEC.upsert([
    {
      id,
      values,
      metadata: { title: f.title, era: f.era, place: f.place, description: f.description },
    },
  ]);
}

function assemble(id: string, ctx: GenCtx): Pack {
  const f = ctx.frame;
  return PackSchema.parse({
    ...f,
    v: 1,
    id,
    lang: ctx.lang,
    prompt: ctx.prompt,
    fiction: ctx.fiction,
    sources: ctx.sources.wikipedia.map((p) => ({ title: p.title, url: p.url })),
    starts: f.factions.map((x) => f.starts.find((s) => s.faction === x.id)),
    members: ctx.members,
    citizens: ctx.citizens,
    deck: ctx.deck,
    calendar: ctx.calendar,
    constitution: ctx.constitution ?? undefined,
  });
}

// ---- the Workflow ----

export class ScenarioBuild extends WorkflowEntrypoint<Env, BuildParams> {
  async run(event: WorkflowEvent<BuildParams>, step: WorkflowStep) {
    const env = this.env;
    const { id, prompt } = event.payload;
    let ctx = {
      prompt,
      lang: "en",
      fiction: false,
      sources: { wikipedia: [], people: [], parties: [] },
    } as unknown as GenCtx;
    const merge = (p: Partial<GenCtx>) => {
      ctx = { ...ctx, ...p };
    };

    // step.do types its result through Serializable<T>, which a generic T can never satisfy; every step here returns JSON.
    const stage = <T>(
      name: string,
      fn: (env: Env) => Promise<T>,
      fragment?: (r: T) => unknown,
      config: WorkflowStepConfig = RETRY,
    ): Promise<T> =>
      step.do(name, config, async () => {
        await putStatus(env, id, name);
        const r = await fn(env);
        if (fragment) await putStatus(env, id, name, JSON.stringify(fragment(r)));
        return r as never;
      }) as Promise<T>;
    const gen = <T>(name: string, fn: (env: Env) => Promise<T>, fragment?: (r: T) => unknown) =>
      stage(name, (e) => onRefusal(e, name, fn), fragment, GEN_RETRY);

    try {
      const p = await gen(
        "plan",
        (e) => plan(e, ctx),
        (r) => ({
          kind: "plan",
          year: r.year,
          lookups: r.lookups,
          people: r.people,
          parties: r.parties,
          keywords: r.keywords,
        }),
      );
      merge({ fiction: p.fiction, lang: p.lang });
      merge(
        await stage(
          "fetch",
          () => fetchStep(p),
          (r) => ({
            kind: "sources",
            pages: r.sources!.wikipedia.map((w) => w.title),
            people: r.sources!.people.map((x) => x.label),
            parties: r.sources!.parties.map((x) => x.label),
          }),
        ),
      );
      merge(
        await gen(
          "facts",
          (e) => facts(e, ctx),
          (r) => ({
            kind: "facts",
            people: r.facts!.people.length,
            bodies: r.facts!.bodies.map((b) => b.name),
            events: r.facts!.dated_events.slice(0, 6),
          }),
        ),
      );
      merge(
        await stage(
          "calendar",
          (e) => calendarStep(e, ctx),
          (r) => ({
            kind: "calendar",
            start: r.calendar?.start_date ?? null,
            unit: r.calendar?.unit ?? null,
          }),
        ),
      );
      const frameRepaired = { done: false };
      merge(
        await stage(
          "frame",
          (e) => frameStep(e, id, ctx, frameRepaired),
          (r) => {
            const f = r.frame!;
            return {
              kind: "frame",
              title: f.title,
              era: f.era,
              place: f.place,
              description: f.description,
              vocabulary: f.vocabulary,
              theme: {
                fonts: f.theme.fonts,
                ink: f.theme.ink,
                paper: f.theme.paper,
                accent: f.theme.accent,
              },
              factions: f.factions.map((x) => ({
                id: x.id,
                name: x.name,
                short: x.short,
                color: x.color,
              })),
              problems: f.problems.slice(0, 3),
            };
          },
          GEN_RETRY,
        ),
      );
      merge(
        await gen(
          "constitution",
          (e) => constitution(e, ctx),
          (r) => ({
            kind: "constitution",
            holders: r.constitution!.holders.map((h) => ({
              id: h.id,
              name: h.name,
              where: h.where,
              weight: r.constitution!.retention.weights.find((w) => w.id === h.id)?.value ?? 0,
            })),
          }),
        ),
      );
      merge(
        await stage(
          "assign",
          (e) => assign(e, ctx),
          (r) => ({
            kind: "seats",
            members: r.members!.length,
            citizens: r.citizens!.length,
            byFaction: ctx.frame.factions.map((f) => ({
              id: f.id,
              seats: r.members!.filter((m) => m.faction === f.id).length,
            })),
          }),
        ),
      );
      merge(
        await gen(
          "names",
          (e) => names(e, ctx),
          (r) => ({ kind: "names", sample: r.members!.slice(0, 12).map((m) => m.name) }),
        ),
      );
      merge(
        await gen(
          "personas",
          (e) => personasStep(e, ctx),
          (r) => ({ kind: "members", names: r.members!.slice(0, 8).map((m) => m.name) }),
        ),
      );
      merge(
        await gen(
          "dedupe",
          (e) => dedupe(e, ctx),
          (r) => ({ kind: "dedupe", members: r.members!.length, citizens: r.citizens!.length }),
        ),
      );
      // A dedupe rewrite hands out a new name after membersStep's real-name check has already run.
      merge({ members: renameClashes(ctx.members, realNames(ctx.frame, ctx.facts)) });
      merge(
        await gen(
          "deck",
          (e) => deck(e, ctx),
          (r) => ({
            kind: "deck",
            cards: r.deck!.length,
            titles: r.deck!.slice(0, 5).map((c) => c.title_hint),
          }),
        ),
      );
      await stage("index", (e) => indexStep(e, id, ctx));
      // putPack writes status 'ready', so it is the last write of the build.
      await stage("assemble", async (e) => {
        const built = assemble(id, ctx);
        await putPack(e, id, built);
        return built;
      });
    } catch (e) {
      // Only the sentences the build writes on purpose are for the player; everything else is a log line.
      const why =
        e instanceof NonRetryableError ? plain(e) : "The build failed. Try another prompt.";
      await step.do("failed", RETRY, () => failScenario(env, id, why));
      throw e;
    }
  }
}
