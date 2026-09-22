/// <reference types="vite/client" />

/**
 * Vite's own `ImportMetaEnv` is an open index signature typed `any`, which
 * would quietly make every `import.meta.env.X` untyped. Declaring the
 * variables we actually use means a typo is a compile error and the value is
 * a `string`, not an `any`.
 *
 * Everything here is public: Vite inlines it into the bundle. Nothing secret
 * may be added.
 *
 * Both are typed as possibly undefined because Vite inlines `undefined` when
 * client/.env is missing the variable, and pretending otherwise would hide the
 * most likely setup mistake behind a dead button.
 */
interface ImportMetaEnv {
  /**
   * Application (client) ID of the Entra app registration — the same value as
   * the server's ENTRA_CLIENT_ID.
   */
  readonly VITE_ENTRA_CLIENT_ID: string | undefined;
  /**
   * Tenant whose sign-in page students are sent to. Optional; defaults to UT
   * Arlington's in `src/auth/msal.ts`.
   */
  readonly VITE_ENTRA_TENANT_ID: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
