import { z } from 'zod';

// Schema for validating ally input
export const AllyInputSchema = z.object({
  companyName: z.string().min(1, { message: 'Company name is required' }),
  personInCharge: z.string().min(1, { message: 'Person in charge is required' }),
  phone: z.string().min(1, { message: 'Phone number is required' }), // Add more specific phone validation if needed
  email: z.string().email({ message: 'Invalid email address' }),
});

// Type for ally input data (used in forms)
export type AllyInput = z.infer<typeof AllyInputSchema>;

// Type for an ally document stored in the database
export type Ally = AllyInput & {
  id: string; // Unique identifier for the ally
};