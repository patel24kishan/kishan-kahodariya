/**
 * Fixture entry for tests/content/plugin.spec.ts. It imports the real content API, so
 * building or serving it pulls in "virtual:content" from the content plugin exactly the way
 * the app does. The tests point the plugin at a temp content folder.
 */
import {
  getAllRoutes,
  getCertificates,
  getEducation,
  getExperience,
  getHoverText,
  getLinks,
  getProjects,
  getSite,
  getSkillGroups,
  getTabs,
  getTracks,
  resolveTab,
} from '../../../src/content/index';

export interface ContentSnapshot {
  siteName: string;
  tracks: string[];
  tabs: string[];
  routes: string[];
  defaultTabs: string[];
  gameAll: string[];
  softdevAll: string[];
  hoverTexts: string[];
  experience: string[];
  skills: string[];
  heroLinks: string[];
  footerLinks: string[];
  education: string[];
  certificates: string[];
}

export function snapshot(): ContentSnapshot {
  return {
    siteName: getSite().name,
    tracks: getTracks().map((track) => track.id),
    tabs: getTabs().map((tab) => tab.id),
    routes: getAllRoutes(),
    defaultTabs: [resolveTab('game', undefined), resolveTab('softdev', 'not-a-tab')],
    gameAll: getProjects('game', 'all').map((project) => project.title),
    softdevAll: getProjects('softdev', 'all').map((project) => project.title),
    hoverTexts: getProjects('game', 'all').map((project) => getHoverText(project)),
    experience: getExperience('game').map((entry) => entry.company),
    skills: getSkillGroups('game').map((group) => group.title),
    heroLinks: getLinks('game', 'hero').map((link) => link.label),
    footerLinks: getLinks('game', 'footer').map((link) => link.label),
    education: getEducation().map((entry) => entry.school),
    certificates: getCertificates('game').map((certificate) => certificate.title),
  };
}

// In a browser (the dev-server test), show the snapshot on the page.
if (typeof document !== 'undefined') {
  const target = document.getElementById('content-snapshot');
  if (target) target.textContent = JSON.stringify(snapshot());
}
