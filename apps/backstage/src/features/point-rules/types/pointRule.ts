import { z } from 'zod';

export const PointRuleInputSchema = z.object({
  description: z.string().nonempty('Description is required'),
  // points: z.number().min(0, 'Points must be non-negative'),
  points: z.string().nonempty('Points is required'),
});

export const PointRuleSchema = PointRuleInputSchema.extend({
  id: z.string().nonempty('ID is required'),
});

export type PointRuleInput = z.infer<typeof PointRuleInputSchema>;

export type PointRule = z.infer<typeof PointRuleSchema>;
