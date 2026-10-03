import assert from 'node:assert/strict';
import test from 'node:test';

import {
  type BonusClaim,
  type BonusTimelineInput,
  type BonusYear,
  computeBonusTimeline,
  termsInForce,
} from './bonus-timeline.js';

// Scale from the author's example (PKV x): 1 year → 300 €, 2 → 450 €, 4 → 600 €.
const scale = [
  { claimFreeYears: 1, bonusAmount: 300 },
  { claimFreeYears: 2, bonusAmount: 450 },
  { claimFreeYears: 4, bonusAmount: 600 },
];

const base: BonusTimelineInput = {
  rule: 'ON_REIMBURSEMENT',
  claimFreeYearsAtStart: 0,
  countingFromYear: 2021,
  lastYear: 2025,
  currentYear: 2025,
  claims: [],
  yearRecords: [],
  terms: [{ validFromYear: 2021, bonusTiers: scale }],
};

const run = (overrides: Partial<BonusTimelineInput>): BonusYear[] =>
  computeBonusTimeline({ ...base, ...overrides });
const streaks = (years: BonusYear[]): number[] => years.map((y) => y.claimFreeStreak);
const byYear = (years: BonusYear[], year: number): BonusYear => {
  const found = years.find((y) => y.year === year);
  assert.ok(found, `year ${year} missing`);
  return found;
};

const paid = (year: number, reimbursement: number, forfeitsBonus: boolean | null = null) =>
  ({ year, reimbursement, forfeitsBonus }) satisfies BonusClaim;
const pending = (year: number): BonusClaim => ({ year, reimbursement: null, forfeitsBonus: null });

test('claim-free years count up from 0 and climb the scale, plateauing at the top tier', () => {
  const years = run({});
  assert.deepEqual(
    years.map((y) => y.year),
    [2021, 2022, 2023, 2024, 2025],
  );
  assert.deepEqual(streaks(years), [1, 2, 3, 4, 5]);
  assert.deepEqual(
    years.map((y) => y.expectedBonus),
    [300, 450, 450, 600, 600],
  );
  assert.ok(years.every((y) => !y.forfeited && y.forfeitSource === null));
});

test('the start value carries claim-free years from before the counting year', () => {
  const years = run({ claimFreeYearsAtStart: 3, countingFromYear: 2024 });
  assert.deepEqual(streaks(years), [4, 5]);
  assert.equal(byYear(years, 2024).expectedBonus, 600);
});

test('a reimbursement breaks the streak, which then restarts at 1', () => {
  const years = run({ claimFreeYearsAtStart: 2, claims: [paid(2022, 120)] });
  assert.deepEqual(streaks(years), [3, 0, 1, 2, 3]);
  const broken = byYear(years, 2022);
  assert.equal(broken.forfeited, true);
  assert.equal(broken.forfeitSource, 'claims');
  assert.equal(broken.expectedBonus, 0);
  assert.equal(byYear(years, 2023).expectedBonus, 300);
});

test('ON_REIMBURSEMENT: a 0 € answer keeps the bonus, a pending claim only puts it at risk', () => {
  const years = run({ claims: [paid(2022, 0), pending(2023), pending(2023)] });
  assert.deepEqual(streaks(years), [1, 2, 3, 4, 5]);
  assert.equal(byYear(years, 2022).forfeited, false);
  assert.equal(byYear(years, 2023).pendingClaims, 2);
});

test('ON_SUBMISSION: submitting alone forfeits, even without or with a 0 € reimbursement', () => {
  const years = run({ rule: 'ON_SUBMISSION', claims: [pending(2022), paid(2024, 0)] });
  assert.deepEqual(streaks(years), [1, 0, 1, 0, 1]);
  assert.equal(byYear(years, 2022).pendingClaims, 0);
});

test('a billing can override the rule in both directions', () => {
  const kept = run({ rule: 'ON_SUBMISSION', claims: [paid(2022, 80, false)] });
  assert.equal(byYear(kept, 2022).forfeited, false);

  const lost = run({ rule: 'ON_REIMBURSEMENT', claims: [paid(2022, 0, true)] });
  assert.equal(byYear(lost, 2022).forfeited, true);
});

test('one forfeiting billing is enough, even next to one that keeps the bonus', () => {
  const years = run({ claims: [paid(2022, 50, false), paid(2022, 30)] });
  assert.equal(byYear(years, 2022).forfeited, true);
});

test('the year override beats the claims in both directions', () => {
  const years = run({
    claims: [paid(2022, 120)],
    yearRecords: [
      { year: 2022, actualBonus: null, bonusForfeited: false, note: 'Kulanz' },
      { year: 2023, actualBonus: null, bonusForfeited: true, note: null },
    ],
  });
  const kept = byYear(years, 2022);
  assert.equal(kept.forfeited, false);
  assert.equal(kept.bonusForfeitedOverride, false);
  assert.equal(kept.note, 'Kulanz');
  const lost = byYear(years, 2023);
  assert.equal(lost.forfeited, true);
  assert.equal(lost.forfeitSource, 'override');
  assert.deepEqual(streaks(years), [1, 2, 0, 1, 2]);
});

test('the actual bonus is reported next to the forecast', () => {
  const years = run({
    yearRecords: [{ year: 2022, actualBonus: 440.5, bonusForfeited: null, note: null }],
  });
  const year = byYear(years, 2022);
  assert.equal(year.actualBonus, 440.5);
  assert.equal(year.expectedBonus, 450);
  assert.equal(year.bonusForfeitedOverride, null);
});

test('scale per year: later terms apply from their year, older ones are inherited', () => {
  const years = run({
    terms: [
      { validFromYear: 2021, bonusTiers: scale },
      { validFromYear: 2023, bonusTiers: [{ claimFreeYears: 1, bonusAmount: 500 }] },
    ],
  });
  assert.deepEqual(
    years.map((y) => [y.expectedBonus, y.termsFromYear, y.tiersInherited]),
    [
      [300, 2021, false],
      [450, 2021, true],
      [500, 2023, false],
      [500, 2023, true],
      [500, 2023, true],
    ],
  );
});

test('no terms yet: no expected bonus; terms without scale: no bonus at all', () => {
  const years = run({ terms: [{ validFromYear: 2023, bonusTiers: [] }] });
  const before = byYear(years, 2022);
  assert.equal(before.expectedBonus, null);
  assert.equal(before.termsFromYear, null);
  assert.equal(before.tiersInherited, false);
  const without = byYear(years, 2023);
  assert.equal(without.expectedBonus, 0);
  assert.equal(without.hasBonusScale, false);
});

test('a streak below the lowest tier earns nothing', () => {
  const years = run({
    terms: [{ validFromYear: 2021, bonusTiers: [{ claimFreeYears: 4, bonusAmount: 600 }] }],
  });
  assert.deepEqual(
    years.map((y) => y.expectedBonus),
    [0, 0, 0, 600, 600],
  );
});

test('only the running year is in progress; claims outside the range are ignored', () => {
  const years = run({
    lastYear: 2023,
    currentYear: 2025,
    claims: [paid(2019, 99), paid(2024, 99)],
  });
  assert.deepEqual(streaks(years), [1, 2, 3]);
  assert.ok(years.every((y) => !y.inProgress));
  assert.equal(byYear(run({}), 2025).inProgress, true);
});

test('a counting year after the last year yields no years', () => {
  assert.deepEqual(run({ countingFromYear: 2026 }), []);
});

/*
 * `termsInForce` answers for the reimbursement plan too since CR-16, which took
 * the question away from the database ("the latest entry at or before the
 * year"), so it is worth its own cases rather than only the ones the timeline
 * happens to walk through.
 */
test('the terms in force are the latest ones that had started', () => {
  const terms = [
    { validFromYear: 2021, deductible: 300 },
    { validFromYear: 2024, deductible: 500 },
    { validFromYear: 2023, deductible: 400 },
  ];
  assert.equal(termsInForce(terms, 2020), null, 'nothing was in force yet');
  assert.equal(termsInForce(terms, 2021)?.deductible, 300);
  assert.equal(termsInForce(terms, 2022)?.deductible, 300, 'the earlier terms carry on');
  assert.equal(termsInForce(terms, 2023)?.deductible, 400, 'order of the rows does not matter');
  assert.equal(termsInForce(terms, 2026)?.deductible, 500, 'the latest ones stay in force');
});

test('a policy without any terms has none in force', () => {
  assert.equal(termsInForce([], 2025), null);
});
