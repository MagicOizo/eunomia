import type { TrashPart } from '@eunomia/shared';
import { describe, expect, it } from 'vitest';

import { withLocale } from '../test/locale';
import {
  attachedRecord,
  contextText,
  namedEntry,
  notRestorableReason,
  partText,
} from './trash-text';

/**
 * The pieces the API describes a deleted record with (Slice 79), put into
 * words. Every kind of part once per language, so a new part without a
 * sentence shows up here as well as in the type check.
 */

const PARTS: Array<[TrashPart, string, string]> = [
  [{ type: 'text', value: 'R-17' }, 'R-17', 'R-17'],
  [{ type: 'date', value: '2026-03-04' }, '04.03.2026', '04/03/2026'],
  [{ type: 'money', value: 50 }, '50,00 €', '€50.00'],
  [{ type: 'born', date: '1985-04-12' }, 'geboren 12.04.1985', 'born 12/04/1985'],
  [{ type: 'policy', number: 'PKV-1' }, 'Police PKV-1', 'Policy PKV-1'],
  [{ type: 'validFrom', date: '2021-01-01' }, 'ab 01.01.2021', 'from 01/01/2021'],
  [{ type: 'validFromYear', year: 3 }, 'ab Jahr 3', 'from year 3'],
  [{ type: 'dated', date: '2024-10-01' }, 'vom 01.10.2024', 'dated 01/10/2024'],
  [
    { type: 'premium', amount: 120, bonusRelevant: false },
    '120,00 € im Monat',
    '€120.00 per month',
  ],
  [
    { type: 'premium', amount: 80, bonusRelevant: true },
    '80,00 € bonusrelevant im Monat',
    '€80.00 bonus-relevant per month',
  ],
  [{ type: 'distance', km: 12 }, '12 km', '12 km'],
  [{ type: 'invoice', number: 'R-1' }, 'Rechnung R-1', 'Invoice R-1'],
  [{ type: 'billing', number: 'A-3' }, 'Abrechnung A-3', 'Billing A-3'],
];

describe('partText', () => {
  it.each(PARTS)('writes %o in German', (part, de) => {
    expect(partText(part)).toBe(de);
  });

  it.each(PARTS)('writes %o in English', async (part, _de, en) => {
    await withLocale('en', () => {
      expect(partText(part)).toBe(en);
    });
  });
});

describe('the sentences around the parts', () => {
  it('joins a context line and leaves out empty parts', () => {
    expect(
      contextText([
        { type: 'text', value: '' },
        { type: 'policy', number: 'PKV-1' },
        { type: 'dated', date: '2024-07-01' },
      ]),
    ).toBe('Police PKV-1, vom 01.07.2024');
  });

  it('names a record inside a sentence, in lower case in English', async () => {
    expect(namedEntry('serviceBilling', { type: 'text', value: 'LA-1' })).toBe(
      'Leistungsabrechnung „LA-1“',
    );
    await withLocale('en', () => {
      expect(namedEntry('serviceBilling', { type: 'text', value: 'LA-1' })).toBe(
        'service billing “LA-1”',
      );
      expect(attachedRecord('allocation', { type: 'money', value: 50 })).toBe(
        'Reimbursement €50.00',
      );
    });
  });

  it('gives the reason a submission cannot come back', () => {
    expect(notRestorableReason('submission')).toBe(
      'Eine Einreichung ohne Rechnungen kann nicht wiederhergestellt werden.',
    );
  });
});
