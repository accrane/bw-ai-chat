import { describe, expect, it } from 'vitest';
import { isOriginAllowed, normalizeDomain } from './domains.js';

describe('isOriginAllowed', () => {
  const allowed = ['whitewater.com', 'www.whitewater.com', 'localhost'];

  it('matches an exact hostname', () => {
    expect(isOriginAllowed('https://whitewater.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://www.whitewater.com', allowed)).toBe(true);
  });

  it('ignores ports (matching is hostname-only)', () => {
    expect(isOriginAllowed('http://localhost:5173', allowed)).toBe(true);
    expect(isOriginAllowed('http://localhost:3000', allowed)).toBe(true);
    expect(isOriginAllowed('https://whitewater.com:8443', allowed)).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isOriginAllowed('https://WhiteWater.COM', allowed)).toBe(true);
    expect(isOriginAllowed('https://whitewater.com', ['WHITEWATER.COM'])).toBe(true);
  });

  it('rejects subdomains not explicitly listed', () => {
    expect(isOriginAllowed('https://app.whitewater.com', allowed)).toBe(false);
    expect(isOriginAllowed('https://whitewater.com.evil.com', allowed)).toBe(false);
  });

  it('rejects lookalike suffixes', () => {
    expect(isOriginAllowed('https://evilwhitewater.com', allowed)).toBe(false);
  });

  it('rejects missing, null, or malformed origins', () => {
    expect(isOriginAllowed(undefined, allowed)).toBe(false);
    expect(isOriginAllowed('', allowed)).toBe(false);
    expect(isOriginAllowed('null', allowed)).toBe(false);
    expect(isOriginAllowed('not a url', allowed)).toBe(false);
  });

  it('rejects everything when the allow-list is empty', () => {
    expect(isOriginAllowed('https://whitewater.com', [])).toBe(false);
  });
});

describe('normalizeDomain', () => {
  it('trims, lowercases, and strips trailing dots', () => {
    expect(normalizeDomain('  Whitewater.COM. ')).toBe('whitewater.com');
  });
});
