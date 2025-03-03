import { z } from 'zod';

export const PointRuleInputSchema = z.object({
  type: z.enum(['Program', 'Project', 'Activity', 'Gala']),
  role: z.enum(['Director', 'CoDirector', 'Collaborator', 'Participant']),
  points: z.coerce.number().min(0, 'Points must be non-negative'),
  description: z.string().nonempty('Description is required'),
});

export const PointRuleSchema = PointRuleInputSchema.extend({
  id: z.string().nonempty('ID is required'),
});

export type PointRuleInput = z.infer<typeof PointRuleInputSchema>;

export type PointRule = z.infer<typeof PointRuleSchema>;
