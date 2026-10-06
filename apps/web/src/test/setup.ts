import { config } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach } from 'vitest';

import { i18n } from '../lib/i18n';

/**
 * Every mounted component gets the app's i18n, in German — the language the
 * assertions are written in. A case about another language switches with
 * `withLocale` from ./locale, which puts German back afterwards.
 */
config.global.plugins.push(i18n);

/**
 * Every test starts signed in as a global admin, on a pinia of its own. That is
 * the instance as it is run today, and it is a decision, not an accident: since
 * CR-26 the components ask the auth store what they may offer, and a test that
 * says nothing about permissions is asking about everything else. A case about
 * a restricted user calls `grant()` from ./permissions.
 *
 * A test file that brings its own pinia (because it mounts with `plugins`)
 * replaces this one and then owns the grants itself.
 *
 * The helper is imported here and not at the top of the file: a setup file is
 * loaded before the test file registers its `vi.mock()` calls, so importing the
 * store module up here would pin it — and every module it imports — to the
 * unmocked version (seen: the refresh tests of stores/auth.spec.ts then ran
 * against the real `lib/http`).
 */
beforeEach(async () => {
  setActivePinia(createPinia());
  const { grantEverything } = await import('./permissions');
  grantEverything();
});

/**
 * jsdom renders <dialog> but implements none of its modal methods, so any
 * component calling showModal() would throw in a test. Modelled here down to
 * what the components rely on: the open state and the close event.
 */
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.show = function show(): void {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(returnValue?: string): void {
    this.open = false;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}

/**
 * jsdom has no layout, so it implements no scrolling either — scrollIntoView()
 * is simply absent. Components that bring a row or a field into view would
 * throw in a test; here it is a no-op, and what such a component *marks* is
 * asserted instead of where it scrolled.
 */
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
}
