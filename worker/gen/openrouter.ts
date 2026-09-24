// Every generation call to OpenRouter. Small answers use a strict json_schema; any call that shares the cached block of
// documents carries its schema in the prompt instead, because a response_format sits in front of the cache and breaks
// it (lesson 23). A content_filter or length stop ends the call (lesson 4). Every answer's usage goes to the caller's
// ledger, including the ones that fail.
import { z } from "zod";

export const OPUS = "anthropic/claude-opus-5.5";
export const GROK = "x-ai/grok-4.7";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
// Opus world parts take 14 to 160 s; Grok's one-call world took 674 s, so its wait is at least 15 minutes (lesson 6).
const WAIT_SECONDS: Record<string, number> = { [OPUS]: 600, [GROK]: 1200 };

export type Usage = {
  name: string;
  model: string;
  seconds: number;
  cost: number;
  input: number;
  output: number;
  reasoning: number;
  cached: number;
  cacheWrite: number;
  finish: string;
};

export type StopReason = "content_filter" | "length" | "invalid" | "upstream";
export class ModelStop extends Error {
  constructor(
    public reason: StopReason,
    message: string,
  ) {
    super(message);
    this.name = "ModelStop";
  }
}

// For a step the build can do without (an emblem, a style rewrite, an optional part): a model stop leaves it out, and
// anything else, such as the build's budget or a lost ledger write, stops the build.
export function nullOnStop(error: unknown): null {
  if (error instanceof ModelStop) return null;
  throw error;
}

export type CallRequest<T> = {
  name: string;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  maxTokens: number;
  // The shared blocks (documents and roster, then the bible), sent first, each with a cache breakpoint.
  prefix?: string[];
  strict?: boolean; // a json_schema response format; ignored when prefix is set
  model?: string;
};
export type Caller = <T>(request: CallRequest<T>) => Promise<T>;
export type Transport = {
  key: string;
  onUsage: (usage: Usage) => Promise<void> | void;
  fetcher?: typeof fetch;
};

type JsonSchema = Record<string, any>;
// Anthropic's strict outputs refuse length and count limits, so the sent schema drops them; zod still checks them.
const DROPPED = new Set([
  "minLength",
  "maxLength",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "$schema",
  "pattern",
  "format",
]);
function strip(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strip);
  if (!schema || typeof schema !== "object") return schema;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (DROPPED.has(key)) continue;
    out[key] = key === "minItems" && typeof value === "number" && value > 1 ? 1 : strip(value);
  }
  if (out.type === "object" && out.properties && out.additionalProperties === undefined)
    out.additionalProperties = false;
  return out;
}

const SCALARS = new Set(["string", "number", "integer", "boolean"]);
// The scalar type of a nullable scalar, which zod writes as anyOf [x, null] or type [x, "null"]; else null.
function nullableScalar(schema: JsonSchema | undefined): string | null {
  if (Array.isArray(schema?.type) && schema.type.length === 2 && schema.type.includes("null")) {
    const type = schema.type.find((item: string) => item !== "null");
    return SCALARS.has(type) && !schema.enum ? type : null;
  }
  if (
    Array.isArray(schema?.anyOf) &&
    schema.anyOf.length === 2 &&
    schema.anyOf.some((item: JsonSchema) => item.type === "null")
  ) {
    const other = schema.anyOf.find((item: JsonSchema) => item.type !== "null");
    return SCALARS.has(other.type) && !other.enum ? other.type : null;
  }
  return null;
}
// Anthropic allows at most 16 union-typed parameters (lesson 1), so a nullable scalar travels as "" or 0.
function wire(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(wire);
  if (!schema || typeof schema !== "object") return schema;
  const type = nullableScalar(schema as JsonSchema);
  if (type) {
    const none = type === "string" ? "empty string when none" : "0 when none";
    const about = (schema as JsonSchema).description;
    return { type, description: about ? `${about} (${none})` : none };
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, wire(value)]));
}
function unwire(schema: JsonSchema | undefined, data: any): any {
  if (data === null || data === undefined) return data;
  if (nullableScalar(schema)) return data === "" || data === 0 ? null : data;
  if (Array.isArray(schema?.anyOf))
    return unwire(
      schema.anyOf.find((item: JsonSchema) => item.type !== "null"),
      data,
    );
  if (schema?.type === "array" && Array.isArray(data))
    return data.map((item) => unwire(schema.items, item));
  if (schema?.type === "object" && typeof data === "object")
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, unwire(schema.properties?.[key], value)]),
    );
  return data;
}

export const promptSchema = (schema: z.ZodType): JsonSchema =>
  strip(z.toJSONSchema(schema, { io: "input" })) as JsonSchema;

// Anthropic ignores json_object and wraps answers in code fences (lesson 3): the object is between the first { and last }.
export function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no JSON object in the answer");
    return JSON.parse(raw.slice(start, end + 1));
  }
}

type Reply = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  usage?: {
    cost?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message?: string };
};

// One request. A 429, a 5xx or a dropped connection is sent once more; a timeout is not, since the model already ran
// for the whole wait and a second one doubles the build.
async function send(
  transport: Transport,
  body: unknown,
  waitSeconds: number,
): Promise<{ reply: Reply; seconds: number }> {
  const fetcher = transport.fetcher ?? fetch;
  let problem = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = Date.now();
    try {
      const response = await fetcher(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${transport.key}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://unitedstatesofjev.deadpackets.pw",
          "X-Title": "United States of Jev",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(waitSeconds * 1000),
      });
      if (response.ok)
        return { reply: (await response.json()) as Reply, seconds: (Date.now() - started) / 1000 };
      problem = `${response.status} ${(await response.text()).slice(0, 300)}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      problem = String(error);
      if ((error as Error)?.name === "TimeoutError") break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new ModelStop("upstream", problem);
}

export async function callModel<T>(transport: Transport, request: CallRequest<T>): Promise<T> {
  const model = request.model ?? OPUS;
  const prefix = request.prefix ?? [];
  const strict = !!request.strict && !prefix.length;
  const ask = `Return only one JSON object, with no code fences and no text before or after it. It must match this JSON Schema, with the properties in the order listed:\n${JSON.stringify(promptSchema(request.schema))}`;
  const tail = prefix.length ? `${request.user}\n\n${ask}` : request.user;
  const messages: unknown[] = [
    // The system prompt stays the same across every part call, so the cache sees one prefix.
    {
      role: "system",
      content: strict || prefix.length ? request.system : `${request.system}\n\n${ask}`,
    },
    {
      role: "user",
      content: prefix.length
        ? [
            ...prefix.map((text) => ({ type: "text", text, cache_control: { type: "ephemeral" } })),
            { type: "text", text: tail },
          ]
        : tail,
    },
  ];
  const body = {
    model,
    max_tokens: request.maxTokens,
    reasoning: { effort: "medium" },
    usage: { include: true },
    ...(model === OPUS ? { provider: { order: ["anthropic"], allow_fallbacks: true } } : {}),
    ...(strict
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: request.name,
              strict: true,
              schema: wire(promptSchema(request.schema)),
            },
          },
        }
      : {}),
    messages,
  };
  let problem = "";
  for (let answer = 0; answer < 2; answer++) {
    const { reply, seconds } = await send(transport, body, WAIT_SECONDS[model] ?? 600);
    const choice = reply.choices?.[0];
    const usage = reply.usage ?? {};
    const finish = String(choice?.finish_reason ?? (reply.error ? "error" : ""));
    await transport.onUsage({
      name: request.name,
      model,
      seconds,
      cost: Number(usage.cost ?? 0),
      input: Number(usage.prompt_tokens ?? 0),
      output: Number(usage.completion_tokens ?? 0),
      reasoning: Number(usage.completion_tokens_details?.reasoning_tokens ?? 0),
      cached: Number(usage.prompt_tokens_details?.cached_tokens ?? 0),
      cacheWrite: Number(usage.prompt_tokens_details?.cache_write_tokens ?? 0),
      finish,
    });
    if (reply.error)
      throw new ModelStop("upstream", `${request.name}: ${reply.error.message ?? "error"}`);
    // The same request would cost the same and stop the same way, so a stop is never sent again.
    if (finish === "content_filter")
      throw new ModelStop("content_filter", `${request.name}: blocked by the content filter`);
    if (finish === "length")
      throw new ModelStop("length", `${request.name}: hit max_tokens ${request.maxTokens}`);
    const raw = typeof choice?.message?.content === "string" ? choice.message.content : "";
    let json: unknown;
    try {
      json = extractJson(raw);
    } catch {
      problem = `unparseable answer of ${raw.length} characters`;
    }
    if (json !== undefined) {
      // unwire walks the unwired schema: only there is a nullable scalar still an anyOf with null.
      const parsed = request.schema.safeParse(
        strict ? unwire(promptSchema(request.schema), json) : json,
      );
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues
        .slice(0, 12)
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ");
    }
    messages.push(
      { role: "assistant", content: raw },
      {
        role: "user",
        content: `That object failed validation: ${problem}. Return the corrected full object.`,
      },
    );
  }
  throw new ModelStop("invalid", `${request.name}: ${problem}`);
}
