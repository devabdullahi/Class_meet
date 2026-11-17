/**
 * Baseline security headers on every response, API and SPA alike.
 *
 * Written by hand rather than pulled in from `helmet`: it is a handful of
 * constant headers, and owning them keeps the one non-obvious part — what
 * Microsoft sign-in needs from the Content Security Policy — next to the
 * reasoning for it.
 *
 * Deliberately NOT set here:
 *  - Cross-Origin-Opener-Policy. The sign-in popup already loses
 *    `window.opener` to Microsoft's own COOP, and MSAL copes through the
 *    redirect bridge (`client/redirect.html`), but adding our own COOP is one
 *    more thing that could break sign-in for no gain on a site with no
 *    cross-origin secrets in its window.
 *  - Strict-Transport-Security. HTTPS is terminated by the hosting platform,
 *    which is the right place to decide HSTS (and its preload/max-age policy).
 */
import type { NextFunction, Request, Response } from 'express';

/** Microsoft Entra ID, which the SPA talks to through MSAL. */
const ENTRA_LOGIN_ORIGIN = 'https://login.microsoftonline.com';

/**
 * One policy for every response. On JSON it does nothing harmful; on the SPA's
 * HTML it is the policy that matters.
 *
 *  - `script-src 'self'` / `style-src 'self'`: the Vite build emits only
 *    external files under /assets, no inline script or style. React's `style`
 *    prop goes through the CSSOM, which CSP does not restrict.
 *  - `connect-src` includes Entra because MSAL redeems the authorization code
 *    and refreshes tokens with cross-origin fetches to it, and reads the
 *    authority's metadata from it.
 *  - `frame-src` includes Entra (and 'self') because MSAL renews tokens
 *    silently in a hidden iframe that starts at Entra and lands back on our
 *    own `/redirect.html`.
 *  - `frame-ancestors 'self'` rather than 'none' for that same reason: the
 *    hidden iframe puts our redirect page inside our own page. Other sites
 *    still cannot frame us, which is the clickjacking defence that matters.
 *  - The popup and full-page redirect to Entra are navigations, which CSP
 *    does not govern, so sign-in itself needs nothing else.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  `connect-src 'self' ${ENTRA_LOGIN_ORIGIN}`,
  `frame-src 'self' ${ENTRA_LOGIN_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

export function setSecurityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // Older browsers that ignore `frame-ancestors`; SAMEORIGIN matches it.
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Group and course ids appear in our URLs; nothing outside the site needs them.
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
}
