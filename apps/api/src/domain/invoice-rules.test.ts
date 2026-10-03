import assert from 'node:assert/strict';
import test from 'node:test';

import { ERROR_CODES } from '@eunomia/shared';

import { ApiError } from '../lib/api-error.js';
import {
  assertOneYear,
  nextNotCovered,
  nextPaymentDates,
  nextPaymentDetail,
  nextTreatmentDays,
} from './invoice-rules.js';

/** Asserts that `run` throws the ApiError carrying `code`, and returns it. */
function throwsCode(run: () => unknown, code: string): ApiError {
  let thrown: unknown;
  assert.throws(run, (error: unknown) => {
    thrown = error;
    return error instanceof ApiError && error.code === code;
  });
  return thrown as ApiError;
}

// --- nextTreatmentDays -------------------------------------------------------

test('treatmentDates given: it is the list, whatever stood there before', () => {
  assert.deepEqual(nextTreatmentDays({ treatmentDates: ['2024-03-02', '2024-03-01'] }, []), [
    '2024-03-01',
    '2024-03-02',
  ]);
});

test('a treatmentDate sent alongside the list joins it', () => {
  assert.deepEqual(
    nextTreatmentDays({ treatmentDate: '2024-03-05', treatmentDates: ['2024-03-01'] }, [
      '2024-01-09',
    ]),
    ['2024-03-01', '2024-03-05'],
  );
});

test('the list is a set: duplicates fall away and the days come back sorted', () => {
  assert.deepEqual(
    nextTreatmentDays({ treatmentDates: ['2024-03-05', '2024-03-01', '2024-03-05'] }, []),
    ['2024-03-01', '2024-03-05'],
  );
});

test('only treatmentDate: the leading day moves, the others stay', () => {
  assert.deepEqual(
    nextTreatmentDays({ treatmentDate: '2024-03-04' }, ['2024-03-01', '2024-03-02', '2024-03-03']),
    ['2024-03-02', '2024-03-03', '2024-03-04'],
  );
});

test('only treatmentDate on a one-day invoice: that day is replaced', () => {
  assert.deepEqual(nextTreatmentDays({ treatmentDate: '2024-03-04' }, ['2024-03-01']), [
    '2024-03-04',
  ]);
});

test('the moved leading day sorts into place, it is not appended', () => {
  assert.deepEqual(
    nextTreatmentDays({ treatmentDate: '2024-02-01' }, ['2024-03-01', '2024-03-02']),
    ['2024-02-01', '2024-03-02'],
  );
});

test('on create there is nothing to keep, so the one day is the list', () => {
  assert.deepEqual(nextTreatmentDays({ treatmentDate: '2024-03-01' }, []), ['2024-03-01']);
});

test('an update that mentions neither field leaves the days alone', () => {
  assert.equal(nextTreatmentDays({}, ['2024-03-01', '2024-03-02']), null);
});

// --- assertOneYear -----------------------------------------------------------

test('days within one calendar year pass', () => {
  assert.doesNotThrow(() => assertOneYear(['2024-01-01', '2024-12-31']));
});

test('a single day passes', () => {
  assert.doesNotThrow(() => assertOneYear(['2024-06-15']));
});

test('days across the turn of the year are rejected, with both years in the details', () => {
  const error = throwsCode(
    () => assertOneYear(['2024-12-30', '2025-01-02']),
    ERROR_CODES.TREATMENT_DAYS_DIFFERENT_YEARS,
  );
  assert.equal(error.httpStatus, 400);
  assert.deepEqual(error.details, { years: ['2024', '2025'] });
});

// --- nextNotCovered ----------------------------------------------------------

const unmarked = { notCovered: 0, notCoveredReason: null };
const marked = { notCovered: 1, notCoveredReason: 'Eigenleistung' };

test('a write that mentions neither field leaves the mark alone', () => {
  assert.equal(nextNotCovered({}, marked), null);
});

test('setting the mark without a reason is refused', () => {
  throwsCode(
    () => nextNotCovered({ notCovered: 1 }, unmarked),
    ERROR_CODES.INVOICE_NOT_COVERED_REASON_REQUIRED,
  );
});

test('an empty reason is no reason', () => {
  throwsCode(
    () => nextNotCovered({ notCovered: 1, notCoveredReason: '' }, unmarked),
    ERROR_CODES.INVOICE_NOT_COVERED_REASON_REQUIRED,
  );
});

test('clearing the reason of a standing mark is refused', () => {
  throwsCode(
    () => nextNotCovered({ notCoveredReason: null }, marked),
    ERROR_CODES.INVOICE_NOT_COVERED_REASON_REQUIRED,
  );
});

test('setting the mark with a reason: both stand', () => {
  assert.deepEqual(nextNotCovered({ notCovered: 1, notCoveredReason: 'Eigenleistung' }, unmarked), {
    notCovered: 1,
    notCoveredReason: 'Eigenleistung',
  });
});

test('a new reason alone, while the mark already stands, replaces the old one', () => {
  assert.deepEqual(nextNotCovered({ notCoveredReason: 'Kosmetik' }, marked), {
    notCovered: 1,
    notCoveredReason: 'Kosmetik',
  });
});

test('clearing the mark takes the reason with it', () => {
  assert.deepEqual(nextNotCovered({ notCovered: 0 }, marked), unmarked);
});

test('a reason sent in the same write that clears the mark is dropped too', () => {
  assert.deepEqual(
    nextNotCovered({ notCovered: 0, notCoveredReason: 'Kosmetik' }, marked),
    unmarked,
  );
});

// --- nextPaymentDates --------------------------------------------------------

test('direct payment on create: both dates are the invoice date', () => {
  assert.deepEqual(
    nextPaymentDates(
      { directPayment: 1, invoiceDate: '2024-03-01' },
      { directPayment: 0, invoiceDate: '2024-03-01' },
    ),
    { transferUntilDate: '2024-03-01', transferDate: '2024-03-01' },
  );
});

test('a corrected invoice date takes both dates with it while the flag stands', () => {
  assert.deepEqual(
    nextPaymentDates(
      { invoiceDate: '2024-03-07' },
      { directPayment: 1, invoiceDate: '2024-03-01' },
    ),
    { transferUntilDate: '2024-03-07', transferDate: '2024-03-07' },
  );
});

test('the flag standing untouched still pins both dates to the invoice date', () => {
  assert.deepEqual(nextPaymentDates({}, { directPayment: 1, invoiceDate: '2024-03-01' }), {
    transferUntilDate: '2024-03-01',
    transferDate: '2024-03-01',
  });
});

test('dropping the flag clears both dates', () => {
  assert.deepEqual(
    nextPaymentDates({ directPayment: 0 }, { directPayment: 1, invoiceDate: '2024-03-01' }),
    { transferUntilDate: null, transferDate: null },
  );
});

test('a date sent in the same write that drops the flag wins over the clearing', () => {
  assert.deepEqual(
    nextPaymentDates(
      { directPayment: 0, transferUntilDate: '2024-04-01' },
      { directPayment: 1, invoiceDate: '2024-03-01' },
    ),
    { transferUntilDate: '2024-04-01', transferDate: null },
  );
});

test('on an invoice that was never a direct payment the dates stay the user’s own', () => {
  assert.equal(
    nextPaymentDates({ directPayment: 0 }, { directPayment: 0, invoiceDate: '2024-03-01' }),
    null,
  );
});

test('a write that says nothing about the flag on an ordinary invoice leaves the dates alone', () => {
  assert.equal(
    nextPaymentDates(
      { transferDate: '2024-04-01' },
      { directPayment: 0, invoiceDate: '2024-03-01' },
    ),
    null,
  );
});

// --- nextPaymentDetail -------------------------------------------------------

const atAgency = { agencyUID: 'g-aaaaaaaa', directPayment: 0 };

test('no agency after the write: there is nothing to transfer to', () => {
  assert.deepEqual(nextPaymentDetail({}, { agencyUID: null, directPayment: 0 }), {
    agencyAccountUID: null,
  });
});

test('the write removes the agency: the payment details go with it', () => {
  assert.deepEqual(nextPaymentDetail({ agencyUID: null }, atAgency), { agencyAccountUID: null });
});

test('a direct payment has no payment details, agency or not', () => {
  assert.deepEqual(nextPaymentDetail({ directPayment: 1 }, atAgency), { agencyAccountUID: null });
});

test('moving to another agency without naming details clears the old ones', () => {
  assert.deepEqual(nextPaymentDetail({ agencyUID: 'g-bbbbbbbb' }, atAgency), {
    agencyAccountUID: null,
  });
});

test('the same agency and nothing named: the details are left alone', () => {
  assert.equal(nextPaymentDetail({ agencyUID: 'g-aaaaaaaa' }, atAgency), null);
});

test('a write that does not mention the agency at all leaves the details alone', () => {
  assert.equal(nextPaymentDetail({}, atAgency), null);
});

test('named details stand, also when the agency moves in the same write', () => {
  assert.deepEqual(
    nextPaymentDetail({ agencyUID: 'g-bbbbbbbb', agencyAccountUID: 'k-cccccccc' }, atAgency),
    { agencyAccountUID: 'k-cccccccc' },
  );
});
