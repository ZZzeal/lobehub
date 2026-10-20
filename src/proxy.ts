import { defineConfig } from '@/libs/next/proxy/define-config';

const { middleware } = defineConfig();

// required to be literal
export const config = {
  matcher: [
    // NOTE: `/api`, `/trpc`, `/webapi` are intentionally NOT matched. The
    // middleware is a no-op for them — `defaultMiddleware` short-circuits the
    // rewrite half via `backendApiEndpoints`, and they're all public routes, so
    // the better-auth session lookup is skipped. Auth lives in the route
    // handlers (`checkAuth`, trpc `protectedProcedure`), which return JSON 401s
    // rather than the HTML redirect-to-signin. Skipping the matcher avoids a
    // needless middleware invocation on the hottest backend traffic. (/oidc and
    // /oauth stay matched below — their middleware pass is still load-bearing.)
    //
    // Workspace-scoped routes (`/:workspaceSlug/...`) cannot be enumerated —
    // the slug is user data — so they need a catch-all entry. Without it those
    // requests never reach this middleware, Next finds no page for `/acme`,
    // and it answers 307 back to `/`: a workspace URL then cannot be opened,
    // bookmarked or shared. Unknown slugs are not special-cased here; the SPA
    // rewrites as usual and its own slug boundary renders the 404.
    //
    // Backend and build-artifact prefixes stay excluded so they skip the
    // middleware exactly as before.
    '/((?!api|trpc|webapi|_next|assets|icons|images|locales|favicon|manifest|robots|sitemap).*)',
    // include the /
    '/',
    '/acceptance',
    '/acceptance(.*)',
    '/apps',
    '/apps(.*)',
    '/community',
    '/community(.*)',
    '/dashboard',
    '/dashboard(.*)',
    '/labs',
    '/eval',
    '/eval(.*)',
    /** Shared-agent pages need the same SPA rewrite as the other client routes. */
    '/a',
    '/a/(.*)',
    '/agent',
    '/agent(.*)',
    '/group',
    '/group(.*)',
    '/changelog(.*)',
    '/settings(.*)',
    '/image',
    '/video',
    '/resource',
    '/resource(.*)',
    '/profile(.*)',
    '/projects',
    '/project',
    '/project/(.*)',
    '/page',
    '/page(.*)',
    '/tasks',
    '/tasks(.*)',
    '/task',
    '/task(.*)',
    '/goals',
    '/goals(.*)',
    '/goal',
    '/goal(.*)',
    '/me',
    '/me(.*)',
    '/share(.*)',

    '/onboarding',
    '/onboarding(.*)',

    '/signup(.*)',
    '/signin(.*)',
    '/verify-email(.*)',
    '/verify-im(.*)',
    // Retired report links: the Workbench redirects them into Acceptance.
    '/verify',
    '/verify/(.*)',
    '/reset-password(.*)',
    '/auth-error(.*)',
    '/oauth(.*)',
    '/oidc(.*)',
    '/market-auth-callback(.*)',
  ],
};

export default middleware;
