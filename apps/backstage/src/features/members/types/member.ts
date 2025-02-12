import { z } from 'zod';

const MemberBaseSchema = z.object({
  name: z.string().min(3, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  role: z.string().min(3, 'Role is required'),
  profilePicture: z.instanceof(File).optional(),
  totalPoints: z.number().default(0),
  active: z.boolean().default(true),
});

export const MemberSchema = MemberBaseSchema.extend({
  id: z.string().nonempty('ID is required'),
});

export const MemberInputSchema = MemberBaseSchema;

export type MemberInput = z.infer<typeof MemberBaseSchema>;

export type Member = z.infer<typeof MemberSchema>;
