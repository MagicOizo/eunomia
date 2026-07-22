import { z } from 'zod';

/** Credentials for login — email plus a non-empty password. */
export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Payload for creating the first admin via the setup endpoint. */
export const setupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstname: z.string().trim().min(1),
  surname: z.string().trim().min(1).optional(),
});
export type SetupInput = z.infer<typeof setupSchema>;
