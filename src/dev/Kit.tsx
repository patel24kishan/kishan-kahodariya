/**
 * CONTRACT (architect): dev-only component showcase, mounted at /__kit in dev builds only.
 * Implemented by the design agent. Keep the default export.
 *
 * Shows every token group and every primitive in every state, with controls for the theme
 * (the real ThemeToggle) and the accent track (?track=game|softdev is kept in the URL).
 * Also reachable without the router at /My-Portfolio/src/dev/kit.html (see kit.html).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TrackId } from '@/content/types';
import {
  Button,
  Chip,
  Container,
  ICON_NAMES,
  Icon,
  IconButton,
  LinkButton,
  MediaOverlayButton,
  Section,
  SegmentedTabs,
  SkipLink,
  VisuallyHidden,
  cx,
  type SegmentedTabItem,
} from '@/components/ui';
import { ThemeToggle, useTheme } from '@/theme';
import { contrastRatio, parseColor, readToken, toHex } from './contrast';
import styles from './Kit.module.css';

const COLOR_TOKENS = [
  '--color-canvas',
  '--color-surface',
  '--color-surface-raised',
  '--color-hairline',
  '--color-hairline-strong',
  '--color-ink',
  '--color-body',
  '--color-muted',
  '--color-accent',
  '--color-on-accent',
  '--color-accent-ink',
  '--color-accent-border',
  '--color-focus',
  '--color-backdrop',
  '--color-scrim',
] as const;

/** [foreground token, background token, required ratio] */
const CONTRAST_PAIRS: Array<[string, string, number]> = [
  ['--color-ink', '--color-canvas', 4.5],
  ['--color-body', '--color-canvas', 4.5],
  ['--color-muted', '--color-canvas', 4.5],
  ['--color-ink', '--color-surface', 4.5],
  ['--color-body', '--color-surface', 4.5],
  ['--color-muted', '--color-surface', 4.5],
  ['--color-body', '--color-surface-raised', 4.5],
  ['--color-accent-ink', '--color-canvas', 4.5],
  ['--color-accent-ink', '--color-surface', 4.5],
  ['--color-accent-ink', '--color-surface-raised', 4.5],
  ['--color-on-accent', '--color-accent', 4.5],
  ['--color-accent', '--color-on-accent', 4.5],
  ['--color-accent-border', '--color-canvas', 3],
  ['--color-accent-border', '--color-surface', 3],
  ['--color-accent-border', '--color-surface-raised', 3],
  ['--color-focus', '--color-canvas', 3],
];

const TYPE_SAMPLES: Array<{ token: string; label: string; className: string }> = [
  { token: '--text-display', label: 'Display · h1 · 700 · −0.03em', className: styles.sampleDisplay },
  { token: '--text-heading', label: 'Heading · h2 · 700 · −0.025em', className: styles.sampleHeading },
  { token: '--text-title-lg', label: 'Title lg · 700', className: styles.sampleTitleLg },
  { token: '--text-title-md', label: 'Title md · h3 · 600', className: styles.sampleTitleMd },
  { token: '--text-body-lg', label: 'Body lg · 400', className: styles.sampleBodyLg },
  { token: '--text-body', label: 'Body · 400', className: styles.sampleBody },
  { token: '--text-body-sm', label: 'Body sm · 400', className: styles.sampleBodySm },
  { token: '--text-caption', label: 'Caption · 500', className: styles.sampleCaption },
  { token: '--text-caption-upper', label: 'Caption upper · 600 · +0.1em', className: styles.sampleCaptionUpper },
];

const SPACE_TOKENS = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12', '--space-16', '--space-24'];

const TAB_ITEMS: Omit<SegmentedTabItem, 'current'>[] = [
  { id: 'unreal', label: 'Unreal', href: '#tabs' },
  { id: 'unity', label: 'Unity3D', href: '#tabs' },
  { id: 'webapps', label: 'Web Apps', href: '#tabs' },
  { id: 'all', label: 'All', href: '#tabs' },
];

/** A placeholder screenshot (SVG data URI) so the kit depends on no asset owned by another agent. */
const PLACEHOLDER_SHOT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4a6a"/><stop offset="1" stop-color="#1a2238"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/><circle cx="1180" cy="300" r="180" fill="#ffffff" fill-opacity="0.08"/><rect x="160" y="560" width="640" height="40" rx="20" fill="#ffffff" fill-opacity="0.25"/><rect x="160" y="630" width="420" height="40" rx="20" fill="#ffffff" fill-opacity="0.18"/></svg>',
  );

function isTrack(value: string | null): value is TrackId {
  return value === 'game' || value === 'softdev';
}

interface ContrastRow {
  fg: string;
  bg: string;
  fgHex: string;
  bgHex: string;
  ratio: number;
  min: number;
}

export default function Kit() {
  const { theme } = useTheme();
  const [track, setTrack] = useState<TrackId>('game');
  const [currentTab, setCurrentTab] = useState('unity');
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [contrast, setContrast] = useState<ContrastRow[]>([]);
  const [root, setRoot] = useState<HTMLElement | null>(null);

  // URL → state (SSR-safe: only after mount).
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('track');
    if (isTrack(fromUrl)) setTrack(fromUrl);
  }, []);

  // State → URL, so the address reflects the open accent.
  const chooseTrack = (next: TrackId) => {
    setTrack(next);
    const url = new URL(window.location.href);
    url.searchParams.set('track', next);
    window.history.replaceState(null, '', url);
  };

  // Read the computed tokens whenever theme or track changes.
  useEffect(() => {
    if (!root) return;
    const values: Record<string, string> = {};
    for (const token of [...COLOR_TOKENS, ...TYPE_SAMPLES.map((s) => s.token), ...SPACE_TOKENS, '--section-gap', '--gutter', '--container-max']) {
      values[token] = readToken(root, token);
    }
    setTokens(values);
    const rows: ContrastRow[] = [];
    for (const [fg, bg, min] of CONTRAST_PAIRS) {
      const f = parseColor(values[fg] ?? '');
      const b = parseColor(values[bg] ?? '');
      if (!f || !b) continue;
      rows.push({ fg, bg, fgHex: toHex(f), bgHex: toHex(b), ratio: contrastRatio(f, b), min });
    }
    setContrast(rows);
  }, [root, theme, track]);

  const tabItems = useMemo(() => TAB_ITEMS.map((item) => ({ ...item, current: item.id === currentTab })), [currentTab]);

  return (
    <>
      <SkipLink href="#kit-main" />
      <header className={styles.topbar}>
        <Container className={styles.topbarInner}>
          <a href="#kit-main" className={styles.monogram} aria-label="Design kit, top">
            KK
          </a>
          <nav aria-label="Kit sections" className={styles.topnav}>
            <a href="#colors">Colours</a>
            <a href="#type">Type</a>
            <a href="#buttons">Buttons</a>
            <a href="#tabs">Tabs</a>
            <a href="#media">Media</a>
            <a href="#footer-band">Footer</a>
          </nav>
          <div className={styles.controls}>
            <fieldset className={styles.trackSwitch} data-testid="kit-track">
              <legend className={styles.legend}>Accent</legend>
              {(['game', 'softdev'] as const).map((id) => (
                <label key={id} className={cx(styles.trackOption, track === id && styles.trackOptionActive)}>
                  <input type="radio" name="track" value={id} checked={track === id} onChange={() => chooseTrack(id)} className={styles.trackInput} />
                  {id === 'game' ? 'Game' : 'Software'}
                </label>
              ))}
            </fieldset>
            <ThemeToggle id="kit-theme-toggle" />
          </div>
        </Container>
      </header>

      <main id="kit-main" tabIndex={-1} data-testid="kit" data-track={track} ref={setRoot} className={styles.main}>
        <Section id="intro" width="default">
          <p className={styles.eyebrow}>Design kit · {theme} · {track}</p>
          <h1 className={styles.kitTitle}>Every token and primitive, in every state.</h1>
          <p className={styles.lede}>
            Switch the theme with the toggle and the accent with the radio buttons. The contrast table below is measured from the computed
            styles, so what it reports is what ships.
          </p>
        </Section>

        <Section id="colors" title="Colours">
          <ul role="list" className={styles.swatches}>
            {COLOR_TOKENS.map((token) => (
              <li key={token} className={styles.swatch}>
                <span className={styles.swatchFill} style={{ background: `var(${token})` }} aria-hidden="true" />
                <code className={styles.swatchName}>{token.replace('--color-', '')}</code>
                <span className={styles.swatchValue} data-numeric>
                  {tokens[token] ?? '…'}
                </span>
              </li>
            ))}
          </ul>
          <h3 className={styles.subhead}>Contrast (measured)</h3>
          {/* Scrolls horizontally on phones, so it is a focusable, labelled region (axe: scrollable-region-focusable). */}
          <div className={styles.tableWrap} role="region" aria-label="Contrast table" tabIndex={0}>
            <table className={styles.table} data-testid="contrast-table">
              <thead>
                <tr>
                  <th scope="col">Foreground</th>
                  <th scope="col">Background</th>
                  <th scope="col">Ratio</th>
                  <th scope="col">Minimum</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {contrast.map((row) => {
                  const ok = row.ratio >= row.min;
                  return (
                    <tr key={`${row.fg}/${row.bg}`} data-contrast-pass={ok}>
                      <td>
                        <code>{row.fg.replace('--color-', '')}</code> <span className={styles.hex}>{row.fgHex}</span>
                      </td>
                      <td>
                        <code>{row.bg.replace('--color-', '')}</code> <span className={styles.hex}>{row.bgHex}</span>
                      </td>
                      <td data-numeric>{row.ratio.toFixed(2)}:1</td>
                      <td data-numeric>{row.min}:1</td>
                      <td className={ok ? styles.pass : styles.fail}>{ok ? 'Pass' : 'Fail'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="type" title="Typography">
          <ul role="list" className={styles.typeList}>
            {TYPE_SAMPLES.map((sample) => (
              <li key={sample.token} className={styles.typeRow}>
                <span className={styles.typeMeta}>
                  <code>{sample.token}</code> <span data-numeric>{tokens[sample.token] ?? '…'}</span> · {sample.label}
                </span>
                <span className={sample.className}>Kishan Kahodariya — Game Developer &amp; Software Engineer</span>
              </li>
            ))}
          </ul>
          <p className={styles.note}>
            Fonts: <code>--font-sans</code> Inter Variable (self-hosted, swap) · <code>--font-mono</code> system mono. Headings use{' '}
            <code>text-wrap: balance</code>; numbers use tabular figures via <code>data-numeric</code>.
          </p>
        </Section>

        <Section id="space" title="Spacing, radii, layout">
          <ul role="list" className={styles.spaceList}>
            {SPACE_TOKENS.map((token) => (
              <li key={token} className={styles.spaceRow}>
                <code className={styles.spaceName}>{token}</code>
                <span className={styles.spaceBar} style={{ width: `var(${token})` }} aria-hidden="true" />
                <span className={styles.spaceValue} data-numeric>
                  {tokens[token] ?? '…'}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.radii}>
            <div className={cx(styles.radiusBox, styles.radiusSm)}>--radius-sm · 8px</div>
            <div className={cx(styles.radiusBox, styles.radiusMd)}>--radius-md · 12px</div>
            <div className={cx(styles.radiusBox, styles.radiusPill)}>--radius-pill</div>
          </div>
          <p className={styles.note}>
            <code>--section-gap</code> {tokens['--section-gap']} · <code>--gutter</code> {tokens['--gutter']} · <code>--container-max</code>{' '}
            {tokens['--container-max']} · breakpoints: phone &lt; 768, tablet 768–1023, desktop ≥ 1024.
          </p>
          <div className={styles.surfaces}>
            <div className={styles.surfaceCard}>
              <h3>Surface card</h3>
              <p>
                <code>--color-surface</code> with a <code>--color-hairline</code> border and <code>--radius-md</code>. Body text and a{' '}
                <span className={styles.mutedText}>muted date</span>.
              </p>
              <div className={styles.surfaceRaised}>
                <code>--color-surface-raised</code> nested panel, body text only.
              </div>
            </div>
            <div className={cx(styles.surfaceCard, styles.surfaceFeatured)}>
              <h3>Featured card</h3>
              <p>
                Border in <code>--color-accent-border</code>. Group name in <span className={styles.accentText}>--color-accent-ink</span>.
              </p>
            </div>
          </div>
        </Section>

        <Section id="buttons" title="Buttons">
          <Demo label="Variants · md">
            <Button variant="accent">Game Dev Resume</Button>
            <Button variant="outline">View Code</Button>
            <Button variant="ghost">About</Button>
            <span className={styles.bandInline} data-on-accent>
              <Button variant="onAccent">GitHub</Button>
            </span>
          </Demo>
          <Demo label="Variants · lg">
            <Button variant="accent" size="lg">
              Game Dev Resume
            </Button>
            <Button variant="outline" size="lg">
              View Code
            </Button>
            <Button variant="ghost" size="lg">
              About
            </Button>
          </Demo>
          <Demo label="With icons">
            <Button variant="accent" icon="play">
              Gameplay
            </Button>
            <Button variant="outline" icon="github">
              View Code
            </Button>
            <Button variant="outline" iconEnd="chevron-right">
              Next
            </Button>
            <Button variant="ghost" icon="menu">
              Menu
            </Button>
          </Demo>
          <Demo label="Links (external ones open in a new tab and say so)">
            <LinkButton variant="accent" href="https://example.com/resume.pdf">
              Software Resume
            </LinkButton>
            <LinkButton variant="outline" icon="linkedin" href="https://www.linkedin.com/">
              LinkedIn
            </LinkButton>
            <LinkButton variant="outline" icon="email" href="mailto:hello@example.com">
              Email
            </LinkButton>
            <LinkButton variant="ghost" href="#colors">
              Jump to colours
            </LinkButton>
          </Demo>
          <Demo label="Disabled">
            <Button variant="accent" disabled>
              Accent
            </Button>
            <Button variant="outline" disabled>
              Outline
            </Button>
            <Button variant="ghost" disabled>
              Ghost
            </Button>
          </Demo>
          <Demo label="Full width (card action row on phones)" stack>
            <div className={styles.row}>
              <Button variant="outline" fullWidth>
                View Code
              </Button>
              <Button variant="accent" fullWidth icon="play">
                Play
              </Button>
            </div>
          </Demo>
          <Demo label="Long label wraps instead of overflowing">
            <Button variant="outline">A deliberately long button label that must wrap on narrow screens rather than overflow</Button>
          </Demo>
        </Section>

        <Section id="icon-buttons" title="Icon buttons">
          <Demo label="Shapes and variants (all 44px or larger, all named)">
            <IconButton icon="close" label="Close viewer" shape="circle" />
            <IconButton icon="chevron-left" label="Previous screenshot" shape="circle" />
            <IconButton icon="chevron-right" label="Next screenshot" shape="circle" />
            <IconButton icon="menu" label="Open menu" />
            <IconButton icon="play" label="Play video" variant="accent" />
            <IconButton icon="close" label="Close" variant="ghost" />
            <IconButton icon="external" label="Open in a new tab" size="lg" shape="circle" />
          </Demo>
        </Section>

        <Section id="chips" title="Chips">
          <Demo label="Skill chips · md · rounded">
            <Chip>Unity3D</Chip>
            <Chip>Unreal Engine</Chip>
            <Chip>AWS (Amazon Web Services)</Chip>
            <Chip variant="accent">Netcode</Chip>
            <Chip variant="accent">Photon</Chip>
          </Demo>
          <Demo label="Tag chips · sm · pill">
            <ul role="list" className={styles.tags}>
              <Chip as="li" size="sm" shape="pill">
                Unity
              </Chip>
              <Chip as="li" size="sm" shape="pill">
                C#
              </Chip>
              <Chip as="li" size="sm" shape="pill" variant="accent">
                Photon
              </Chip>
            </ul>
          </Demo>
          <div className={styles.skillRows}>
            <div className={styles.skillRow}>
              <span className={cx(styles.skillName, styles.skillNameAccent)}>Game Dev</span>
              <div className={styles.chipWrap}>
                {['Unity3D', 'Unreal Engine', 'AR/VR', 'Netcode', 'Photon', 'Unity Cloud', 'Git'].map((s) => (
                  <Chip key={s} variant="accent">
                    {s}
                  </Chip>
                ))}
              </div>
            </div>
            <div className={styles.skillRow}>
              <span className={styles.skillName}>Backend</span>
              <div className={styles.chipWrap}>
                {['MySQL', 'MongoDB', 'Firebase', 'WebGL', 'Javascript', 'React Js', 'HTML', 'CSS'].map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section id="tabs" title="Segmented tabs" centered>
          <SegmentedTabs
            label="Project categories"
            items={tabItems}
            renderLink={(item, props) => (
              <a
                href={item.href}
                {...props}
                onClick={(event) => {
                  event.preventDefault();
                  setCurrentTab(item.id);
                }}
              />
            )}
          />
          <p className={cx(styles.note, styles.centerText)}>
            Links with <code>aria-current="page"</code> on the open tab. Resize below 768px: items stretch; with more tabs the row scrolls.
          </p>
        </Section>

        <Section id="icons" title="Icons">
          <ul role="list" className={styles.iconGrid}>
            {ICON_NAMES.map((name) => (
              <li key={name} className={styles.iconCell}>
                <Icon name={name} size={24} />
                <code>{name}</code>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="media" title="Media overlay button">
          <div className={styles.mediaGrid}>
            <div className={styles.card}>
              <MediaOverlayButton
                data-testid="media-overlay"
                src={PLACEHOLDER_SHOT}
                alt="Scarfall cover image"
                width={1600}
                height={900}
                label="View Gameplay & Screenshots"
                loading="eager"
              />
              <ul role="list" className={styles.tags}>
                <Chip as="li" size="sm" shape="pill">
                  Unity
                </Chip>
                <Chip as="li" size="sm" shape="pill">
                  C#
                </Chip>
              </ul>
              <h3 className={styles.cardTitle}>Scarfall</h3>
              <p className={styles.mutedText} data-numeric>
                2019–2020
              </p>
              <p className={styles.cardText}>Hover or focus the image: the scrim fades in. On touch devices the label is a badge.</p>
              <div className={styles.row}>
                <Button variant="outline" fullWidth>
                  View Code
                </Button>
                <Button variant="accent" fullWidth icon="play">
                  Gameplay
                </Button>
              </div>
            </div>
            <div className={cx(styles.card, styles.cardFeatured)}>
              <MediaOverlayButton src={PLACEHOLDER_SHOT} alt="OuiChef cover image" width={1600} height={900} label="View Screenshots" aspectRatio="4 / 3" />
              <h3 className={styles.cardTitle}>Featured card · 4:3 media</h3>
              <p className={styles.cardText}>Accent border on the card; the media box keeps the aspect ratio while the image loads.</p>
            </div>
          </div>
        </Section>

        <Section id="theme" title="Theme toggle">
          <div className={styles.toggleRow}>
            <div className={styles.toggleCell}>
              <ThemeToggle />
              <span className={styles.caption}>On the canvas</span>
            </div>
            <div className={cx(styles.toggleCell, styles.toggleCellSurface)}>
              <ThemeToggle />
              <span className={styles.caption}>On a surface</span>
            </div>
            <div className={cx(styles.toggleCell, styles.toggleCellAccent)} data-on-accent>
              <ThemeToggle />
              <span className={styles.caption}>On the accent band</span>
            </div>
          </div>
          <p className={styles.note}>
            <code>&lt;button role="switch"&gt;</code>, <code>aria-checked</code> true in light mode, name states the action. 88 × 44px hit area.
          </p>
        </Section>

        <Section id="footer-band" title="Footer band sample" className={styles.footerSection} containerClassName={styles.footerContainer}>
          <div className={styles.band} data-on-accent data-testid="footer-band">
            <Container className={styles.bandInner}>
              <div className={styles.bandColumns}>
                <div className={styles.bandColumn}>
                  <h3 className={styles.bandHeading}>Navigate</h3>
                  <ul role="list" className={styles.bandLinks}>
                    {['About', 'Projects', 'Experience', 'Skills', 'Education'].map((label) => (
                      <li key={label}>
                        <a href="#kit-main" className={styles.bandLink}>
                          {label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={styles.bandColumn}>
                  <h3 className={styles.bandHeading}>Connect</h3>
                  <div className={styles.bandButtons}>
                    <LinkButton variant="onAccent" icon="youtube" href="https://www.youtube.com/">
                      YouTube
                    </LinkButton>
                    <LinkButton variant="onAccent" icon="github" href="https://github.com/">
                      GitHub
                    </LinkButton>
                    <LinkButton variant="onAccent" icon="itchio" href="https://itch.io/">
                      itch.io
                    </LinkButton>
                    <LinkButton variant="onAccent" icon="linkedin" href="https://www.linkedin.com/">
                      LinkedIn
                    </LinkButton>
                    <LinkButton variant="onAccent" icon="email" href="mailto:hello@example.com">
                      Email
                    </LinkButton>
                  </div>
                </div>
              </div>
              <div className={styles.bandBottom}>
                <span className={styles.bandMuted}>Outline and ghost buttons also work here:</span>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <ThemeToggle className={styles.bandToggle} />
              </div>
            </Container>
            <div className={styles.credit}>
              <Container>
                <p>Developed by Kishan Kahodariya.</p>
                <p>© All rights reserved.</p>
              </Container>
            </div>
          </div>
        </Section>

        <Section id="a11y" title="Skip link and hidden text">
          <p className={styles.note}>
            Press Tab from the address bar: the skip link appears top-left. Screen readers also hear the hidden text after this sentence
            <VisuallyHidden> — this text is visually hidden but announced</VisuallyHidden>.
          </p>
        </Section>
      </main>
    </>
  );
}

function Demo({ label, children, stack = false }: { label: string; children: ReactNode; stack?: boolean }) {
  return (
    <div className={styles.demo}>
      <p className={styles.demoLabel}>{label}</p>
      <div className={cx(styles.demoBody, stack && styles.demoStack)}>{children}</div>
    </div>
  );
}
