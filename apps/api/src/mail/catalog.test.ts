import assert from 'node:assert/strict';
import test from 'node:test';

import { mailCatalog, mailLocale } from './catalog.js';

const NONE = { locale: null, formatRegion: null };

test('the profile decides first, then the instance, then German', () => {
  const instance = { defaultLocale: 'en', defaultFormat: null };
  assert.deepEqual(mailLocale({ locale: 'de', formatRegion: null }, instance), {
    locale: 'de',
    region: 'de-DE',
  });
  assert.deepEqual(mailLocale(NONE, instance), { locale: 'en', region: 'en-GB' });
  assert.deepEqual(mailLocale(NONE, { defaultLocale: 'xx', defaultFormat: null }), {
    locale: 'de',
    region: 'de-DE',
  });
});

test('the format is chosen apart from the language', () => {
  assert.deepEqual(
    mailLocale(
      { locale: 'en', formatRegion: 'de-DE' },
      { defaultLocale: 'de', defaultFormat: null },
    ),
    { locale: 'en', region: 'de-DE' },
  );
  assert.deepEqual(mailLocale(NONE, { defaultLocale: 'en', defaultFormat: 'en-US' }), {
    locale: 'en',
    region: 'en-US',
  });
  // A value the list no longer knows is skipped like an empty one.
  assert.deepEqual(
    mailLocale(
      { locale: 'fr', formatRegion: 'fr-FR' },
      { defaultLocale: 'de', defaultFormat: null },
    ),
    { locale: 'de', region: 'de-DE' },
  );
});

test('the test mail exists in every language', () => {
  assert.equal(mailCatalog('de').testMail.subject, 'Eunomia: Testnachricht');
  assert.equal(mailCatalog('en').testMail.subject, 'Eunomia: test message');
});
