/**
 * The app shell: everything that sits between the router and a page.
 *
 * It renders the route table and, from the address alone, keeps three things right:
 *   1. the document head (title, description, canonical, Open Graph) after a navigation;
 *   2. the scroll position (see src/lib/scroll.ts for the rules);
 *   3. the address itself — a trailing slash, different letter case or an unknown tab is
 *      replaced by the proper address without adding a history entry.
 *
 * The same component tree is rendered to a string at build time (src/entry-server.tsx), so
 * nothing here touches `window` or `document` outside an effect.
 */
import { useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useRoutes } from 'react-router-dom';
import { applyHead } from '@/lib/head';
import { useScrollManager } from '@/lib/scroll';
import { resolveRoute, routes } from './routes';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const route = useMemo(() => resolveRoute(location.pathname), [location.pathname]);

  useScrollManager(route.pageKey);

  const { head } = route;
  useEffect(() => {
    applyHead(head);
  }, [head]);

  // Address repair. Only public pages have a "proper" address; search and hash are kept.
  const properPath = route.kind === 'track' ? route.view.path : null;
  useEffect(() => {
    if (properPath !== null && properPath !== location.pathname) {
      navigate({ pathname: properPath, search: location.search, hash: location.hash }, { replace: true });
    }
  }, [properPath, location.pathname, location.search, location.hash, navigate]);

  // Test hook, dev builds only (see src/lib/globals.d.ts). Removed from the production bundle.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    window.__kkNavigate = (to, options) => {
      void navigate(to, options);
    };
    return () => {
      delete window.__kkNavigate;
    };
  }, [navigate]);

  return useRoutes(routes);
}
