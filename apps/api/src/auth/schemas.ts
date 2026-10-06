import { FORMAT_REGIONS, SUPPORTED_LOCALES } from '@eunomia/shared';
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

/**
 * Changing one's own password. The old one is required as proof, the new one
 * carries the same minimum as the admin API (auth/admin-routes.ts) — this is
 * not the place to invent a second password rule.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/**
 * One's own language and format. `null` follows the defaults again (browser,
 * then instance); a field left out is not touched.
 */
export const localePreferencesSchema = z
  .object({
    locale: z.enum(SUPPORTED_LOCALES).nullable().optional(),
    formatRegion: z.enum(FORMAT_REGIONS).nullable().optional(),
  })
  .strict();
export type LocalePreferencesInput = z.infer<typeof localePreferencesSchema>;
