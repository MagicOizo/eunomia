import { PERMISSIONS } from '@eunomia/shared';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HttpError } from '../lib/http';
import { withLocale } from '../test/locale';
import { grant } from '../test/permissions';
import type { DashboardDto } from './api';
import { dashboardFixture } from './dashboard-fixture';

const { loadDashboard } = vi.hoisted(() => ({ loadDashboard: vi.fn() }));

vi.mock('./api', () => ({
  loadDashboard: (): Promise<DashboardDto> => loadDashboard(),
}));

const { default: DashboardView } = await import('./DashboardView.vue');

const RouterLink = { props: ['to'], template: '<a :href="to"><slot /></a>' };

async function render(): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(DashboardView, { global: { stubs: { RouterLink } } });
  await flushPromises();
  return wrapper;
}

/** Rendered text with the non-breaking space of the money format made plain. */
function plain(node: { text(): string } | undefined): string {
  return (node?.text() ?? '').replace(/\s+/g, ' ');
}

function tileLabels(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.eu-dashboard__tile dt').map((dt) => dt.text());
}

describe('DashboardView', () => {
  beforeEach(() => {
    loadDashboard.mockReset();
    loadDashboard.mockResolvedValue(dashboardFixture());
  });

  it('shows the figures instead of the shortcut cards to the areas', async () => {
    const wrapper = await render();

    expect(tileLabels(wrapper)).toEqual([
      'Rechnungen',
      'Rechnungsbetrag',
      'Erstattet',
      'Eigenanteil',
      'Bonus erhalten',
      'Versicherte',
      'Laufende Policen',
    ]);
    expect(wrapper.text()).toContain('seit 01.02.2024');
    expect(wrapper.text()).not.toContain('Wähle einen Bereich');
    expect(wrapper.find('.eu-dashboard__tile').text()).toContain('5');
  });

  it('draws one column group per treatment year and lists the same figures in a table', async () => {
    const wrapper = await render();

    expect(wrapper.findAll('.eu-yearchart__year')).toHaveLength(2);
    const rows = wrapper.findAll('.eu-yearchart__table tbody tr').map((row) => row.text());
    expect(rows[0]).toContain('2025');
    expect(rows[0]?.replace(/\s+/g, ' ')).toContain('240,00 €');
  });

  it('shows per person what is to be paid and what is under way, linked to the workspace', async () => {
    const wrapper = await render();
    const [anna, ben] = wrapper.findAll('.eu-dashboard__person');

    expect(anna?.find('h4 a').attributes('href')).toBe('/invoices/aANNA0000001');
    expect(plain(anna)).toContain('2 Rechnungen · 320,50 €');
    expect(plain(anna)).toContain('1 überfällig');
    expect(plain(anna)).toContain('1 fällig');
    expect(plain(anna)).toContain('Offen: 1');
    expect(plain(anna)).toContain('Eingereicht: 1');
    expect(plain(anna)).not.toContain('Teilabgerechnet');
    expect(plain(ben)).toContain('Nichts offen.');
  });

  it('says per policy how much deductible is left and where the bonus stands', async () => {
    const wrapper = await render();
    const policy = wrapper.find('.eu-dashboard__policy');

    expect(plain(policy)).toContain('PKV-1');
    expect(plain(policy)).toContain('Schonen');
    expect(plain(policy)).toContain('noch 300,00 € offen');
    expect(plain(policy)).toContain('200,00 € von 500,00 €');
    expect(plain(policy)).toContain('Sicher');
  });

  it('speaks English in its own texts', async () => {
    await withLocale('en', async () => {
      const wrapper = await render();

      expect(wrapper.find('h2').text()).toMatch(/^Welcome/);
      expect(tileLabels(wrapper)).toEqual([
        'Invoices',
        'Invoice amount',
        'Reimbursed',
        'Own share',
        'Bonus received',
        'Insured persons',
        'Active policies',
      ]);
      expect(wrapper.text()).toContain('since 01/02/2024');
      const [anna] = wrapper.findAll('.eu-dashboard__person');
      expect(plain(anna)).toContain('2 invoices · €320.50');
      expect(plain(anna)).toContain('1 overdue');
      // The invoice badges come from invoices/ and follow since Slice 81.
      expect(plain(anna)).toContain('Open: 1');
      expect(plain(anna)).toContain('Submitted: 1');
      const policy = wrapper.find('.eu-dashboard__policy');
      expect(plain(policy)).toContain('€300.00 still open');
      expect(plain(policy)).toContain('Spare');
      expect(plain(policy)).toContain('Safe');
      expect(wrapper.find('.eu-yearchart__details summary').text()).toBe('Figures per year');
    });
  });

  it('does not call a bonus safe while a submission there is still unanswered', async () => {
    const data = dashboardFixture();
    const [anna] = data.accounts;
    if (anna?.policies[0]) anna.policies[0].pendingClaims = 1;
    loadDashboard.mockResolvedValue(data);

    const policy = (await render()).find('.eu-dashboard__policy');

    expect(plain(policy)).toContain('In Gefahr');
    expect(plain(policy)).not.toContain('Sicher');
  });

  it('shows no tile whose figure the user may not see, rather than a zero', async () => {
    grant({
      perAccount: [{ accountUID: 'aANNA0000001', permissionKey: PERMISSIONS.VIEW_INVOICES }],
    });

    const wrapper = await render();

    expect(tileLabels(wrapper)).toEqual([
      'Rechnungen',
      'Rechnungsbetrag',
      'Erstattet',
      'Eigenanteil',
    ]);
  });

  it('without any permission it does not ask the API and says why the page is empty', async () => {
    grant({});

    const wrapper = await render();

    expect(loadDashboard).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('fehlen dir noch die Rechte');
  });

  it('points to the invoices when none has been recorded yet', async () => {
    loadDashboard.mockResolvedValue({
      since: null,
      totals: {
        invoiceCount: 0,
        invoiceAmount: 0,
        reimbursed: 0,
        selfBorne: 0,
        bonusPaid: 0,
        accountCount: 0,
        contractCount: 0,
      },
      years: [],
      accounts: [],
    });

    const wrapper = await render();

    expect(wrapper.text()).toContain('Noch keine Rechnung erfasst');
    expect(wrapper.find('.eu-yearchart').exists()).toBe(false);
  });

  it('reports a failed load', async () => {
    loadDashboard.mockRejectedValue(new HttpError(500, 'INTERNAL', 'kaputt'));

    const wrapper = await render();

    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
});
