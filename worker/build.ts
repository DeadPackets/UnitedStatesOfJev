// The scenario build, generation v2: plan, gather, roster, check and bible in order; then the world parts and the
// emblems as parallel steps, and the Luna people steps once the bible, briefing and systems have landed; then a style
// rewrite, the search index and the pack. Every step result stays under the Workflows 1 MiB cap: the pack is written
// to D1 inside its own step.
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
  type WorkflowStepConfig,
} from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import {
  buildSpend,
  failScenario,
  putFragment,
  putMeta,
  putPack,
  putPart,
  putStatus,
  recordCall,
} from "./db";
import { UpstreamError, type Env } from "./jev";
import type { Member } from "./pack";
import { parseThemeTokens } from "./tokens";
import { calendarOf, factsOf, frameOf, packOf, type People } from "./gen/assemble";
import { assignCitizens, assignMembers } from "./gen/assign";
import { dedupe } from "./gen/dedupe";
import { deck } from "./gen/deck";
import { emblemsFor } from "./gen/emblems";
import { gather, type Gathered } from "./gen/gather";
import { rewriteWorld } from "./gen/lint";
import {
  GROK,
  ModelStop,
  callModel,
  nullOnStop,
  type CallRequest,
  type Caller,
  type StopReason,
  type Usage,
} from "./gen/openrouter";
import { citizensStep, membersStep, names } from "./gen/personas";
import type { GenCtx } from "./gen/prompts";
import { settleRoster, writePlan, writeRoster } from "./gen/roster";
import type { Parts, Plan, World } from "./gen/schemas";
import { NeedsRepair, matchName, realNames } from "./gen/validate";
import {
  checkBible,
  checkPart,
  mergeWorld,
  planJobs,
  runJob,
  worldPrefix,
  writeBible,
  type Job,
  type WorldContext,
} from "./gen/world";

export type BuildParams = { id: string; prompt: string };

const DEFAULT_COST_CAP = 3; // Decision 15: dollars of Opus and Grok one build may spend
// The emblem review and the style rewrite cost $0.01 to $0.05 each and run last; every other call stops this far short
// of the cap, so the cap never skips them (Ottoman's golden run lost both to a $2 cap).
const TAIL_CALLS = new Set(["emblem-review", "rewrite"]);
const TAIL_RESERVE = 0.25;
// A world call may wait 10 minutes on Opus, 20 on Grok after a filter, and its one repair as long again.
const MODEL_STEP: WorkflowStepConfig = {
  retries: { limit: 1, delay: "10 seconds", backoff: "constant" },
  timeout: "45 minutes",
};
// timeout: an OpenRouter call can stall with no answer; without it the step, and the build, hang forever.
const RETRY: WorkflowStepConfig = {
  retries: { limit: 2, delay: "5 seconds", backoff: "exponential" },
  timeout: "4 minutes",
};
const FETCH_STEP: WorkflowStepConfig = { ...RETRY, timeout: "10 minutes" };
// A Luna step already retries inside luna() and post(); a third layer multiplies the paid calls.
const LUNA_STEP: WorkflowStepConfig = {
  ...RETRY,
  retries: { limit: 1, delay: "5 seconds", backoff: "exponential" },
};
// The parts the pack cannot be built without; a missing groups, chamber, factions or theme part leaves defaults.
const REQUIRED = new Set(["briefing", "ledgers", "instruments", "systems"]);
// The longest parts start at once and write the bible to the cache; the rest start a few seconds later and read it,
// since parallel calls on a cold block each pay to write it. They still end before the systems part (53 s on Ottoman).
const FIRST_PARTS = new Set(["systems", "briefing"]);
const CACHE_WAIT_MS = 5000;

const plain = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 300);

// ---- the model calls: one transport, the per-build ledger, the budget ----

function callerFor(env: Env, id: string): Caller {
  const cap = Number(env.BUILD_COST_CAP ?? DEFAULT_COST_CAP);
  const transport = {
    key: env.OPENROUTER_API_KEY,
    onUsage: (usage: Usage) => recordCall(env, id, usage),
  };
  return async <T>(request: CallRequest<T>): Promise<T> => {
    // Parallel parts can each start one call past the limit; the overshoot is at most one call per part. Past the cap
    // the build stops: callers leave out a step only for a model stop, never for the budget.
    const limit = TAIL_CALLS.has(request.name) ? cap : cap - TAIL_RESERVE;
    if ((await buildSpend(env, id)) >= limit)
      throw new NonRetryableError("This world ran past its build budget. Try a narrower prompt.");
    return callModel(transport, request);
  };
}

// Lesson 4: a filtered or cut-off answer is final. An upstream failure is left to the step's one retry.
const STOPPED: Record<Exclude<StopReason, "upstream">, string> = {
  content_filter: "The models would not write this world. Try a different prompt.",
  length: "Part of this world ran too long to finish. Try a narrower prompt.",
  invalid: "The generator returned an answer it could not read twice. Try again in a minute.",
};
function stopped(error: unknown): never {
  if (error instanceof ModelStop && error.reason !== "upstream")
    throw new NonRetryableError(STOPPED[error.reason]);
  throw error;
}

// ---- the Luna people steps: one retry of the whole step on Grok after a refusal, as before ----

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

// membersStep rejects a member carrying a real name of the period. Swapping in a surname the roster already
// holds clears most clashes for free, which beats paying for a rewrite round on a 72-seat chamber.
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

// ---- fragments: what the build screen can show before the pack exists ----

function fragmentOf(job: Job, part: unknown): Record<string, unknown> | null {
  switch (job.kind) {
    case "groups":
      return {
        kind: "groups",
        rows: (part as Parts["groups"]).groups.map(({ id, icon, color, wants, hates, strike }) => ({
          id,
          icon,
          color,
          wants,
          hates,
          strike,
        })),
      };
    case "chamber": {
      const { chamber } = part as Parts["chamber"];
      return {
        kind: "chamber",
        name: chamber.name,
        shape: chamber.shape,
        factions: chamber.factions.map(({ id, color, with_you }) => ({ id, color, with_you })),
      };
    }
    case "briefing": {
      const written = part as Parts["briefing"];
      return {
        kind: "briefing",
        role: written.ruler.role,
        situation: written.briefing.situation,
        problems: written.problems.slice(0, 3),
        pledges: written.pledges.map((pledge) => pledge.text),
      };
    }
    case "theme":
      // Only validated tokens leave the worker; a palette the checks cannot fix is the default.
      return { kind: "theme", tokens: parseThemeTokens((part as Parts["theme"]).theme).tokens };
    default:
      return null;
  }
}

// ---- the search entry: a failure leaves the world loadable by id and by the daily, not matchable (Decision 12) ----

async function indexWorld(env: Env, id: string, text: string, metadata: Record<string, string>) {
  const r = (await env.AI.run("@cf/baai/bge-m3", { text: [text] } as never)) as any;
  const values: number[] | undefined = r?.data?.[0] ?? r?.response?.data?.[0];
  if (!Array.isArray(values)) throw new Error("bge-m3 returned no vector");
  await env.VEC.upsert([{ id, values, metadata }]);
}

// ---- the Workflow ----

export class ScenarioBuild extends WorkflowEntrypoint<Env, BuildParams> {
  async run(event: WorkflowEvent<BuildParams>, step: WorkflowStep) {
    const env = this.env;
    const { id, prompt } = event.payload;
    const started = event.timestamp.getTime();
    const call = callerFor(env, id);
    const show = (fragment: Record<string, unknown>) =>
      putFragment(env, id, { ...fragment, at: Date.now() - started });
    // step.do types its result through Serializable<T>, which a generic T can never satisfy; every step here returns JSON.
    const run = <T>(
      name: string,
      fn: () => Promise<T>,
      config: WorkflowStepConfig = MODEL_STEP,
    ): Promise<T> => step.do(name, config, async () => (await fn()) as never) as Promise<T>;

    try {
      const plan: Plan = await run("plan", async () => {
        await putStatus(env, id, "plan");
        const written = await writePlan(
          call,
          prompt,
          new Date(started).toISOString().slice(0, 10),
        ).catch(stopped);
        await show({
          kind: "plan",
          seat: written.seat.office,
          holder: written.seat.holder,
          start: written.start_date,
          end: written.term_end,
          lookups: written.lookups,
        });
        return written;
      });

      const found: Gathered = await run(
        "gather",
        async () => {
          await putStatus(env, id, "gather");
          const gathered = await gather(plan);
          await show({ kind: "sources", pages: gathered.docs.map((doc) => doc.title) });
          return gathered;
        },
        FETCH_STEP,
      );

      const drafted = await run("roster", async () => {
        await putStatus(env, id, "roster");
        const written = await writeRoster(call, prompt, plan, found).catch(stopped);
        await show({
          kind: "roster",
          groups: written.roster.groups.map((group) => ({
            id: group.id,
            name: group.name,
            sits: group.sits,
            seats: group.seats,
            wants: group.wants,
          })),
        });
        return written;
      });

      const { roster, gathered } = await run("check", async () => {
        await putStatus(env, id, "check");
        const settled = await settleRoster(call, drafted.roster, {
          plan,
          gathered: drafted.gathered,
        }).catch(stopped);
        await putPart(env, id, "roster-checks", { before: settled.before, after: settled.after });
        const blocking = settled.after.filter((fail) => fail.blocking);
        if (blocking.length)
          throw new NonRetryableError(
            `This world does not hold together (${blocking[0].message.slice(0, 120)}). Try a narrower prompt.`,
          );
        return { roster: settled.roster, gathered: settled.gathered };
      });

      const prefix = worldPrefix(prompt, plan, roster, gathered);
      const canon = await run("bible", async () => {
        await putStatus(env, id, "bible");
        let written = await writeBible(call, prefix).catch(stopped);
        const before = checkBible(written.bible, roster);
        if (before.length)
          written = await writeBible(call, prefix, { ...written, fails: before }).catch(stopped);
        const after = before.length ? checkBible(written.bible, roster) : [];
        await putPart(env, id, "bible-checks", { before, after });
        if (after.length)
          throw new NonRetryableError(
            "The world's canon would not come out whole. Try again in a minute.",
          );
        const { bible } = written;
        await show({
          kind: "bible",
          title: bible.title,
          era: bible.era,
          place: bible.place,
          voice: bible.house_voice,
          vocabulary: bible.vocabulary,
          groups: bible.groups.map(({ id: group, name, short, identity, face }) => ({
            id: group,
            name,
            short,
            identity,
            face,
          })),
        });
        await putStatus(env, id, "sections");
        return written;
      });

      const context: WorldContext = {
        prefix,
        roster,
        bible: canon.bible,
        model: canon.model,
        plan,
        gathered,
      };
      const jobs = planJobs(roster);
      const partOf = (job: Job): Promise<unknown> =>
        run(`part-${job.name}`, async () => {
          let part: unknown;
          if (!FIRST_PARTS.has(job.name))
            await new Promise((resolve) => setTimeout(resolve, CACHE_WAIT_MS));
          try {
            part = await runJob(call, job, context);
          } catch (error) {
            if (REQUIRED.has(job.name) || !(error instanceof ModelStop)) stopped(error);
            console.error(`part ${job.name} left out`, plain(error));
            return null;
          }
          const before = checkPart(job, part, context);
          let after = before;
          if (before.length) {
            // Section-scoped repair: only this part is written again, with its own failures.
            const again = await runJob(call, job, context, { part, fails: before }).catch(
              nullOnStop,
            );
            const recheck = again === null ? null : checkPart(job, again, context);
            if (recheck && recheck.length <= before.length) {
              part = again;
              after = recheck;
            }
          }
          await putPart(env, id, `checks-${job.name}`, { before, after });
          if (after.some((fail) => fail.blocking))
            throw new NonRetryableError(
              `Part of this world would not come out whole (${job.name}). Try again in a minute.`,
            );
          const fragment = fragmentOf(job, part);
          if (fragment) await show(fragment);
          return part;
        });
      const partSteps = new Map(jobs.map((job) => [job.name, partOf(job)]));

      const emblemStep = run("emblems", async () => {
        const { bible } = canon;
        const result = await emblemsFor(
          call,
          {
            title: bible.title,
            era: bible.era,
            place: bible.place,
            houseVoice: bible.house_voice,
            kind: plan.kind,
          },
          roster.groups.map((group) => ({
            id: group.id,
            name: group.name,
            identity: bible.groups.find((entry) => entry.id === group.id)?.identity ?? group.wants,
          })),
        );
        await putPart(env, id, "emblems", result.report);
        await show({ kind: "emblems", emblems: result.emblems });
        return result.emblems;
      });

      // Decision 20: the people need words only the bible, briefing and systems write, so they start when those land.
      const peopleStep = (async (): Promise<People> => {
        const [briefing, systems] = await Promise.all([
          partSteps.get("briefing")!,
          partSteps.get("systems")!,
        ]);
        const frame = frameOf({
          id,
          prompt,
          plan,
          gathered,
          roster,
          world: {
            bible: canon.bible,
            briefing: briefing as Parts["briefing"],
            systems: systems as Parts["systems"],
          },
        });
        const base: GenCtx = {
          prompt,
          lang: "en",
          fiction: plan.kind >= 6,
          sources: { wikipedia: [], people: [], parties: [] },
          facts: factsOf(plan, roster, canon.bible),
          frame,
          calendar: calendarOf(plan),
          constitution: null,
          members: assignMembers(frame),
          citizens: assignCitizens(frame),
          deck: [],
        };
        const luna = <T>(name: string, fn: (env: Env) => Promise<T>) =>
          run(name, () => onRefusal(env, name, fn), LUNA_STEP);
        const deckStep = luna("deck", (e) => deck(e, base));
        const named: GenCtx = {
          ...base,
          ...(await luna("names", async (e) => {
            await putStatus(env, id, "people");
            await putMeta(env, id, {
              lang: "en",
              title: frame.title,
              era: frame.era,
              place: frame.place,
              description: frame.description,
            });
            return names(e, base);
          })),
        };
        const written: GenCtx = {
          ...named,
          ...(await luna("personas", (e) => personasStep(e, named))),
        };
        const deduped: GenCtx = {
          ...written,
          ...(await luna("dedupe", (e) => dedupe(e, written))),
        };
        const { deck: cards } = await deckStep;
        return {
          // A dedupe rewrite hands out a new name after membersStep's real-name check has already run.
          members: renameClashes(deduped.members, realNames(deduped.frame, deduped.facts)),
          citizens: deduped.citizens,
          deck: cards ?? [],
        };
      })();

      const [parts, emblems, people] = await Promise.all([
        Promise.all(jobs.map((job) => partSteps.get(job.name)!)),
        emblemStep,
        peopleStep,
      ]);

      const world: World = await run("rewrite", async () => {
        await putStatus(env, id, "finish");
        const merged = mergeWorld(
          roster,
          canon.bible,
          Object.fromEntries(jobs.map((job, i) => [job.name, parts[i]])),
          jobs,
        );
        const rewritten = await rewriteWorld(call, merged, canon.model);
        await putPart(env, id, "lint", { before: rewritten.before.length, after: rewritten.after });
        await putPart(env, id, "world", rewritten.world); // the golden sheet reads pledge quotes and targets here
        return rewritten.world;
      });

      await run(
        "index",
        async () => {
          const frame = frameOf({ id, prompt, plan, gathered, roster, world });
          const text = `${frame.title} ${frame.era} ${frame.place} ${frame.description} ${prompt}`;
          const metadata = {
            title: frame.title,
            era: frame.era,
            place: frame.place,
            description: frame.description,
          };
          await indexWorld(env, id, text, metadata).catch((error) =>
            console.error(`index ${id}`, plain(error)),
          );
        },
        RETRY,
      );

      await run(
        "assemble",
        async () => {
          let pack;
          try {
            pack = packOf({ id, prompt, plan, gathered, roster, world, emblems }, people);
          } catch (error) {
            await putPart(env, id, "pack-error", plain(error));
            throw new NonRetryableError(
              "The world's pieces did not fit together. Try again in a minute.",
            );
          }
          // putPack writes status 'ready', so it is the last write of the build.
          await putPack(env, id, pack);
          return JSON.stringify(pack).length;
        },
        RETRY,
      );
    } catch (e) {
      // Only the sentences the build writes on purpose are for the player; everything else is a log line.
      const why =
        e instanceof NonRetryableError ? plain(e) : "The build failed. Try another prompt.";
      await step.do("failed", RETRY, () => failScenario(env, id, why));
      throw e;
    }
  }
}
