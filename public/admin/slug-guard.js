/*
 * SLUG GUARD — keeps the "Short name" stored inside an item equal to the name of its file.
 *
 * Every item of Projects, Experience, Skill groups, Links, Education and Certificates is one
 * file, content/<collection>/<slug>.json, and the content check (npm run validate:content)
 * requires the "slug" field inside the file to equal that file name. The dashboard takes the
 * file name from the "Short name" field when an item is created, so the two start out equal.
 * They could still drift apart in two ways, and both would stop the next deploy:
 *
 *   1. the owner edits "Short name" on an item that already exists (the dashboard does not
 *      rename the file);
 *   2. a new item is given a short name that is already taken (the dashboard saves it under
 *      "<name>-1").
 *
 * This hook runs just before every save and writes the real file name into "slug", so
 * neither can happen. It never changes anything else, and it does nothing for Site settings
 * and Pages, which have no "slug" field.
 *
 * Sveltia CMS "preSave" event: https://sveltiacms.app/en/docs/api/events
 * The entry is an Immutable Map; `slug` and `path` already hold the final file name, for
 * new items too (checked in tests/admin/dashboard.spec.ts). Returning the changed `data`
 * map is the documented way to modify what is saved.
 *
 * If this file fails to load, saving still works; the content check then remains the only
 * safety net for the two cases above.
 */
(function () {
  'use strict';

  var cms = window.CMS;
  if (!cms || typeof cms.registerEventListener !== 'function') return;

  cms.registerEventListener({
    name: 'preSave',
    handler: function (event) {
      try {
        var entry = event && event.entry;
        if (!entry || typeof entry.get !== 'function') return undefined;

        var data = entry.get('data');
        var fileSlug = entry.get('slug');
        var path = entry.get('path');
        if (!data || typeof data.has !== 'function' || !data.has('slug')) return undefined;
        if (typeof fileSlug !== 'string' || fileSlug === '') return undefined;
        // Only when the entry really is the file "<slug>.json".
        if (typeof path !== 'string' || path.slice(-('/' + fileSlug + '.json').length) !== '/' + fileSlug + '.json') {
          return undefined;
        }
        if (data.get('slug') === fileSlug) return undefined;

        return data.set('slug', fileSlug);
      } catch (error) {
        // Never block a save because of the guard; the content check still protects the site.
        if (window.console && typeof window.console.error === 'function') {
          window.console.error('Slug guard failed; the item is saved as entered.', error);
        }
        return undefined;
      }
    },
  });
})();
