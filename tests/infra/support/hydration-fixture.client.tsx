/**
 * Browser entry for the hydration fixture. The test swaps it in for src/main.tsx on a page
 * whose #root already holds the server-rendered fixture, so this must hydrate, not render.
 */
import { hydrateRoot } from 'react-dom/client';
import '@/styles/index.css';
import { Fixture } from './hydration-fixture';

const container = document.getElementById('root');
if (!container) throw new Error('no #root');
hydrateRoot(container, <Fixture />);
