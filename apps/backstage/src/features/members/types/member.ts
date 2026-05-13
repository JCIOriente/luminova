import { z } from 'zod';

const memberBaseSchema = z.object({
  name: z.string().min(3, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  role: z.string().min(3, 'Role is required'),
});

const isFileInstance = (value: unknown): value is File =>
  typeof File !== 'undefined' && value instanceof File;

const fileUploadSchema = z.custom<File>(
  (value) => isFileInstance(value),
  'Invalid file upload',
);

const profilePictureInputSchema = z
  .union([fileUploadSchema, z.string().url(), z.literal(''), z.null()])
  .optional();

export const MemberInputSchema = memberBaseSchema.extend({
  profilePicture: profilePictureInputSchema,
});

export const MemberSchema = memberBaseSchema.extend({
  id: z.string().nonempty('ID is required'),
  profilePicture: z.union([z.string().url(), z.literal(''), z.null()]).optional(),
  totalPoints: z.number().default(0),
  active: z.boolean().default(true),
  deletedAt: z.date().nullable().optional(),
});

export type MemberInput = z.infer<typeof MemberInputSchema>;

export type Member = z.infer<typeof MemberSchema>;
