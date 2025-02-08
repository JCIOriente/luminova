import { z } from 'zod';

export type Member = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profilePicture?: File;
  totalPoints: number;
  active: boolean;
};

export const memberSchema = z.object({
  name: z.string().min(3, 'Name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional(),
  role: z.string().min(3, 'Role is required'),
  profilePicture: z.instanceof(File).optional(),
  totalPoints: z.number().default(0),
  active: z.boolean().default(true),
});

export type MemberFormValues = z.infer<typeof memberSchema>;
