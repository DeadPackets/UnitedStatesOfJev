import { expect, test } from "bun:test";
import { z } from "zod";
import { ModelStop, callModel, type Usage } from "./openrouter";

// A fake OpenRouter: each request takes the next canned answer, and every request body is kept.
function server(answers: { content: string; finish?: string }[]) {
  const bodies: any[] = [];
  const usages: Usage[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const answer = answers[bodies.length - 1];
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: answer.content }, finish_reason: answer.finish ?? "stop" }],
        usage: {
          cost: 0.01,
          prompt_tokens: 100,
          completion_tokens: 50,
          prompt_tokens_details: { cached_tokens: 80 },
        },
      }),
    );
  }) as unknown as typeof fetch;
  return {
    bodies,
    usages,
    transport: { key: "test", onUsage: (usage: Usage) => void usages.push(usage), fetcher },
  };
}
const Answer = z.object({ title: z.string(), seats: z.number().int().min(1) });
const request = { name: "test", schema: Answer, system: "system", user: "user", maxTokens: 100 };

test.each([
  ["plain JSON", '{"title":"A","seats":3}'],
  ["JSON in code fences", '```json\n{"title":"A","seats":3}\n```'],
  ["JSON after a sentence", 'Here it is: {"title":"A","seats":3} Done.'],
])("an answer as %s parses and its usage is recorded", async (_label, content) => {
  const fake = server([{ content }]);
  expect(await callModel(fake.transport, request)).toEqual({ title: "A", seats: 3 });
  expect(fake.usages.map((usage) => [usage.cost, usage.cached])).toEqual([[0.01, 80]]);
});

test("an answer that fails zod gets one corrective turn naming the error, and both answers are paid", async () => {
  const fake = server([
    { content: '{"title":"A","seats":0}' },
    { content: '{"title":"A","seats":2}' },
  ]);
  expect(await callModel(fake.transport, request)).toEqual({ title: "A", seats: 2 });
  expect(fake.usages).toHaveLength(2);
  expect(JSON.stringify(fake.bodies[1].messages.at(-1))).toContain("seats");
});

test("two invalid answers stop the call as invalid", async () => {
  const fake = server([{ content: "no json" }, { content: '{"title":"A"}' }]);
  const error = await callModel(fake.transport, request).catch((caught) => caught);
  expect(error).toBeInstanceOf(ModelStop);
  expect(error.reason).toBe("invalid");
});

test.each(["content_filter", "length"])(
  "a %s stop ends the call after one request",
  async (finish) => {
    const fake = server([{ content: "", finish }, { content: '{"title":"A","seats":2}' }]);
    const error = await callModel(fake.transport, request).catch((caught) => caught);
    expect(error).toBeInstanceOf(ModelStop);
    expect(error.reason).toBe(finish);
    expect(fake.bodies).toHaveLength(1);
    expect(fake.usages).toHaveLength(1);
  },
);

test("a strict call sends nullable scalars as plain types and reads empty values back as null", async () => {
  const Nullable = z.object({ holder: z.string().nullable(), size: z.number().nullable() });
  const fake = server([{ content: '{"holder":"","size":0}' }]);
  expect(await callModel(fake.transport, { ...request, schema: Nullable, strict: true })).toEqual({
    holder: null,
    size: null,
  });
  expect(fake.bodies[0].response_format.json_schema.schema.properties.holder.type).toBe("string");
});

// Lesson 23: a response_format sits in front of the cached block and breaks the cache.
test("a call with a shared prefix caches it and carries its schema in the prompt, never as a response_format", async () => {
  const fake = server([{ content: '{"title":"A","seats":3}' }]);
  await callModel(fake.transport, { ...request, prefix: "documents", strict: true });
  const [cached, tail] = fake.bodies[0].messages[1].content;
  expect(cached).toEqual({ type: "text", text: "documents", cache_control: { type: "ephemeral" } });
  expect(tail.text).toContain("JSON Schema");
  expect(fake.bodies[0].response_format).toBeUndefined();
  expect(fake.bodies[0].messages[0].content).toBe("system");
});
