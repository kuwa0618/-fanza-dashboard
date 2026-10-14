// Shared by routing middleware and the analysis API; no credentials in client code.
export function isAdminAuthorized(authorization, env = process.env) {
  if (!env.ADMIN_USER || !env.ADMIN_PASSWORD || typeof authorization !== 'string') return false;
  if (authorization.length > 8192) return false;
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  if (!match) return false;
  try {
    const bytes = Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const separator = decoded.indexOf(':');
    if (separator < 1) return false;
    const equal = (left, right) => {
      const a = new TextEncoder().encode(left);
      const b = new TextEncoder().encode(right);
      let difference = a.length ^ b.length;
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        difference |= (a[i] || 0) ^ (b[i] || 0);
      }
      return difference === 0;
    };
    // Evaluate both comparisons even when the username is wrong.
    const userMatches = equal(decoded.slice(0, separator), env.ADMIN_USER);
    const passwordMatches = equal(decoded.slice(separator + 1), env.ADMIN_PASSWORD);
    return userMatches && passwordMatches;
  } catch {
    return false;
  }
}

export const adminHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Vary': 'Authorization',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
