/**
 * CLIENT ENTRY. Loaded by index.html.
 *
 * In a production build every route's HTML already contains the page markup (written by
 * scripts/prerender.ts), so the app hydrates it. Where the root is empty — the dev server —
 * it renders from scratch instead.
 *
 * The component tree here must stay identical to the one in src/entry-server.tsx
 * (StrictMode > ThemeProvider > router > App), otherwise hydration will not match.
 */
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@/styles/index.css';
import { routerBasename } from '@/lib/paths';
import { ThemeProvider } from '@/theme';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('index.html has no #root element');

const app = (
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={routerBasename()}>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);

// Prerendered markup is an element; the dev template only holds a comment placeholder.
if (container.firstElementChild) {
  hydrateRoot(container, app);
} else {
  createRoot(container).render(app);
}
