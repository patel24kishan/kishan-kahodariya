/**
 * Dev-only bootstrap for src/dev/kit.html (the design kit outside the app router).
 * Mirrors src/main.tsx: global styles, ThemeProvider, then the kit.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { ThemeProvider } from '@/theme';
import Kit from './Kit';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <Kit />
    </ThemeProvider>
  </StrictMode>,
);
