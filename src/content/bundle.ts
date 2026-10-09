/**
 * The shape of everything under /content once it has been read and validated.
 * Types only — safe to import from the browser bundle, the prerender bundle and Node scripts.
 */
import type {
  Certificate,
  Education,
  Experience,
  Project,
  SiteSettings,
  SkillGroup,
  SocialLink,
  TrackProfile,
} from './types';

export interface ContentBundle {
  /**
   * The month the content was built, "YYYY-MM". Added by the content plugin at build time
   * (never read from the clock in the browser) so the prerendered HTML and hydration agree.
   * Absent in hand-built bundles: the "years" hero number is then left out.
   */
  buildMonth?: string;
  /** content/site.json */
  site: SiteSettings;
  /** content/tracks/*.json, game first. */
  tracks: TrackProfile[];
  /** content/projects/*.json */
  projects: Project[];
  /** content/experience/*.json */
  experience: Experience[];
  /** content/skills/*.json */
  skills: SkillGroup[];
  /** content/links/*.json */
  links: SocialLink[];
  /** content/education/*.json */
  education: Education[];
  /** content/certificates/*.json */
  certificates: Certificate[];
}
