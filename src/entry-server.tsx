/**
 * SERVER ENTRY. Built by scripts/prerender.ts (Vite SSR build) and run once per route at
 * build time; it is never shipped to the browser.
 *
 * The component tree must stay identical to the one in src/main.tsx
 * (StrictMode > ThemeProvider > router > App), otherwise hydration will not match.
 */
import { StrictMode, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import '@/styles/index.css';
import { getAllRoutes, getSite, getTracks } from '@/content';
import { renderHead } from '@/lib/head';
import NotFound from '@/lib/not-found/NotFound';
import { absoluteUrl, routeHref, routerBasename, trackPath } from '@/lib/paths';
import { canonicalPath, HOME_TRACK, LEGACY_GAME_SEGMENT, legacyGameTarget } from '@/lib/routing';
import { ThemeProvider } from '@/theme';
import App from './App';
import { resolveRoute } from './routes';

function shell(routePath: string, children: ReactElement): ReactElement {
  return (
    <StrictMode>
      <ThemeProvider>
        <StaticRouter basename={routerBasename()} location={routeHref(routePath)}>
          {children}
        </StaticRouter>
      </ThemeProvider>
    </StrictMode>
  );
}

export interface RenderedPage {
  /** Markup that goes inside #root. */
  html: string;
  /** The managed part of <head> (title, description, canonical, Open Graph). */
  head: string;
}

/**
 * Render one public page. `routePath` is a router path from getAllRoutes(): no base, no
 * trailing slash. Throws when the path is not a public page or is not written in its proper
 * form — the prerenderer must never write a file for anything else.
 */
export function render(routePath: string): RenderedPage {
  const route = resolveRoute(routePath);
  if (route.kind !== 'track') {
    throw new Error(`"${routePath}" is not a public page (it resolves to: ${route.kind}).`);
  }
  if (route.view.path !== routePath) {
    throw new Error(`"${routePath}" is not a proper address: the app would rewrite it to "${route.view.path}".`);
  }
  return {
    html: renderToString(shell(routePath, <App />)),
    head: renderHead(route.head),
  };
}

/** Render the not-found page (dist/404.html). It is static: the app does not boot on it. */
export function renderNotFound(): RenderedPage {
  const route = resolveRoute('/404');
  return {
    html: renderToString(shell('/404', <NotFound />)),
    head: renderHead(route.head),
  };
}

export interface LegacyRedirect {
  /** Router path that redirects, for example "/game". */
  from: string;
  /** Href (with the base) it goes to. */
  toHref: string;
  /** Absolute canonical URL of the destination's content. */
  canonicalUrl: string;
  title: string;
}

export interface SiteManifest {
  /** Base path with a trailing slash, as the build was configured. */
  base: string;
  siteName: string;
  /** Every public route, exactly as getAllRoutes() returns it. */
  routes: string[];
  /** URL segment of each public page ("gamedev", "softdev"). */
  pageSegments: string[];
  /** Old first segment → the page segment it now lives under ("game" → "gamedev"). */
  legacySegments: Record<string, string>;
  redirects: LegacyRedirect[];
}

/** Everything the prerenderer needs to know about the site besides the page markup. */
export function getManifest(): SiteManifest {
  const tracks = getTracks();
  const home = tracks.find((track) => track.id === HOME_TRACK);
  if (!home) throw new Error(`Content has no "${HOME_TRACK}" track.`);

  const gameTarget = legacyGameTarget(undefined);
  return {
    base: routeHref('/'),
    siteName: getSite().name,
    routes: getAllRoutes(),
    pageSegments: tracks.map((track) => trackPath(track).slice(1)),
    legacySegments: { [LEGACY_GAME_SEGMENT]: trackPath(home).slice(1) },
    redirects: [
      {
        from: `/${LEGACY_GAME_SEGMENT}`,
        toHref: routeHref(gameTarget),
        canonicalUrl: absoluteUrl(canonicalPath(home, home.defaultTab)),
        title: resolveRoute(gameTarget).head.title,
      },
    ],
  };
}
