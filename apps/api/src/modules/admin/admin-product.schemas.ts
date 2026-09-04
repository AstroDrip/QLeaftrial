import { z } from "zod";

export const updateAdminProductSchema = z
  .object({
    priceQar: z.number().int().nonnegative().optional(),
    stock: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (value) => value.priceQar !== undefined || value.stock !== undefined,
    "At least one product field is required",
  );

export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>;
