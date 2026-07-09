import { z } from 'zod';

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb hex color');

/**
 * Per-client widget branding, stored in clients.branding (jsonb).
 * Every field has a default so `BrandingSchema.parse({})` yields a complete,
 * usable theme — new fields added here need no data migration.
 */
export const BrandingSchema = z.object({
  companyName: z.string().min(1).max(120).optional(),
  logoUrl: z.string().url().optional(),
  avatarUrl: z.string().url().optional(),
  welcomeMessage: z.string().max(500).default('Hi! How can we help you today?'),
  primaryColor: hexColor.default('#2563eb'),
  secondaryColor: hexColor.default('#1e40af'),
  textColor: hexColor.default('#111827'),
  backgroundColor: hexColor.default('#ffffff'),
  borderRadius: z.number().int().min(0).max(32).default(12),
  fontFamily: z.string().max(200).default('system-ui, sans-serif'),
  position: z.enum(['bottom-right', 'bottom-left']).default('bottom-right'),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
});

export type Branding = z.infer<typeof BrandingSchema>;
