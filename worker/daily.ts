import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import type { Env } from "./jev";
import { getDaily, getScenario, listDailies, newScenario, putDaily, takeDaily } from "./db";
import { dailyPrompt, duplicate } from "./gen/daily-prompt";

export type DailyParams = { day: string };

const RETRY = {
  retries: { limit: 2, delay: "30 seconds", backoff: "exponential" },
  timeout: "5 minutes",
} as const;
export const PAST_DAILIES = 30; // TUNE: past dailies the proposer is shown
export const BUILD_POLLS = 60; // TUNE: 60 polls is 30 minutes; a v2 build is estimated at 250 to 290 s, a Grok part up to 20 minutes
export const POLL_SECONDS = "30 seconds"; // TUNE
const PROPOSE_TRIES = 2; // TUNE: rerolls before a duplicate is accepted anyway

const scenarioId = () =>
  [...crypto.getRandomValues(new Uint8Array(6))].map((b) => (b % 36).toString(36)).join("");

export class DailyBuild extends WorkflowEntrypoint<Env, DailyParams> {
  async run(event: WorkflowEvent<DailyParams>, step: WorkflowStep) {
    const env = this.env;
    const { day } = event.payload;

    const mine = await step.do("claim", RETRY, async () => {
      if (await takeDaily(env, day)) return true;
      // A retry after our own INSERT committed sees changes = 0. The row is still ours until it names a scenario.
      const row = await getDaily(env, day);
      return row?.status === "building" && !row.scenario;
    });
    if (!mine) return;

    const prompt = await step.do("propose", RETRY, async () => {
      const past = await listDailies(env, PAST_DAILIES);
      let last = "";
      for (let i = 0; i < PROPOSE_TRIES; i++) {
        last = await dailyPrompt(env, past);
        if (!duplicate(last, past)) return last;
      }
      // Two duplicates running means the model has run out of room, not that today has no term.
      return last;
    });

    // The id is minted in its own step, so a retry of the build reuses it instead of starting a second pack.
    const id = await step.do("id", RETRY, async () => scenarioId());
    const scenario = await step.do("build", RETRY, async () => {
      if (!(await getScenario(env, id))) {
        await newScenario(env, id, prompt);
        await env.BUILD.create({ id, params: { id, prompt } });
      }
      await putDaily(env, day, prompt, id, "building");
      return id;
    });

    for (let i = 0; i < BUILD_POLLS; i++) {
      await step.sleep(`wait-${i}`, POLL_SECONDS);
      const status = await step.do(
        `check-${i}`,
        RETRY,
        async () => (await getScenario(env, scenario))?.status ?? "missing",
      );
      if (status === "ready") {
        await step.do("publish", RETRY, () => putDaily(env, day, prompt, scenario, "ready"));
        return;
      }
      if (status === "failed") break;
    }
    await step.do("failed", RETRY, () => putDaily(env, day, prompt, scenario, "failed"));
  }
}
