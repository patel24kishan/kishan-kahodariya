/*
 * PER-PAGE PREVIEW — what the game page and the software page will show for the item that
 * is being edited, side by side, updated while the owner types.
 *
 * WHAT THIS IS, AND WHAT IT IS NOT
 * The content is exact: which words, which bullet set, which hover text, which buttons, on
 * which page, in which place — all decided by the same rules as the site (preview-logic.js,
 * checked against the site's own code by tests/admin/preview.spec.ts).
 * The look is simplified: it uses the site's colours and corner radii, but not its fonts,
 * spacing, image cropping or responsive layout, and it does not run the site's components.
 * It is a faithful preview of content, not a pixel preview of the page. The panel says so.
 * (Why, and what a pixel-exact preview would need: logs/issues/admin-01-*.md.)
 *
 * HOW IT WORKS
 * Sveltia CMS lets a page register a React component per collection or file as its preview
 * (https://sveltiacms.app/en/docs/api/preview-templates). The CMS brings its own React and
 * exposes it as CMS.React; `html` is HTM, a tagged template that builds React elements, so no
 * build step is needed. The preview is drawn inside an iframe whose only stylesheet is
 * preview.css (registered below).
 *
 * If this file fails to load, the dashboard still works and shows its built-in preview
 * (a plain list of the fields).
 */
import {
  ALL_TAB_ID,
  PAGES,
  belongsTo,
  cleanList,
  cleanScreenshots,
  cleanTabResumes,
  hoverText,
  isEmphasised,
  linkOnPage,
  linkPosition,
  linksInPlace,
  positionOn,
  projectButtons,
  resolvedBullets,
  resumeForTab,
  tabLabel,
  tabs,
} from './preview-logic.js';

const CMS = window.CMS;
const html = window.html;

if (CMS && html && CMS.React && typeof CMS.registerPreviewTemplate === 'function') {
  const { useEffect, useState } = CMS.React;

  /** Address of the site this dashboard belongs to: the folder above /admin/. */
  const SITE_BASE = new URL('../', import.meta.url).href;

  // ---------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------

  /** The entry's fields as a plain object. */
  const dataOf = (entry) => {
    const data = entry && typeof entry.get === 'function' ? entry.get('data') : undefined;
    return data && typeof data.toJS === 'function' ? data.toJS() : {};
  };

  const str = (value) => (typeof value === 'string' ? value : '');

  /**
   * A displayable address for an image value: an uploaded file (possibly not saved yet), a
   * path on the site ("/images/profile.jpg") or a full address.
   */
  const imageUrl = (getAsset, value) => {
    const path = str(value).trim();
    if (path === '') return '';
    if (/^(?:https?:|blob:|data:)/i.test(path)) return path;
    let asset;
    try {
      asset = getAsset(path);
    } catch {
      asset = undefined;
    }
    if (asset && typeof asset.url === 'string' && /^(?:blob:|https?:|data:)/i.test(asset.url)) return asset.url;
    return path.startsWith('/') ? SITE_BASE + path.slice(1) : path;
  };

  /** Saved Site settings (tabs, name…), or null while loading. */
  const useSite = (getCollection) => {
    const [site, setSite] = useState(null);
    useEffect(() => {
      let alive = true;
      Promise.resolve(getCollection('_singletons', 'site'))
        .then((entry) => {
          if (alive) setSite(dataOf(entry));
        })
        .catch(() => {
          if (alive) setSite({});
        });
      return () => {
        alive = false;
      };
    }, []);
    return site;
  };

  /** Every saved entry of a collection as plain objects, or null while loading. */
  const useEntries = (getCollection, name) => {
    const [items, setItems] = useState(null);
    useEffect(() => {
      let alive = true;
      Promise.resolve(getCollection(name))
        .then((entries) => {
          if (alive) setItems(Array.from(entries ?? [], (entry) => dataOf(entry)));
        })
        .catch(() => {
          if (alive) setItems([]);
        });
      return () => {
        alive = false;
      };
    }, []);
    return items;
  };

  // ---------------------------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------------------------

  const Picture = ({ src, alt, className, keyPath }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (src === '') return html`<div class="kk-picture kk-picture--empty ${className ?? ''}" data-key-path=${keyPath}>No image</div>`;
    if (failed) {
      return html`<div class="kk-picture kk-picture--empty ${className ?? ''}" data-key-path=${keyPath}>
        The image did not load here
      </div>`;
    }
    return html`<img
      class="kk-picture ${className ?? ''}"
      data-key-path=${keyPath}
      src=${src}
      alt=${alt}
      referrerpolicy="no-referrer"
      onError=${() => setFailed(true)}
    />`;
  };

  const Chips = ({ items, keyPath, accent }) =>
    items.length === 0
      ? null
      : html`<ul class=${accent ? 'kk-chips kk-chips--accent' : 'kk-chips'} data-key-path=${keyPath}>
          ${items.map((item, index) => html`<li key=${index}>${item}</li>`)}
        </ul>`;

  const Fact = ({ label, children }) => html`<div class="kk-fact"><dt>${label}</dt><dd>${children}</dd></div>`;

  const Panel = ({ page, title, children }) => html`<section class="kk-page" data-track=${page ? page.id : 'both'}>
    <h2 class="kk-page__title">${title ?? page.label}</h2>
    ${children}
  </section>`;

  /** The frame every preview shares: the honesty note, the draft notice, then the panels. */
  const Frame = ({ data, hasDraftSwitch, single, children }) => html`<div class="kk-preview">
    <p class="kk-note">
      <strong>Content preview.</strong> The words, the order and what is shown or hidden are exactly what each page
      will get. Fonts, spacing and image cropping are simplified — the live site is the final look.
    </p>
    ${hasDraftSwitch && data.published !== true
      ? html`<p class="kk-draft" data-key-path="published">
          <strong>Draft.</strong> “Published” is off, so this item is saved but is not on the site. The panels below
          show what it will look like once you switch it on.
        </p>`
      : null}
    <div class=${single ? 'kk-pages kk-pages--single' : 'kk-pages'}>${children}</div>
  </div>`;

  const ownership = (audience, page, thing) => {
    if (!['game', 'softdev', 'both'].includes(audience)) return 'Choose “Page” above to decide this.';
    return belongsTo(audience, page)
      ? `Listed among this page’s own ${thing}.`
      : `Listed after this page’s own ${thing} (it belongs to the other page).`;
  };

  // ---------------------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------------------

  const ProjectPreview = ({ entry, getAsset, getCollection }) => {
    const data = dataOf(entry);
    const site = useSite(getCollection);
    const shots = cleanScreenshots(data.screenshots);
    const cover = shots[0];
    const buttons = projectButtons(data);
    const hover = site ? hoverText(data, site) : { text: str(data.hoverText), from: 'project' };
    const tab = site ? tabLabel(site, data.category) : '';
    const allTab = site ? tabLabel(site, ALL_TAB_ID) : 'All';
    const tags = cleanList(data.tags);

    return html`<${Frame} data=${data} hasDraftSwitch=${true}>
      ${PAGES.map(
        (page) => html`<${Panel} key=${page.id} page=${page}>
          <p class="kk-where" data-key-path="category">
            ${tab !== ''
              ? html`Under the <strong>${tab}</strong> tab and the <strong>${allTab}</strong> tab.`
              : html`Choose a tab — until then the card has no place on the page.`}
          </p>
          <article class=${data.featured === true ? 'kk-card kk-card--featured' : 'kk-card'}>
            <div class="kk-card__media" data-key-path="screenshots">
              <${Picture}
                src=${cover ? imageUrl(getAsset, cover.src) : ''}
                alt=${cover ? cover.alt : ''}
                className="kk-card__image"
              />
              ${hover.text !== ''
                ? html`<span class="kk-card__hover" data-key-path="hoverText">${hover.text}</span>`
                : null}
            </div>
            <div class="kk-card__body">
              <${Chips} items=${tags} keyPath="tags" />
              <h3 class="kk-card__title" data-key-path="title">${str(data.title) || 'Untitled project'}</h3>
              ${str(data.dateDisplay) !== ''
                ? html`<p class="kk-card__date" data-key-path="dateDisplay">${data.dateDisplay}</p>`
                : null}
              ${str(data.shortDescription) !== ''
                ? html`<p class="kk-card__text" data-key-path="shortDescription">${data.shortDescription}</p>`
                : null}
              ${buttons.shown.length > 0 || buttons.gameplay
                ? html`<div class="kk-buttons" data-key-path="links">
                    ${buttons.shown.map((link, index) => html`<span key=${index} class="kk-button">${link.label || 'Link'}</span>`)}
                    ${buttons.gameplay
                      ? html`<span class="kk-button kk-button--filled" data-key-path="videoUrl">Gameplay</span>`
                      : null}
                  </div>`
                : null}
            </div>
          </article>
          <dl class="kk-facts">
            <${Fact} label="Hover text">
              ${hover.text === '' ? 'None' : `“${hover.text}”`}
              ${hover.from === 'tab' ? ' — the default of the tab' : ''}
              ${hover.from === 'fallback' ? ' — the general default (no tab chosen)' : ''}
            <//>
            <${Fact} label="Card image">
              ${shots.length === 0
                ? 'No screenshot yet — the card has no image.'
                : `Screenshot 1 of ${shots.length}${buttons.gameplay ? ', plus the video' : ''} in the viewer.`}
            <//>
            <${Fact} label="Position">
              ${positionOn(data, page.id)}${data.featured === true ? ' — featured cards come first' : ''}
            <//>
            <${Fact} label=${`On the ${allTab} tab`}>${ownership(data.audience, page.id, 'projects')}<//>
            ${buttons.hidden.length > 0
              ? html`<${Fact} label="Hidden buttons">
                  ${buttons.hidden.map((link) => link.label || 'unnamed').join(', ')} — no address yet
                <//>`
              : null}
          </dl>
        <//>`,
      )}
    <//>`;
  };

  // ---------------------------------------------------------------------------------------
  // Experience
  // ---------------------------------------------------------------------------------------

  const ExperiencePreview = ({ entry, getAsset }) => {
    const data = dataOf(entry);
    const tags = cleanList(data.tags);
    const place = [str(data.location), data.remote === true ? 'Remote' : ''].filter((part) => part !== '').join(' · ');

    return html`<${Frame} data=${data} hasDraftSwitch=${true}>
      ${PAGES.map((page) => {
        const resolved = resolvedBullets(data, page.id);
        return html`<${Panel} key=${page.id} page=${page}>
          <article class="kk-job">
            <header class="kk-job__head">
              ${str(data.logo) !== ''
                ? html`<${Picture} src=${imageUrl(getAsset, data.logo)} alt="" className="kk-job__logo" keyPath="logo" />`
                : null}
              <div>
                <h3 class="kk-job__company" data-key-path="company">${str(data.company) || 'Company'}</h3>
                ${str(data.role) !== '' ? html`<p class="kk-job__role" data-key-path="role">${data.role}</p>` : null}
                ${str(data.dateDisplay) !== ''
                  ? html`<p class="kk-job__meta" data-key-path="dateDisplay">${data.dateDisplay}</p>`
                  : null}
                ${place !== '' ? html`<p class="kk-job__meta" data-key-path="location">${place}</p>` : null}
              </div>
            </header>
            ${resolved.bullets.length > 0
              ? html`<ul
                  class="kk-bullets"
                  data-key-path=${resolved.from === 'page' ? (page.id === 'game' ? 'bulletsGame' : 'bulletsSoftdev') : 'bullets'}
                >
                  ${resolved.bullets.map((bullet, index) => html`<li key=${index}>${bullet}</li>`)}
                </ul>`
              : html`<p class="kk-empty">No bullet points on this page.</p>`}
            <${Chips} items=${tags} keyPath="tags" />
          </article>
          <dl class="kk-facts">
            <${Fact} label="Bullet points">
              ${resolved.from === 'page'
                ? `This page’s own set (${resolved.bullets.length}).`
                : `The default set (${resolved.bullets.length}) — this page has no set of its own.`}
            <//>
            <${Fact} label="Position">${positionOn(data, page.id)}<//>
            <${Fact} label="Order">${ownership(data.audience, page.id, 'jobs')}<//>
          </dl>
        <//>`;
      })}
    <//>`;
  };

  // ---------------------------------------------------------------------------------------
  // Skill groups
  // ---------------------------------------------------------------------------------------

  const SkillsPreview = ({ entry }) => {
    const data = dataOf(entry);
    const skills = cleanList(data.skills);
    return html`<${Frame} data=${data} hasDraftSwitch=${true}>
      ${PAGES.map((page) => {
        const accent = isEmphasised(data, page.id);
        return html`<${Panel} key=${page.id} page=${page}>
          <div class="kk-skillrow">
            <h3 class=${accent ? 'kk-skillrow__name kk-accent' : 'kk-skillrow__name'} data-key-path="title">
              ${str(data.title) || 'Group name'}
            </h3>
            ${skills.length > 0
              ? html`<${Chips} items=${skills} keyPath="skills" accent=${accent} />`
              : html`<p class="kk-empty">No skills yet.</p>`}
          </div>
          <dl class="kk-facts">
            <${Fact} label="Highlight">
              ${accent ? 'Drawn in this page’s accent colour.' : 'Plain — not highlighted on this page.'}
            <//>
            <${Fact} label="Position">${positionOn(data, page.id)}<//>
          </dl>
        <//>`;
      })}
    <//>`;
  };

  // ---------------------------------------------------------------------------------------
  // Links
  // ---------------------------------------------------------------------------------------

  const LINK_REASONS = {
    'no-address': 'Not shown — the link has no address yet.',
    'other-page': 'Not shown — the link is set to the other page only.',
    'no-place': 'Not shown — neither “next to your name” nor “footer” is switched on.',
  };

  const LinkPreview = ({ entry }) => {
    const data = dataOf(entry);
    const label = str(data.label) || 'Link';
    return html`<${Frame} data=${data} hasDraftSwitch=${true}>
      ${PAGES.map((page) => {
        const place = linkOnPage(data, page.id);
        return html`<${Panel} key=${page.id} page=${page}>
          ${place.shown
            ? html`<div class="kk-places">
                <div class="kk-place" data-key-path="showInHero">
                  <p class="kk-place__name">Next to your name</p>
                  ${place.hero ? html`<span class="kk-button">${label}</span>` : html`<p class="kk-empty">Not here.</p>`}
                </div>
                <div class="kk-place kk-place--footer" data-key-path="showInFooter">
                  <p class="kk-place__name">Footer</p>
                  ${place.footer
                    ? html`<span class="kk-button kk-button--footer">${label}</span>`
                    : html`<p class="kk-empty">Not here.</p>`}
                </div>
              </div>`
            : html`<p class="kk-empty" data-key-path="audience">${LINK_REASONS[place.reason]}</p>`}
          <dl class="kk-facts">
            <${Fact} label="Opens">${str(data.url) !== '' ? data.url : 'No address yet'}<//>
            <${Fact} label="Icon">${str(data.icon) || 'link'}<//>
            <${Fact} label="Position next to your name">${linkPosition(data, 'hero')}<//>
            <${Fact} label="Position in the footer">${linkPosition(data, 'footer')}<//>
          </dl>
        <//>`;
      })}
    <//>`;
  };

  // ---------------------------------------------------------------------------------------
  // Certificates and education
  // ---------------------------------------------------------------------------------------

  const CertificatePreview = ({ entry, getAsset }) => {
    const data = dataOf(entry);
    return html`<${Frame} data=${data} hasDraftSwitch=${true}>
      ${PAGES.map(
        (page) => html`<${Panel} key=${page.id} page=${page}>
          <article class="kk-cert">
            <${Picture} src=${imageUrl(getAsset, data.image)} alt=${str(data.imageAlt)} className="kk-cert__image" keyPath="image" />
            <div>
              <h3 class="kk-cert__title" data-key-path="title">${str(data.title) || 'Certificate'}</h3>
              ${str(data.dateDisplay) !== ''
                ? html`<p class="kk-job__meta" data-key-path="dateDisplay">${data.dateDisplay}</p>`
                : null}
              ${str(data.description) !== ''
                ? html`<p class="kk-card__text" data-key-path="description">${data.description}</p>`
                : null}
            </div>
          </article>
          <dl class="kk-facts">
            <${Fact} label="Link">${str(data.url) !== '' ? data.url : 'None — the certificate is not clickable.'}<//>
            <${Fact} label="Position">${positionOn(data, page.id)}<//>
          </dl>
        <//>`,
      )}
    <//>`;
  };

  const EducationPreview = ({ entry }) => {
    const data = dataOf(entry);
    return html`<${Frame} data=${data} hasDraftSwitch=${true} single=${true}>
      <${Panel} title="Both pages (education looks the same on each)">
        <article class="kk-job">
          <h3 class="kk-job__company" data-key-path="school">${str(data.school) || 'School'}</h3>
          ${str(data.degree) !== '' ? html`<p class="kk-job__role" data-key-path="degree">${data.degree}</p>` : null}
          ${str(data.dateDisplay) !== ''
            ? html`<p class="kk-job__meta" data-key-path="dateDisplay">${data.dateDisplay}</p>`
            : null}
          ${str(data.grade) !== '' ? html`<p class="kk-job__meta" data-key-path="grade">${data.grade}</p>` : null}
          ${str(data.description) !== ''
            ? html`<p class="kk-card__text" data-key-path="description">${data.description}</p>`
            : null}
        </article>
        <dl class="kk-facts">
          <${Fact} label="Position">${typeof data.order === 'number' ? data.order : 0}<//>
        </dl>
      <//>
    <//>`;
  };

  // ---------------------------------------------------------------------------------------
  // Pages (the top of one page) and Site settings
  // ---------------------------------------------------------------------------------------

  const makePagePreview = (page) => ({ entry, getAsset, getCollection }) => {
    const data = dataOf(entry);
    const site = useSite(getCollection);
    const links = useEntries(getCollection, 'links');
    const heroLinks = linksInPlace(links ?? [], page.id, 'hero');
    const firstTab = site ? tabLabel(site, data.defaultTab) : '';
    const tabResumeRows = cleanTabResumes(data.tabResumes);

    return html`<${Frame} data=${data} single=${true}>
      <${Panel} page=${page} title=${`${page.label} — top of the page`}>
        <div class="kk-hero">
          <div class="kk-hero__text">
            <p class="kk-hero__name">${site ? str(site.name) : ''}</p>
            ${str(data.headline) !== ''
              ? html`<p class="kk-hero__headline kk-accent" data-key-path="headline">${data.headline}</p>`
              : null}
            ${str(data.summary) !== '' ? html`<p class="kk-card__text" data-key-path="summary">${data.summary}</p>` : null}
            <div class="kk-buttons">
              ${str(data.resumeUrl) !== ''
                ? html`<span class="kk-button kk-button--filled" data-key-path="resumeLabel">
                    ${str(data.resumeLabel) || 'Resume'}
                  </span>`
                : null}
              ${heroLinks.map((link, index) => html`<span key=${index} class="kk-button">${str(link.label)}</span>`)}
            </div>
          </div>
          <${Picture} src=${imageUrl(getAsset, data.photo)} alt=${str(data.photoAlt)} className="kk-hero__photo" keyPath="photo" />
        </div>
        <dl class="kk-facts">
          <${Fact} label="Resume button">
            ${str(data.resumeUrl) !== '' ? `Opens ${data.resumeUrl}` : 'Hidden — there is no resume link.'}
          <//>
          ${tabResumeRows.length === 0
            ? html`<${Fact} label="Resume per tab">None — every tab uses the resume button above.<//>`
            : tabResumeRows.map((row, index) => {
                const name = (site ? tabLabel(site, row.tab) : '') || row.tab;
                const repeated = tabResumeRows.findIndex((other) => other.tab === row.tab) !== index;
                const used = resumeForTab(data, row.tab);
                return html`<${Fact} key=${index} label=${`Resume on the ${name} tab`}>
                  ${repeated
                    ? 'This tab already has a row above — remove one of the two, or the next update of the site is stopped.'
                    : row.url.trim() === ''
                      ? 'No link yet — this tab uses the resume button above.'
                      : `Opens ${used.url} — button text “${used.label || 'Resume'}”.`}
                <//>`;
              })}
          <${Fact} label="Tab that opens first">
            ${firstTab !== '' ? firstTab : site ? 'This tab does not exist any more — choose another.' : ''}
          <//>
          <${Fact} label="Section order">
            ${data.certificatesFirst === true ? 'Certificates, then education.' : 'Education, then certificates.'}
          <//>
        </dl>
        <div class="kk-search" data-key-path="metaTitle">
          <p class="kk-search__label">In search results and link previews</p>
          <p class="kk-search__title">${str(data.metaTitle) || (site ? str(site.name) : '')}</p>
          <p class="kk-search__text">${str(data.metaDescription) || 'No description — search engines pick their own text.'}</p>
        </div>
      <//>
    <//>`;
  };

  /** The top-left corner of the nav: the logo image when there is one, otherwise the logo letters. */
  const NavLogo = ({ src, alt, monogram }) => {
    const [failed, setFailed] = useState(false);
    useEffect(() => setFailed(false), [src]);
    if (src === '' || failed) return html`<span class="kk-nav__logo" data-key-path="monogram">${monogram}</span>`;
    return html`<img
      class="kk-nav__logo-image"
      data-key-path="logo"
      src=${src}
      alt=${alt}
      referrerpolicy="no-referrer"
      onError=${() => setFailed(true)}
    />`;
  };

  const SitePreview = ({ entry, getAsset }) => {
    const data = dataOf(entry);
    const list = tabs(data);
    const credit = cleanList(data.credit);
    const hasLogo = str(data.logo).trim() !== '';
    return html`<${Frame} data=${data} single=${true}>
      <${Panel} title="Both pages">
        <div class="kk-nav">
          <${NavLogo} src=${imageUrl(getAsset, data.logo)} alt=${str(data.logoAlt)} monogram=${str(data.monogram)} />
          <span class="kk-hero__name" data-key-path="name">${str(data.name)}</span>
        </div>
        <p class="kk-where">The project tabs, in the order visitors see them:</p>
        <ul class="kk-tabs" data-key-path="categories">
          ${list.map((tab, index) => html`<li key=${index}>${tab.label || '(no name)'}</li>`)}
        </ul>
        <dl class="kk-facts">
          <${Fact} label="Logo in the top-left corner">
            ${hasLogo
              ? `The picture ${str(data.logo).trim()}${
                  str(data.logoAlt).trim() !== '' ? `, described as “${str(data.logoAlt).trim()}”` : ', with no description'
                }.`
              : `No logo image — the letters “${str(data.monogram)}” are shown.`}
          <//>
          ${list
            .filter((tab) => tab.id !== ALL_TAB_ID)
            .map((tab, index) => {
              const withVideo = hoverText({ category: tab.id, videoUrl: 'x' }, data).text;
              const withoutVideo = hoverText({ category: tab.id, videoUrl: '' }, data).text;
              return html`<${Fact} key=${index} label=${`${tab.label || tab.id} — address ends in /${tab.id}`}>
                Hover text: “${withVideo}” with a video, “${withoutVideo}” without.
              <//>`;
            })}
        </dl>
        <div class="kk-credit" data-key-path="credit">
          ${credit.length > 0 ? credit.map((line, index) => html`<p key=${index}>${line}</p>`) : html`<p>No credit lines.</p>`}
        </div>
      <//>
    <//>`;
  };

  // ---------------------------------------------------------------------------------------
  // Registration — the name is the collection name, or the file name for Pages / Site settings.
  // ---------------------------------------------------------------------------------------

  CMS.registerPreviewStyle(new URL('preview.css', import.meta.url).href);
  CMS.registerPreviewTemplate('projects', ProjectPreview);
  CMS.registerPreviewTemplate('experience', ExperiencePreview);
  CMS.registerPreviewTemplate('skills', SkillsPreview);
  CMS.registerPreviewTemplate('links', LinkPreview);
  CMS.registerPreviewTemplate('certificates', CertificatePreview);
  CMS.registerPreviewTemplate('education', EducationPreview);
  for (const page of PAGES) CMS.registerPreviewTemplate(page.id, makePagePreview(page));
  CMS.registerPreviewTemplate('site', SitePreview);
}
