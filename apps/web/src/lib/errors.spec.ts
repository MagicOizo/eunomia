import { afterEach, describe, expect, it, vi } from 'vitest';

import { describeError } from './errors';
import { FIELD_LABELS } from './field-labels';
import { HttpError } from './http';
import { resourceConfigs } from '../resources/definitions';

/** A validation response as the API sends it (zod issues in `details`). */
function validation(...issues: Array<Record<string, unknown>>): HttpError {
  return new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', issues);
}

afterEach(() => vi.restoreAllMocks());

describe('describeError — validation issues', () => {
  it('names the missing field in German', () => {
    const error = validation({
      code: 'invalid_type',
      expected: 'string',
      received: 'undefined',
      path: ['firstname'],
      message: 'Required',
    });
    expect(describeError(error)).toBe('Bitte „Vorname“ ausfüllen.');
  });

  it('turns an empty required string into the same sentence', () => {
    const error = validation({
      code: 'too_small',
      minimum: 1,
      type: 'string',
      path: ['companyName'],
      message: 'String must contain at least 1 character(s)',
    });
    expect(describeError(error)).toBe('Bitte „Name“ ausfüllen.');
  });

  it('reports a length limit with the German label', () => {
    const error = validation({
      code: 'too_big',
      maximum: 100,
      type: 'string',
      path: ['addressCity'],
      message: 'String must contain at most 100 character(s)',
    });
    expect(describeError(error)).toBe('„Ort“ darf höchstens 100 Zeichen haben.');
  });

  it('explains a URL and adds the format for a regex rule', () => {
    expect(
      describeError(
        validation({
          code: 'invalid_string',
          validation: 'url',
          path: ['url'],
          message: 'Invalid url',
        }),
      ),
    ).toBe('„Website“ muss eine vollständige Internetadresse sein (mit https://).');

    expect(
      describeError(
        validation({
          code: 'invalid_string',
          validation: 'regex',
          path: ['addressPostalCode'],
          message: 'Expected a 5-digit postal code',
        }),
      ),
    ).toBe('Bitte „PLZ“ im richtigen Format angeben (fünfstellig, z. B. 12345).');
  });

  it('explains a refused document link by the format the field expects', () => {
    // The scheme check is a `.refine`, which zod reports as `custom` without a
    // `validation` — the sentence then comes from the field's own format
    // (SEC-01). Without this the user read "nicht zulässig" and nothing more.
    expect(
      describeError(
        validation({
          code: 'custom',
          path: ['documentLink'],
          message: 'Invalid input',
        }),
      ),
    ).toBe(
      'Bitte „Dokument-Link“ im richtigen Format angeben ' +
        '(vollständige Internetadresse mit http:// oder https://).',
    );
  });

  it('keeps the general sentence for a refinement on a field without a format', () => {
    expect(
      describeError(
        validation({
          code: 'custom',
          path: ['entries'],
          message: 'entries must not repeat an invoice',
        }),
      ),
    ).toBe('Die Angabe bei „Erstattungen“ ist nicht zulässig.');
  });

  it('resolves a nested path to its field, and repeats a sentence only once', () => {
    const issue = {
      code: 'too_big',
      maximum: 99999999.99,
      type: 'number',
      path: ['entries', 0, 'reimbursement'],
      message: 'Number must be less than or equal to 99999999.99',
    };
    expect(
      describeError(validation(issue, { ...issue, path: ['entries', 1, 'reimbursement'] })),
    ).toBe('„Erstattung“ darf höchstens 99999999.99 sein.');
  });
});

describe('describeError — error codes', () => {
  it('interpolates the invoices the server named', () => {
    const error = new HttpError(
      409,
      'INVOICES_ALREADY_SUBMITTED',
      'Invoices are already submitted to this contract: R-1, R-2',
      { invoices: ['R-1', 'R-2'] },
    );
    expect(describeError(error)).toBe(
      'Diese Rechnungen liegen bei dieser Police bereits: R-1, R-2.',
    );
  });

  it('names the resource that was not found', () => {
    const error = new HttpError(404, 'NOT_FOUND', 'Invoice not found', { resource: 'Invoice' });
    expect(describeError(error)).toContain('Die Rechnung wurde nicht gefunden');
  });

  it('distinguishes premium and terms in the shared history message', () => {
    const premium = new HttpError(400, 'HISTORY_BEFORE_CONTRACT', 'A premium …', {
      kind: 'premium',
    });
    const terms = new HttpError(400, 'HISTORY_BEFORE_CONTRACT', 'Terms …', { kind: 'terms' });
    expect(describeError(premium)).toBe(
      'Ein Beitragsstand kann nicht vor dem Vertragsbeginn starten.',
    );
    expect(describeError(terms)).toBe('Konditionen können nicht vor dem Vertragsbeginn starten.');
  });

  it('lets a dialog override a 409 with its own wording', () => {
    const error = new HttpError(409, 'REIMBURSEMENT_EXCEEDS_INVOICE', 'The reimbursements …', {
      invoices: ['R-1'],
    });
    expect(describeError(error, 'Noch offen: 20,00 €.')).toBe('Noch offen: 20,00 €.');
  });

  it('falls back to German — never the server text — for an unknown code', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new HttpError(400, 'SOMETHING_NEW', 'Some English sentence');

    expect(describeError(error)).toBe('Die Aktion ist fehlgeschlagen.');
    expect(logged).toHaveBeenCalled();
  });

  it('reports a non-HTTP error generically', () => {
    expect(describeError(new Error('boom'))).toBe('Unerwarteter Fehler.');
  });
});

describe('field labels', () => {
  it('covers every field of the master-data resources', () => {
    const missing = Object.values(resourceConfigs)
      .flatMap((config) => config.fields.map((field) => field.key))
      .filter((key) => !(key in FIELD_LABELS));
    expect(missing).toEqual([]);
  });
});
