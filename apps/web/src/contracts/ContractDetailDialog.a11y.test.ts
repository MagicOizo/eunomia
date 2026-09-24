import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { BonusYearDto, ContractDetailDto, PremiumDto, TermsDto } from './api';
import ContractDetailDialog from './ContractDetailDialog.vue';

const premium = (validFrom: string, monthlyPremium: number, note: string | null): PremiumDto => ({
  premiumUID: `p-${validFrom}`,
  validFrom,
  validTo: null,
  monthlyPremium,
  note,
});

const terms = (validFromYear: number): TermsDto => ({
  termsUID: `t-${validFromYear}`,
  validFromYear,
  validToYear: null,
  deductible: 300,
  reimbursementCap: null,
  reimbursementRate: 100,
  bonusTiers: [],
});

const year = (y: number, note: string | null = null): BonusYearDto => ({
  year: y,
  forfeited: false,
  forfeitSource: null,
  pendingClaims: 0,
  claimFreeStreak: 1,
  expectedBonus: 0,
  hasBonusScale: false,
  termsFromYear: 2020,
  tiersInherited: false,
  actualBonus: null,
  bonusForfeitedOverride: null,
  note,
  inProgress: false,
});

/** Histories arrive from the API oldest first (ORDER BY validFrom). */
const contract: ContractDetailDto = {
  contractUID: 'c-1',
  contractNumber: 'PKV-2020-0001',
  companyUID: 'co-1',
  accountUID: 'a-1',
  contractKind: 'FULL',
  contractBegin: '2020-01-01',
  contractEnd: null,
  bonusForfeitRule: 'ON_REIMBURSEMENT',
  claimFreeYearsAtStart: 2,
  claimFreeCountingFromYear: 2020,
  premiums: [
    premium('2020-01-01', 380, null),
    premium('2024-01-01', 405, 'Beitragsanpassung 2024'),
    premium('2024-07-01', 420, 'Unterjährige Anpassung Zahntarif'),
  ],
  terms: [terms(2020), terms(2026)],
  years: [year(2020), year(2021, 'Bonus kam erst im Februar')],
};

const { getContract } = vi.hoisted(() => ({ getContract: vi.fn() }));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  getContract,
}));

beforeEach(() => {
  getContract.mockReset();
  getContract.mockImplementation(async () => structuredClone(contract));
});

async function openDialog() {
  const wrapper = mount(ContractDetailDialog, {
    props: {
      open: true,
      uid: 'c-1',
      options: {
        accounts: [{ value: 'a-1', label: 'Anna Muster' }],
        companies: [{ value: 'co-1', label: 'Beispiel Krankenversicherung AG' }],
      },
    },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

/** The rows of the history table under the given heading, header row excluded. */
function rowsUnder(wrapper: ReturnType<typeof mount>, heading: string): string[] {
  const section = wrapper
    .findAll('section')
    .find((s) => s.find('h3').text() === heading) as unknown as {
    findAll: (s: string) => { text: () => string }[];
  };
  return section.findAll('tbody tr').map((r) => r.text());
}

function toggleIn(wrapper: ReturnType<typeof mount>, heading: string) {
  const section = wrapper.findAll('section').find((s) => s.find('h3').text() === heading)!;
  return section.find('.eu-contract__more button');
}

describe('ContractDetailDialog', () => {
  it('shows only the entry in force, newest first, and folds the rest away', async () => {
    const wrapper = await openDialog();

    const premiums = rowsUnder(wrapper, 'Beitragsverlauf');
    // One data row plus the disclosure row.
    expect(premiums).toHaveLength(2);
    expect(premiums[0]).toContain('01.07.2024');
    expect(toggleIn(wrapper, 'Beitragsverlauf').text()).toBe('2 ältere Einträge anzeigen');

    await toggleIn(wrapper, 'Beitragsverlauf').trigger('click');
    const expanded = rowsUnder(wrapper, 'Beitragsverlauf');
    expect(expanded).toHaveLength(4);
    // Newest first: the oldest entry is the last data row.
    expect(expanded[2]).toContain('01.01.2020');
    expect(toggleIn(wrapper, 'Beitragsverlauf').text()).toBe('Ältere Einträge ausblenden');

    wrapper.unmount();
  });

  it('inflects the count and leaves a single-entry block without a disclosure', async () => {
    getContract.mockResolvedValueOnce({
      ...structuredClone(contract),
      premiums: [premium('2020-01-01', 380, null)],
    });
    const wrapper = await openDialog();

    expect(rowsUnder(wrapper, 'Beitragsverlauf')).toHaveLength(1);
    expect(toggleIn(wrapper, 'Beitragsverlauf').exists()).toBe(false);
    expect(toggleIn(wrapper, 'Konditionen je Jahr').text()).toBe('1 älteren Eintrag anzeigen');

    wrapper.unmount();
  });

  it('puts a note behind a bubble that carries the text as its accessible name', async () => {
    const wrapper = await openDialog();

    // The note is no longer a column of its own …
    expect(wrapper.findAll('th').map((th) => th.text())).not.toContain('Notiz');
    // … but the text is still in the accessible tree, next to its period.
    expect(rowsUnder(wrapper, 'Beitragsverlauf')[0]).toContain('Unterjährige Anpassung Zahntarif');

    // The year note is shown at all now — it used to be stored and never rendered.
    await toggleIn(wrapper, 'Jahresverlauf').trigger('click');
    expect(rowsUnder(wrapper, 'Jahresverlauf').join(' ')).toContain('Bonus kam erst im Februar');

    wrapper.unmount();
  });

  it('has no automatically detectable accessibility violations', async () => {
    const wrapper = await openDialog();

    const results = await axe.run(wrapper.element as HTMLElement);
    expect(results.violations).toEqual([]);

    wrapper.unmount();
  });
});
