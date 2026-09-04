import { z } from "zod";

export const loginSchema = z
  .object({
    password: z.string().min(1).max(200),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
