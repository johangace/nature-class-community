import { z } from "zod";
/** Trusted creation metadata. Never accepted from a teacher decision payload. */
export const preparationUsageSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("production")}).strict(),
  z.object({kind: z.literal("test")}).strict(),
  z.object({kind: z.literal("evaluation"), datasetId: z.string().min(1), split: z.enum(["training", "held-out"])}).strict(),
]);
export type PreparationUsage = z.infer<typeof preparationUsageSchema>;
