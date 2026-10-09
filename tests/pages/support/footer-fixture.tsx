/**
 * Mounts the real SiteFooter with fixed links — see footer-fixture.html. Test-only: nothing in
 * src/ imports this file.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/styles/index.css';
import { SiteFooter } from '@/components/layout/SiteFooter';
import type { SocialLink } from '@/content/types';

const params = new URLSearchParams(window.location.search);
const label = params.has('label') ? (params.get('label') ?? '') : undefined;

function link(slug: string, label: string, url: string, icon: SocialLink['icon'] = 'link'): SocialLink {
  return { slug, label, url, icon, audience: 'both', order: 0, orderFooter: 0, showInHero: false, showInFooter: true, published: true };
}

const links: SocialLink[] = [link('email', 'Email', 'mailto:someone@example.com', 'email'), link('github', 'GitHub', 'https://github.com/example', 'github')];

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div data-testid="footer-fixture">
      <SiteFooter links={links} credit={['Fixture credit.']} contactLabel={label} />
    </div>
  </StrictMode>,
);
