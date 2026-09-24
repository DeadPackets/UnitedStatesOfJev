// The shape of a facts sheet: the real people and dated events a build checks invented names against.
import { z } from "zod";

const FactsSchema = z.object({
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string(),
      born: z.string().nullable(),
      died: z.string().nullable(),
      alive_on_start_date: z.boolean(),
    }),
  ),
  bodies: z.array(
    z.object({ name: z.string(), size: z.number().nullable(), how_chosen: z.string() }),
  ),
  groupings: z.array(
    z.object({
      name: z.string(),
      leader: z.string().nullable(),
      members_named: z.array(z.string()),
    }),
  ),
  dated_events: z.array(z.object({ date: z.string(), title: z.string() })),
  anchor: z.number().int(),
});
export type Facts = z.infer<typeof FactsSchema>;
