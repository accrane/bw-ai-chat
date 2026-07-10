import {
  AiSettingsSchema,
  BrandingSchema,
  type AiSettings,
  type Branding,
} from '@bw-ai-chat/shared';
import { withDbContext } from '../../db/context.js';
import { logger } from '../../lib/logger.js';

export interface ClientRecord {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'paused';
  allowedDomains: string[];
  branding: Branding;
  aiSettings: AiSettings;
}

interface ClientRow {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'paused';
  allowed_domains: string[];
  branding: unknown;
  ai_settings: unknown;
}

function toRecord(row: ClientRow): ClientRecord {
  // JSONB is validated on the way out; unknown/invalid data degrades to
  // schema defaults rather than breaking the widget.
  const branding = BrandingSchema.safeParse(row.branding);
  const aiSettings = AiSettingsSchema.safeParse(row.ai_settings);
  if (!branding.success) {
    logger.warn({ slug: row.slug }, 'invalid branding jsonb, serving defaults');
  }
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    allowedDomains: row.allowed_domains,
    branding: branding.success ? branding.data : BrandingSchema.parse({}),
    aiSettings: aiSettings.success ? aiSettings.data : AiSettingsSchema.parse({}),
  };
}

export async function findClientBySlug(slug: string): Promise<ClientRecord | null> {
  return withDbContext({ lookupSlug: slug }, async (db) => {
    const { rows } = await db.query<ClientRow>(
      `select id, slug, name, status, allowed_domains, branding, ai_settings
         from clients
        where slug = $1`,
      [slug],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  });
}
