import { z } from 'zod';

const isoDateSchema = z
  .string()
  .min(1, 'Date is required')
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Invalid date format',
  });

export const EventBaseSchema = z
  .object({
    type: z.enum(['Program', 'Project', 'Activity', 'Gala']),
    name: z.string().nonempty('Name is required'),
    description: z.string().optional(),
    scope: z.enum(['National', 'Local']).optional(),
    directorId: z.string(),
    coDirectorIds: z.array(z.string()).default([]),
    collaboratorIds: z.array(z.string()).default([]),
    participantIds: z.array(z.string()).default([]),
    parentId: z.string().optional(), // ID of the parent program/project (if applicable)
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .superRefine((event, ctx) => {
    const start = Date.parse(event.startDate);
    const end = Date.parse(event.endDate);

    if (!Number.isNaN(start) && !Number.isNaN(end) && end < start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after start date',
      });
    }
  });

export const EventSchema = EventBaseSchema.extend({
  id: z.string().nonempty('ID is required'),
});

export const EventInputSchema = EventBaseSchema;

export type EventInput = z.infer<typeof EventInputSchema>;

export type Event = z.infer<typeof EventSchema>;
