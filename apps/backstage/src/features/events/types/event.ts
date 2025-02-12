import { z } from 'zod';

export const EventBaseSchema = z.object({
  type: z.enum(['Program', 'Project', 'Activity', 'Gala']),
  name: z.string().nonempty('Name is required'),
  description: z.string().optional(),
  scope: z.enum(['National', 'Local']).optional(),
  directorId: z.string().optional(),
  coDirectorIds: z.array(z.string()).default([]),
  assistantIds: z.array(z.string()).default([]),
  parentId: z.string().optional(), // ID of the parent program/project (if applicable)
  startDate: z.number().optional(),
  endDate: z.number().optional(),
});

export const EventSchema = EventBaseSchema.extend({
  id: z.string().nonempty('ID is required'),
});

export const EventInputSchema = EventBaseSchema;

export type EventInput = z.infer<typeof EventBaseSchema>;

export type Event = z.infer<typeof EventSchema>;
