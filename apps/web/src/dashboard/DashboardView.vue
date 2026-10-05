<script setup lang="ts">
import { PERMISSIONS } from '@eunomia/shared';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import { computed, onMounted, ref } from 'vue';

import EuBadge from '../design-system/components/EuBadge.vue';
import { PAYMENT_COLOR_VAR, PAYMENT_DISPLAY } from '../invoices/payment';
import { POLICY_STATUS_BADGE, bonusView, percentOf } from '../invoices/recommendation';
import { STATUS_DISPLAY } from '../invoices/status';
import { describeError } from '../lib/errors';
import { germanDate, germanMoney, plural } from '../lib/format';
import { useAuthStore } from '../stores/auth';
import DashboardYearChart from './DashboardYearChart.vue';
import {
  type DashboardAccountDto,
  type DashboardDto,
  type DashboardPolicyDto,
  loadDashboard,
} from './api';

/**
 * The start page (issues.md 0.15.0-3): the household's figures instead of
 * shortcut cards to the areas the sidebar already lists. Totals since the
 * first invoice, the same per treatment year as a chart, and per insured
 * person what is still to be paid, what is still on its way to a
 * reimbursement and how the running year stands at each policy.
 *
 * Every block is filled by the API under its own permission. A tile is only
 * shown when its permission is held somewhere — without it the API answers a
 * zero, and a zero would claim something it does not know.
 */

const auth = useAuthStore();

const dashboard = ref<DashboardDto | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

const seesInvoices = computed(() => auth.canAny(PERMISSIONS.VIEW_INVOICES));
const seesContracts = computed(() => auth.canAny(PERMISSIONS.VIEW_CONTRACTS));
const seesAccounts = computed(() => auth.canAny(PERMISSIONS.VIEW_ACCOUNTS));
const seesAnything = computed(
  () => seesInvoices.value || seesContracts.value || seesAccounts.value,
);

onMounted(async () => {
  if (!seesAnything.value) {
    loading.value = false;
    return;
  }
  try {
    dashboard.value = await loadDashboard();
  } catch (error) {
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
});

interface Tile {
  key: string;
  label: string;
  value: string;
  note?: string;
}

const tiles = computed<Tile[]>(() => {
  const data = dashboard.value;
  if (!data) return [];
  const { totals } = data;
  const result: Tile[] = [];
  if (seesInvoices.value) {
    result.push(
      {
        key: 'invoices',
        label: 'Rechnungen',
        value: String(totals.invoiceCount),
        note: data.since ? `seit ${germanDate(data.since)}` : undefined,
      },
      { key: 'amount', label: 'Rechnungsbetrag', value: germanMoney(totals.invoiceAmount) },
      { key: 'reimbursed', label: 'Erstattet', value: germanMoney(totals.reimbursed) },
      {
        key: 'selfBorne',
        label: 'Eigenanteil',
        value: germanMoney(totals.selfBorne),
        note: 'alles nicht Erstattete',
      },
    );
  }
  if (seesContracts.value) {
    result.push({ key: 'bonus', label: 'Bonus erhalten', value: germanMoney(totals.bonusPaid) });
  }
  if (seesAccounts.value) {
    result.push({ key: 'accounts', label: 'Versicherte', value: String(totals.accountCount) });
  }
  if (seesContracts.value) {
    result.push({
      key: 'contracts',
      label: 'Laufende Policen',
      value: String(totals.contractCount),
    });
  }
  return result;
});

const showYears = computed(() => seesInvoices.value && (dashboard.value?.years.length ?? 0) > 0);
const noInvoices = computed(
  () => seesInvoices.value && dashboard.value !== null && dashboard.value.totals.invoiceCount === 0,
);

const fullName = (account: DashboardAccountDto): string =>
  [account.firstname, account.surname].filter(Boolean).join(' ');

const WORKFLOW_OPEN = ['offen', 'eingereicht', 'teilabgerechnet'] as const;

function underWay(account: DashboardAccountDto): number {
  return WORKFLOW_OPEN.reduce((sum, status) => sum + account.workflow[status], 0);
}

function nothingOpen(account: DashboardAccountDto): boolean {
  return account.payment.unpaidCount === 0 && underWay(account) === 0;
}

const kindLabel = (policy: DashboardPolicyDto): string =>
  policy.contractKind === 'FULL' ? 'Vollversicherung' : 'Zusatzversicherung';
</script>

<template>
  <section class="eu-dashboard">
    <h2 class="eu-dashboard__greeting">
      Willkommen{{ auth.user ? `, ${auth.user.firstname}` : '' }}.
    </h2>
    <p class="eu-dashboard__lead">
      Eunomia begleitet den Weg einer Rechnung von der Erfassung über die Einreichung bei der
      Versicherung bis zur Erstattung.
    </p>

    <p v-if="!seesAnything" class="eu-dashboard__hint">
      Für die Zahlen auf der Startseite fehlen dir noch die Rechte. Wende dich an die Person, die
      Eunomia verwaltet.
    </p>
    <p v-else-if="loading" class="eu-dashboard__hint" role="status">Wird geladen…</p>
    <p v-else-if="loadError" class="eu-dashboard__error" role="alert">{{ loadError }}</p>

    <template v-else-if="dashboard">
      <section class="eu-dashboard__block" aria-labelledby="eu-dashboard-totals">
        <h3 id="eu-dashboard-totals">Überblick</h3>
        <dl class="eu-dashboard__tiles">
          <div v-for="tile in tiles" :key="tile.key" class="eu-dashboard__tile">
            <dt>{{ tile.label }}</dt>
            <dd class="eu-dashboard__value">{{ tile.value }}</dd>
            <dd v-if="tile.note" class="eu-dashboard__note">{{ tile.note }}</dd>
          </div>
        </dl>
        <p v-if="noInvoices" class="eu-dashboard__hint">
          Noch keine Rechnung erfasst — das beginnt unter
          <RouterLink to="/invoices">Rechnungen</RouterLink>.
        </p>
      </section>

      <section v-if="showYears" class="eu-dashboard__block" aria-labelledby="eu-dashboard-years">
        <h3 id="eu-dashboard-years">Je Behandlungsjahr</h3>
        <DashboardYearChart :years="dashboard.years" />
      </section>

      <section
        v-if="dashboard.accounts.length > 0"
        class="eu-dashboard__block"
        aria-labelledby="eu-dashboard-accounts"
      >
        <h3 id="eu-dashboard-accounts">Je versicherte Person</h3>
        <ul class="eu-dashboard__people">
          <li
            v-for="account in dashboard.accounts"
            :key="account.accountUID"
            class="eu-dashboard__person"
          >
            <h4>
              <RouterLink :to="`/invoices/${account.accountUID}`">{{
                fullName(account)
              }}</RouterLink>
            </h4>

            <p v-if="nothingOpen(account)" class="eu-dashboard__quiet">Nichts offen.</p>
            <template v-else>
              <div class="eu-dashboard__fact">
                <span class="eu-dashboard__label">Zu bezahlen</span>
                <span v-if="account.payment.unpaidCount === 0">nichts</span>
                <span v-else>
                  {{ plural(account.payment.unpaidCount, 'Rechnung', 'Rechnungen') }} ·
                  {{ germanMoney(account.payment.unpaidAmount) }}
                </span>
              </div>
              <ul
                v-if="account.payment.overdueCount > 0 || account.payment.dueCount > 0"
                class="eu-dashboard__lights"
              >
                <li
                  v-if="account.payment.overdueCount > 0"
                  :style="{ color: `var(${PAYMENT_COLOR_VAR.overdue})` }"
                >
                  <FontAwesomeIcon :icon="PAYMENT_DISPLAY.overdue.icon" aria-hidden="true" />
                  {{ account.payment.overdueCount }} überfällig
                </li>
                <li
                  v-if="account.payment.dueCount > 0"
                  :style="{ color: `var(${PAYMENT_COLOR_VAR.due})` }"
                >
                  <FontAwesomeIcon :icon="PAYMENT_DISPLAY.due.icon" aria-hidden="true" />
                  {{ account.payment.dueCount }} fällig
                </li>
              </ul>

              <div class="eu-dashboard__fact">
                <span class="eu-dashboard__label">Erstattung unterwegs</span>
                <span v-if="underWay(account) === 0">nichts</span>
              </div>
              <div v-if="underWay(account) > 0" class="eu-dashboard__badges">
                <template v-for="status in WORKFLOW_OPEN" :key="status">
                  <EuBadge
                    v-if="account.workflow[status] > 0"
                    compact
                    :tone="STATUS_DISPLAY[status].tone"
                    :icon="STATUS_DISPLAY[status].icon"
                  >
                    {{ STATUS_DISPLAY[status].label }}: {{ account.workflow[status] }}
                  </EuBadge>
                </template>
              </div>
            </template>

            <div v-if="account.policies.length > 0" class="eu-dashboard__policies">
              <h5>Policen {{ account.year }}</h5>
              <article
                v-for="policy in account.policies"
                :key="policy.contractUID"
                class="eu-dashboard__policy"
              >
                <header class="eu-dashboard__policy-head">
                  <span>
                    <strong>{{ policy.contractNumber }}</strong>
                    <span class="eu-dashboard__sub">
                      {{ policy.companyName }} · {{ kindLabel(policy) }}
                    </span>
                  </span>
                  <EuBadge
                    compact
                    :tone="POLICY_STATUS_BADGE[policy.status].tone"
                    :icon="POLICY_STATUS_BADGE[policy.status].icon"
                  >
                    {{ POLICY_STATUS_BADGE[policy.status].label }}
                  </EuBadge>
                </header>

                <div class="eu-dashboard__fact">
                  <span class="eu-dashboard__label">Selbstbeteiligung</span>
                  <span v-if="!policy.hasTerms">keine Konditionen</span>
                  <span v-else-if="policy.deductible === 0">keine</span>
                  <span v-else-if="policy.deductibleLeft === 0">erreicht</span>
                  <span v-else>noch {{ germanMoney(policy.deductibleLeft) }} offen</span>
                </div>
                <div
                  v-if="policy.hasTerms && policy.deductible > 0"
                  class="eu-dashboard__bar"
                  aria-hidden="true"
                >
                  <span
                    :style="{ width: `${percentOf(policy.deductibleUsed, policy.deductible)}%` }"
                  />
                </div>
                <p
                  v-if="policy.hasTerms && policy.deductible > 0"
                  class="eu-dashboard__sub eu-dashboard__bar-note"
                >
                  {{ germanMoney(policy.deductibleUsed) }} von {{ germanMoney(policy.deductible) }}
                </p>

                <div class="eu-dashboard__fact">
                  <span class="eu-dashboard__label">Bonus</span>
                  <EuBadge compact :tone="bonusView(policy).tone" :icon="bonusView(policy).icon">
                    {{ bonusView(policy).label }}
                  </EuBadge>
                </div>
                <p class="eu-dashboard__sub">{{ bonusView(policy).detail }}</p>
              </article>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </section>
</template>

<style scoped>
.eu-dashboard__greeting {
  margin: 0 0 0.25rem;
}

.eu-dashboard__lead {
  margin: 0 0 1.5rem;
  max-width: 42rem;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-dashboard__hint,
.eu-dashboard__quiet {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-dashboard__error {
  padding: 0.6rem 0.8rem;
  border-radius: 0.5rem;
  background: var(--eu-color-error-bg);
  color: var(--eu-color-error-fg);
}

.eu-dashboard__block {
  margin-bottom: 2rem;
}

.eu-dashboard__block h3 {
  margin: 0 0 0.75rem;
}

.eu-dashboard__tiles {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr));
  gap: 0.75rem;
}

.eu-dashboard__tile {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
}

.eu-dashboard__tile dt {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}

.eu-dashboard__tile dd {
  margin: 0;
}

.eu-dashboard__value {
  font-family: var(--eu-font-heading);
  font-size: 1.45rem;
}

.eu-dashboard__note {
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
}

.eu-dashboard__people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
  /* A person with nothing open keeps a short card beside a long one. */
  align-items: start;
  gap: 1rem;
}

.eu-dashboard__person {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.75rem;
  font-family: var(--eu-font-data);
}

.eu-dashboard__person h4 {
  margin: 0 0 0.25rem;
  font-family: var(--eu-font-heading);
}

.eu-dashboard__person h5 {
  margin: 0.6rem 0 0;
  font-family: var(--eu-font-heading);
  font-size: 0.95rem;
}

.eu-dashboard__quiet {
  margin: 0;
}

.eu-dashboard__fact {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
}

.eu-dashboard__label {
  color: var(--eu-color-text-muted);
  white-space: nowrap;
}

.eu-dashboard__lights {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  font-size: 0.9rem;
}

.eu-dashboard__lights li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.eu-dashboard__badges {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.eu-dashboard__policies {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.eu-dashboard__policy {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--eu-color-border);
}

.eu-dashboard__policy-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.5rem;
}

.eu-dashboard__sub {
  display: block;
  margin: 0;
  color: var(--eu-color-text-muted);
  font-size: 0.85rem;
}

.eu-dashboard__bar {
  display: flex;
  height: 0.5rem;
  overflow: hidden;
  border-radius: 999px;
  background-color: var(--eu-color-border);
}

.eu-dashboard__bar span {
  background-color: var(--eu-color-accent);
}

.eu-dashboard__bar-note {
  text-align: right;
}
</style>
