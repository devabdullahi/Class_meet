/**
 * The MSAL browser instance.
 *
 * Microsoft's flow for a single-page app is the OAuth 2.0 **authorization code
 * flow with PKCE**, not the ID-token flow the Google version of this app used.
 * MSAL runs the whole exchange for us: it opens the popup, generates and
 * verifies the PKCE code challenge, redeems the code at the token endpoint
 * (cross-origin, which is why the redirect URI must be registered under the
 * "Single-page application" platform and not "Web" — only the SPA platform
 * type turns on CORS for token redemption), and caches the result.
 *
 * Two things older tutorials get wrong and that cost real time:
 *
 *  1. `initialize()` is mandatory. "The `initialize` function is asynchronous
 *     and must resolve before invoking other MSAL.js APIs." `MsalProvider`
 *     does not do it for you. `createStandardPublicClientApplication` is the
 *     current one-call form and returns an already-initialised instance.
 *  2. Since MSAL v5, "all authentication flows now require a dedicated
 *     redirect page that implements the MSAL redirect bridge" — a COOP-safe
 *     channel for the popup to hand its response back to this window. That is
 *     `client/redirect.html`; it must contain nothing but the bridge script,
 *     which is why it is a separate Vite entry rather than a route in the SPA.
 *
 * Sources:
 *   https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization
 *   https://learn.microsoft.com/en-us/entra/msal/javascript/browser/login-user
 *   https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-configuration
 */
import {
  createStandardPublicClientApplication,
  type IPublicClientApplication,
} from '@azure/msal-browser';

/** Same default, and the same reasoning, as UTA_TENANT_ID on the server. */
const UTA_TENANT_ID = '5cdc5b43-d7be-4caa-8173-729e3b0a62d9';

/**
 * Where the popup lands. It is `.html` and not `/redirect` because that one
 * path then works identically in `vite dev` and in a plain static host serving
 * `dist/` — no rewrite rule to remember, and one string to paste into the
 * portal. It must match the registered redirect URI exactly.
 */
export const REDIRECT_PATH = '/redirect.html';

/** Empty when client/.env is missing. `main.tsx` turns that into a real message. */
export const entraClientId: string = (import.meta.env.VITE_ENTRA_CLIENT_ID ?? '').trim();

const entraTenantId: string =
  (import.meta.env.VITE_ENTRA_TENANT_ID ?? '').trim() || UTA_TENANT_ID;

export function createMsalInstance(): Promise<IPublicClientApplication> {
  return createStandardPublicClientApplication({
    auth: {
      clientId: entraClientId,
      /**
       * A tenant-specific authority, even though the app registration is
       * multi-tenant. Microsoft's rule is that the effective audience is the
       * intersection of the two, so this narrows sign-in to UTA and sends
       * students straight to the sign-in page they already know instead of a
       * generic account picker.
       *
       * It is a convenience, not the security boundary: a guest account
       * invited into UTA's tenant would also authenticate here. The boundary
       * is the server's check of the `tid` claim.
       */
      authority: `https://login.microsoftonline.com/${entraTenantId}`,
      redirectUri: REDIRECT_PATH,
    },
    cache: {
      // sessionStorage, not localStorage: MSAL's cache holds live tokens, and
      // a tab-scoped cache means closing the tab ends the Microsoft half of
      // the session. The Class Meet half lives in an httpOnly cookie that this
      // code cannot read at all.
      cacheLocation: 'sessionStorage',
    },
  });
}
