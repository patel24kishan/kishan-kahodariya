import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/permanent-marker/latin-400.css';
import { getTrack, type PopupSettings } from '@/content';
import { Icon, cx } from '@/components/ui';
import { assetUrl, trackPath } from '@/lib/paths';
import { PackStage } from './PackStage';
import { liftPopupCover } from './popupCover';
import styles from './PopupDialog.module.css';

export interface PopupDialogProps {
  popup: PopupSettings;
  email: string;
  onClose: () => void;
}

/**
 * The popup moves through six stages. Each stage adds a class to the dialog, so the CSS can
 * say "from the moment the card is out" with one selector:
 *   0 pack   the sealed pack waits to be torn
 *   1 torn   the strip flies off
 *   2 rise   the card back rises out of the pack
 *   3 out    the pack drops away, the card grows to full size
 *   4 flip   the card flips to its front
 *   5 done   the buttons appear and the name tag drops
 */
const STAGE_NAMES = ['pack', 'torn', 'rise', 'out', 'flip', 'done'] as const;
const FOCUSABLE = 'a[href], button:not([disabled])';

function focusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => element.getClientRects().length > 0 && element.closest('[inert]') === null && getComputedStyle(element).visibility !== 'hidden');
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The popup itself: a native modal <dialog> (focus trapped, Esc closes, the page behind is
 * inert and does not scroll). Mounted only while open, so it never renders on the server.
 * It opens on a foil pack the visitor tears open (drawn by a shader, see PackStage); the card
 * back rises out, flips to the card (Design canvas, option D) and the buttons and the
 * "Open to work" name tag follow. Without the pack (switched off, no WebGL, or reduced
 * motion) the card is shown straight away. Every text comes from site settings.
 */
export default function PopupDialog({ popup, email, onClose }: PopupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closingRef = useRef(false);
  const timers = useRef<number[]>([]);
  const [copied, setCopied] = useState(false);
  const [reduced] = useState(prefersReducedMotion);
  const [packActive, setPackActive] = useState(() => popup.packEnabled && !prefersReducedMotion());
  const [stage, setStage] = useState(() => (popup.packEnabled && !prefersReducedMotion() ? 0 : prefersReducedMotion() ? 5 : 3));

  const at = (delay: number, next: number) => {
    timers.current.push(window.setTimeout(() => setStage(next), delay));
  };

  // Without a pack the card still arrives gently: the back shows for a moment, then it flips.
  useEffect(() => {
    if (!packActive && stage === 3) {
      at(450, 4);
      at(1350, 5);
    }
    // Only for the case where the popup starts without a pack; later stages are scheduled by the handlers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const torn = () => {
    setStage(1);
    at(250, 2);
    at(1250, 3);
    at(2050, 4);
    at(2950, 5);
  };

  // WebGL is not available (or the shader failed): skip the pack and show the card.
  const packUnsupported = () => {
    setPackActive(false);
    at(0, 3);
    at(450, 4);
    at(1350, 5);
  };

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
  };

  // Open as a modal and lock the page behind it (same approach as the media viewer).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const html = document.documentElement;
    const previous = { overflow: html.style.overflow, paddingRight: html.style.paddingRight };
    const scrollbar = Math.max(0, window.innerWidth - html.clientWidth);
    html.style.overflow = 'hidden';
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    if (!dialog.open) dialog.showModal();
    // Focus the popup itself (no focus ring); Tab moves on to the scissors and the buttons.
    dialog.focus();
    const pending = timers.current;
    // The page was covered until now (popupCover.ts). The dialog fades in, so lift the cover
    // only when the fade is over: otherwise the page would show through it for an instant.
    const lift = (event?: Event) => {
      if (event && event.target !== dialog) return;
      liftPopupCover();
    };
    dialog.addEventListener('animationend', lift, { once: true });
    pending.push(window.setTimeout(lift, 600));
    return () => {
      dialog.removeEventListener('animationend', lift);
      pending.forEach((id) => window.clearTimeout(id));
      if (dialog.open) dialog.close();
      html.style.overflow = previous.overflow;
      html.style.paddingRight = previous.paddingRight;
    };
  }, []);

  // The scissors are gone once the pack is torn: keep focus inside the popup (on the dialog
  // itself, which shows no focus ring) instead of dropping it on the page behind.
  useEffect(() => {
    if (stage === 5 && !dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
  }, [stage]);

  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key !== 'Tab') return;
    const list = focusable(event.currentTarget);
    const first = list[0];
    const last = list[list.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // A click outside the content (on the dimmed page) closes.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target instanceof Element && event.target.closest('[data-popup-content]')) return;
    requestClose();
  };

  // Discord has no link from a username alone, so the button copies it.
  const discord = popup.discordHandle.trim().replace(/^@/, '');
  const mail = email.trim();
  const hasSayHi = mail !== '' && popup.sayHiLabel.trim() !== '';
  const hasUtility = discord !== '' || hasSayHi;
  const hasTag = [popup.tagBand, popup.tagGreeting, popup.tagName, popup.tagRole].some((part) => part.trim() !== '');
  const heading = popup.heading.trim();
  const packHeading = popup.packHeading.trim();
  const cardOpen = stage >= 4;
  const showPackHeading = packActive && stage < 4;

  const copyDiscord = async () => {
    try {
      await navigator.clipboard.writeText(discord);
    } catch {
      // Clipboard blocked: select the text through a temporary field instead.
      const field = document.createElement('textarea');
      field.value = discord;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      dialogRef.current?.appendChild(field);
      field.select();
      try {
        document.execCommand('copy');
      } catch {
        // Nothing more to try; the username is still shown on the button.
      }
      field.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  };

  const action = (id: 'game' | 'softdev', label: string, className: string) => {
    if (label.trim() === '') return null;
    return (
      <Link to={trackPath(getTrack(id))} className={`${styles.action} ${className}`} onClick={requestClose} data-popup-action={id}>
        <span className={styles.actionText}>
          <span className={styles.actionTitle}>{label}</span>
          {popup.tapHint.trim() !== '' && <span className={styles.actionHint}>{popup.tapHint}</span>}
        </span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square">
          <path d="M5 12h14" />
          <path d="M13 6l6 6-6 6" />
        </svg>
      </Link>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className={cx(
        styles.popup,
        stage >= 1 && styles.torn,
        stage >= 2 && styles.rise,
        stage >= 3 && styles.out,
        stage >= 4 && styles.flip,
        stage >= 5 && styles.done,
        reduced && styles.still,
      )}
      aria-label={cardOpen || !packActive ? heading || 'Welcome' : packHeading || 'Welcome'}
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={(event) => {
        if (event.currentTarget.isConnected && !event.currentTarget.open) requestClose();
      }}
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={-1}
      data-testid="welcome-popup"
      data-popup-stage={STAGE_NAMES[stage]}
    >
      <div className={styles.column} data-popup-content data-on-dark>
        <div className={styles.top}>
          <h2 className={styles.heading}>
            <span className={cx(styles.headPack, showPackHeading && styles.headOn)} aria-hidden={!showPackHeading}>
              {packHeading}
            </span>
            <span className={cx(styles.headMain, !showPackHeading && styles.headOn)} aria-hidden={showPackHeading}>
              {heading}
            </span>
          </h2>
          <button type="button" className={styles.close} aria-label="Close the popup" onClick={requestClose} data-popup-close>
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className={styles.cardWrap}>
          <div className={styles.card} inert={!cardOpen} aria-hidden={!cardOpen} data-popup-card>
            <div className={styles.flipper}>
              <div className={cx(styles.face, styles.back)}>
                <svg role="img" aria-label="K24" width="104" height="104" viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="38" fill="none" stroke="rgba(250,255,105,.5)" strokeWidth="1.5" />
                  <text x="35" y="55" textAnchor="middle" fontFamily="'Barlow Condensed', sans-serif" fontWeight="800" fontSize="46" fill="#f4f4ef">
                    K
                  </text>
                  <text x="52" y="31" fontFamily="'Barlow Condensed', sans-serif" fontWeight="700" fontSize="12" letterSpacing="0.6" fill="#faff69">
                    24
                  </text>
                  <path d="M53 50h9M57.5 45.5v9" stroke="#faff69" strokeWidth="2" strokeLinecap="square" fill="none" />
                </svg>
              </div>
              <div className={cx(styles.face, styles.frame)}>
                <div className={styles.inner}>
                  <div className={styles.picture}>
                    <img src={assetUrl('/images/popup-hero.jpg')} alt="Cartoon game developer at his desk with a controller" width={1200} height={630} className={styles.image} />
                    {popup.bubble.trim() !== '' && <div className={styles.bubble}>{popup.bubble}</div>}
                  </div>
                  {popup.message.trim() !== '' && <p className={styles.message}>{popup.message}</p>}
                </div>
                <span className={styles.shine} aria-hidden="true" />
              </div>
            </div>
          </div>

          {packActive && stage < 4 && (
            <PackStage
              title={popup.packTitle}
              edition={popup.packEdition}
              footer={popup.packFooter}
              hint={popup.packHint}
              onTorn={torn}
              onUnsupported={packUnsupported}
            />
          )}
        </div>

        <div className={styles.extras} inert={stage < 5} aria-hidden={stage < 5}>
          {(popup.gameLabel.trim() !== '' || popup.softLabel.trim() !== '') && (
            <div className={styles.actions}>
              {action('game', popup.gameLabel, styles.game ?? '')}
              {action('softdev', popup.softLabel, styles.soft ?? '')}
            </div>
          )}

          {hasUtility && (
            <div className={styles.utility}>
              {discord !== '' && (
                <button type="button" className={styles.utilityLink} onClick={copyDiscord} aria-label={`Copy Discord username ${discord}`} data-popup-discord>
                  <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="#5865f2" focusable="false">
                    <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
                  </svg>
                  <span className={styles.handle}>{copied ? 'Copied!' : discord}</span>
                  <span className={styles.srOnly} role="status">
                    {copied ? `Copied ${discord}` : ''}
                  </span>
                </button>
              )}
              {hasSayHi && (
                <a href={`mailto:${mail}`} className={styles.utilityLink} data-popup-mail>
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square">
                    <path d="M3 5h18v14H3V5Z" />
                    <path d="M3 6l9 7 9-7" />
                  </svg>
                  {popup.sayHiLabel}
                </a>
              )}
            </div>
          )}
        </div>

        {hasTag && (
          <div className={styles.tag} inert={stage < 5} aria-hidden={stage < 5} data-popup-tag>
            <div className={styles.tagBody}>
              <span className={styles.slot} aria-hidden="true" />
              {popup.tagBand.trim() !== '' && (
                <div className={styles.band}>
                  <span className={styles.dot} aria-hidden="true" />
                  {popup.tagBand}
                  <span className={styles.gleam} aria-hidden="true" />
                </div>
              )}
              <div className={styles.tagText}>
                {popup.tagGreeting.trim() !== '' && <div className={styles.greeting}>{popup.tagGreeting}</div>}
                {popup.tagName.trim() !== '' && (
                  <div className={styles.name}>
                    {popup.tagName}
                    <span className={styles.ink} aria-hidden="true" />
                  </div>
                )}
                {popup.tagRole.trim() !== '' && <div className={styles.role}>{popup.tagRole}</div>}
              </div>
            </div>
          </div>
        )}

        <span className={styles.srOnly} role="status">
          {stage >= 1 && stage < 5 ? 'The pack is open.' : ''}
        </span>
      </div>
    </dialog>
  );
}
