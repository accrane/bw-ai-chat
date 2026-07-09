/**
 * Origin validation for widget endpoints. Allowed entries are bare hostnames
 * ("example.com", "localhost"); matching is exact on the origin's hostname,
 * so ports never matter and "www.example.com" must be listed separately.
 */

export function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, '');
}

export function isOriginAllowed(origin: string | undefined, allowedDomains: string[]): boolean {
  if (!origin) return false;
  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (hostname.length === 0) return false;
  return allowedDomains.some((domain) => normalizeDomain(domain) === hostname);
}
