/**
 * `src/api.ts` type-imports the engine, which value-imports `worker/gen/validate`, which pulls
 * `worker/db.ts` and `worker/jev.ts` into the app program. Their Worker runtime types cannot be
 * loaded beside the DOM ones (they redeclare Request, Response and document), so the app program
 * gets opaque stand-ins. No client code runs those files, and the Worker program checks them for real.
 */
declare module "cloudflare:workers" {
  type Storage = { get<T>(k: string): Promise<T | undefined>; put(k: string, v: unknown): Promise<void>; sql: any };
  export class DurableObject<E = unknown> {
    constructor(ctx: { storage: Storage }, env: E);
    protected ctx: { storage: Storage };
    protected env: E;
  }
}
declare type Ai = any;
declare type D1Database = any;
declare type DurableObjectNamespace<T = unknown> = any;
declare type R2Bucket = any;
declare type RateLimit = any;
declare type VectorizeIndex = any;
declare type Workflow<T = unknown> = any;
