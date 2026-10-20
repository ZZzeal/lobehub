import { WORKSPACE_SLUG_MAX, WORKSPACE_SLUG_MIN, WORKSPACE_SLUG_PATTERN } from '@lobechat/const';

/**
 * First path segments a workspace slug may never take.
 *
 * A workspace owns the `/:workspaceSlug` namespace, so its slug competes with
 * every top-level route, auth surface and middleware-excluded prefix. If a
 * workspace took `settings`, `/settings` would render the workspace scope
 * instead of personal settings; `api` would never reach the backend at all
 * (`src/proxy.ts` skips those prefixes before the SPA rewrite).
 *
 * Kept as an explicit list on purpose: it is the union of the root segments in
 * `desktopRouter.shared.tsx` / `mobileRouter.config.tsx`, the auth router, and
 * the proxy exclusions. Add a root segment there → add it here too.
 */
export const RESERVED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set([
  // Shared main-area routes (mirrored under `/:workspaceSlug` as well)
  'acceptance',
  'activities',
  'agent',
  'agents',
  'apps',
  'community',
  'dashboard',
  'eval',
  'goal',
  'goals',
  'group',
  'image',
  'memory',
  'page',
  'project',
  'projects',
  'resource',
  'task',
  'tasks',
  'video',
  // Personal-only surfaces
  'a',
  'billing',
  'changelog',
  'creds',
  'devices',
  'devtools',
  'discover',
  'labs',
  'me',
  'onboarding',
  'profile',
  'settings',
  'share',
  'subscription',
  'workspace',
  // Auth surfaces
  'auth-error',
  'market-auth-callback',
  'next-auth',
  'oauth',
  'reset-password',
  'signin',
  'signup',
  'verify-email',
  'verify-im',
  // Invitation landing: the token decides the workspace, the segment is never a slug
  'invite',
  // Prefixes excluded from the SPA middleware — a slug here would never resolve
  '_next',
  'api',
  'assets',
  'favicon',
  'icons',
  'images',
  'locales',
  'manifest',
  'robots',
  'sitemap',
  'trpc',
  'webapi',
  // Desktop shell entry
  'desktop-onboarding',
]);

export type WorkspaceSlugIssue = 'consecutive' | 'length' | 'pattern' | 'reserved';

export const isReservedWorkspaceSlug = (slug: string): boolean =>
  RESERVED_WORKSPACE_SLUGS.has(slug);

/**
 * Client-side slug validation, ordered so the first failure is the one the
 * user can actually act on (length before charset, charset before the
 * hyphen-run style rule).
 *
 * `WORKSPACE_SLUG_PATTERN` intentionally allows consecutive hyphens, so that
 * rule is enforced separately. The server enforces length + pattern too; the
 * reserved list is a frontend concern (the backend has no route table).
 */
export const getWorkspaceSlugIssue = (slug: string): WorkspaceSlugIssue | null => {
  if (slug.length < WORKSPACE_SLUG_MIN || slug.length > WORKSPACE_SLUG_MAX) return 'length';
  if (!WORKSPACE_SLUG_PATTERN.test(slug)) return 'pattern';
  if (slug.includes('--')) return 'consecutive';
  if (isReservedWorkspaceSlug(slug)) return 'reserved';
  return null;
};
