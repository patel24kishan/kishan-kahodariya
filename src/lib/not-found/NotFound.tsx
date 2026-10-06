import { Link } from 'react-router-dom';
import { getTracks } from '@/content';
import { trackPath } from '@/lib/paths';
import { HOME_TRACK } from '@/lib/routing';
import styles from './NotFound.module.css';

/**
 * The not-found page. Rendered by the router for an address that matches no route, and
 * prerendered by scripts/prerender.ts into dist/404.html (which GitHub Pages serves, with
 * status 404, for every path that has no file).
 *
 * `data-testid="not-found"` is the hook the infra tests look for.
 */
export default function NotFound() {
  const otherPages = getTracks().filter((track) => track.id !== HOME_TRACK);

  return (
    <main className={styles.page} data-testid="not-found">
      <p className={styles.code} aria-hidden="true">
        404
      </p>
      <h1 className={styles.title}>Page Not Found</h1>
      <p className={styles.text}>This address does not match any page on this site.</p>
      <nav className={styles.links} aria-label="Pages">
        <Link className={styles.primary} to="/">
          Back to Home
        </Link>
        {otherPages.map((track) => (
          <Link key={track.id} className={styles.secondary} to={trackPath(track)}>
            {track.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
