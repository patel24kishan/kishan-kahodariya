import type { TrackId } from '@/content';

/**
 * CONTRACT (architect): the one public page component. Rendered for "/", "/gamedev",
 * "/gamedev/:tab", "/softdev" and "/softdev/:tab". The router resolves the tab with
 * resolveTab() before rendering, so `tab` is always a valid tab id.
 *
 * Placeholder body — the pages agent (phase 2) replaces it. Keep the props and the
 * default export unchanged.
 */
export interface TrackPageProps {
  track: TrackId;
  tab: string;
}

export default function TrackPage({ track, tab }: TrackPageProps) {
  return (
    <main data-testid="track-page" data-track={track} data-tab={tab}>
      <h1>Kishan Kahodariya</h1>
      <p>
        Placeholder page — track: {track}, tab: {tab}
      </p>
    </main>
  );
}
