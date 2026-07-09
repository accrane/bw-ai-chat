import { describe, expect, it } from 'vitest';
import { AiSettingsSchema } from './ai-settings.js';
import { BrandingSchema } from './branding.js';

describe('BrandingSchema', () => {
  it('produces a complete theme from an empty object', () => {
    const branding = BrandingSchema.parse({});
    expect(branding.primaryColor).toBe('#2563eb');
    expect(branding.position).toBe('bottom-right');
    expect(branding.welcomeMessage.length).toBeGreaterThan(0);
  });

  it('rejects non-hex colors', () => {
    expect(() => BrandingSchema.parse({ primaryColor: 'blue' })).toThrow();
    expect(() => BrandingSchema.parse({ primaryColor: '#fff' })).toThrow();
  });

  it('keeps provided values', () => {
    const branding = BrandingSchema.parse({ primaryColor: '#0e7490', position: 'bottom-left' });
    expect(branding.primaryColor).toBe('#0e7490');
    expect(branding.position).toBe('bottom-left');
  });
});

describe('AiSettingsSchema', () => {
  it('defaults to the platform key and a mini-tier model', () => {
    const settings = AiSettingsSchema.parse({});
    expect(settings.apiKeyOverride).toBeNull();
    expect(settings.model).toBe('gpt-4o-mini');
    expect(settings.monthlyTokenBudget).toBeGreaterThan(0);
  });

  it('rejects out-of-range temperature', () => {
    expect(() => AiSettingsSchema.parse({ temperature: 3 })).toThrow();
  });
});
