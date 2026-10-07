/**
 * The admin page on the Vite dev server. The same tests run against the production build in
 * tests/build/admin.spec.ts.
 */
import { defineServedPageTests } from './support/served-page';

defineServedPageTests('dev server');
