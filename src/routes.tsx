/**
 * THE ROUTE TABLE (ARCHITECTURE.md section 3). Paths are relative to the Vite base; the
 * router gets the base as its `basename`, so nothing here knows about "/kishan-kahodariya".
 *
 *   /                    game page, default tab
 *   /<route>             that page, default tab          (<route> = "gamedev" | "softdev")
 *   /<route>/:tab        that page, that tab; an unknown tab shows the default tab and the
 *                        address is replaced with /<route> (no new history entry)
 *   /game, /game/*       redirect to /gamedev, /gamedev/*  (replace)
 *   /__kit               src/dev/Kit.tsx — dev builds only, absent from the production bundle
 *   *                    not-found page
 *
 * The page routes come from the content API (getTracks()), the same source getAllRoutes()
 * uses for the prerender list, so the two can never drift apart.
 *
 * One table, two readers: React Router renders it (`routes`, via useRoutes in App.tsx) and
 * resolveRoute() matches an address against the very same objects to tell the app shell and
 * the prerenderer which page it is (document head, scroll rules, address repair).
 */
import { lazy, Suspense, type ReactElement } from 'react';
import { matchRoutes, Navigate, useLocation, useParams, type RouteObject } from 'react-router-dom';
import { getTracks, type TrackId } from '@/content';
import { plainHead, trackHead, type DocumentHead } from '@/lib/head';
import NotFound from '@/lib/not-found/NotFound';
import {
  HOME_TRACK,
  LEGACY_GAME_SEGMENT,
  legacyGameTarget,
  resolveTrackView,
  type TrackView,
} from '@/lib/routing';
import TrackPage from '@/pages/TrackPage';

type RouteKind =
  | { kind: 'track'; trackId: TrackId; isHome: boolean }
  | { kind: 'legacy-game' }
  | { kind: 'kit' }
  | { kind: 'not-found' };

interface AppRoute {
  path: string;
  element: ReactElement;
  is: RouteKind;
}

/**
 * A public page. Keyed by page so that switching tabs keeps the mounted page (and its
 * state and scroll position) while moving to the other page starts from a fresh one.
 */
function TrackRoute({ trackId, isHome = false }: { trackId: TrackId; isHome?: boolean }) {
  const { tab: tabSegment } = useParams();
  const view = resolveTrackView(trackId, tabSegment, isHome);
  return <TrackPage key={view.track.id} track={view.track.id} tab={view.tab} />;
}

function LegacyGameRedirect() {
  const { '*': rest } = useParams();
  const { search, hash } = useLocation();
  return <Navigate replace to={{ pathname: legacyGameTarget(rest), search, hash }} />;
}

function pageRoutes(): AppRoute[] {
  const table: AppRoute[] = [
    {
      path: '/',
      element: <TrackRoute trackId={HOME_TRACK} isHome />,
      is: { kind: 'track', trackId: HOME_TRACK, isHome: true },
    },
  ];
  for (const track of getTracks()) {
    const is: RouteKind = { kind: 'track', trackId: track.id, isHome: false };
    table.push({ path: `/${track.route}`, element: <TrackRoute trackId={track.id} />, is });
    table.push({ path: `/${track.route}/:tab`, element: <TrackRoute trackId={track.id} />, is });
  }
  return table;
}

/** Dev-only routes. `import.meta.env.DEV` is a build-time constant: in a production build
 *  this returns [] and the Kit module is never part of the bundle. */
function devRoutes(): AppRoute[] {
  if (!import.meta.env.DEV) return [];
  const Kit = lazy(() => import('@/dev/Kit'));
  return [
    {
      path: '/__kit',
      element: (
        <Suspense fallback={null}>
          <Kit />
        </Suspense>
      ),
      is: { kind: 'kit' },
    },
  ];
}

const table: AppRoute[] = [
  ...pageRoutes(),
  { path: `/${LEGACY_GAME_SEGMENT}/*`, element: <LegacyGameRedirect />, is: { kind: 'legacy-game' } },
  ...devRoutes(),
  { path: '*', element: <NotFound />, is: { kind: 'not-found' } },
];

/** The table in React Router's shape. The `id` is the row index, which is how resolveRoute()
 *  gets from a match back to the row. */
export const routes: RouteObject[] = table.map(({ path, element }, index) => ({ id: String(index), path, element }));

export type ResolvedRoute =
  | {
      kind: 'track';
      view: TrackView;
      /** One key per public page: equal keys = "same page" for the scroll rules. */
      pageKey: string;
      head: DocumentHead;
    }
  | { kind: 'redirect'; to: string; pageKey: string; head: DocumentHead }
  | { kind: 'kit'; pageKey: string; head: DocumentHead }
  | { kind: 'not-found'; pageKey: string; head: DocumentHead };

function notFound(): ResolvedRoute {
  return { kind: 'not-found', pageKey: 'not-found', head: plainHead('Page Not Found') };
}

/**
 * What an address is. `pathname` is a router path — without the base, with or without a
 * trailing slash ("/", "/gamedev/unity", "/softdev/").
 */
export function resolveRoute(pathname: string): ResolvedRoute {
  const match = matchRoutes(routes, { pathname })?.at(-1);
  const row = match ? table[Number(match.route.id)] : undefined;
  if (!match || !row) return notFound();

  switch (row.is.kind) {
    case 'track': {
      const view = resolveTrackView(row.is.trackId, match.params.tab, row.is.isHome);
      return {
        kind: 'track',
        view,
        pageKey: `track:${view.track.id}`,
        head: trackHead(view.track, view.canonicalPath),
      };
    }
    case 'legacy-game':
      return {
        kind: 'redirect',
        to: legacyGameTarget(match.params['*']),
        pageKey: 'redirect',
        head: plainHead('Redirecting'),
      };
    case 'kit':
      return { kind: 'kit', pageKey: 'kit', head: plainHead('Component Kit') };
    case 'not-found':
      return notFound();
  }
}
