<script setup lang="ts">
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faCircleCheck,
  faCircleXmark,
  faCommentDots,
  faHourglassHalf,
  faPen,
  faPlus,
  faTrash,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { computed, reactive, ref, watch } from 'vue';

import type { SelectOption } from '../components/resource/EuSelectField.vue';
import EuBadge from '../design-system/components/EuBadge.vue';
import EuButton from '../design-system/components/EuButton.vue';
import type { DetailValue } from '../design-system/components/EuDetailField.vue';
import EuDetailField from '../design-system/components/EuDetailField.vue';
import EuDetailMask from '../design-system/components/EuDetailMask.vue';
import EuDialog from '../design-system/components/EuDialog.vue';
import EuIconLabel from '../design-system/components/EuIconLabel.vue';
import { describeError } from '../lib/errors';
import { euro, germanDate, plural } from '../lib/format';
import {
  BONUS_FORFEIT_RULE_LABEL,
  type BonusTierDto,
  type BonusYearDto,
  CONTRACT_KIND_LABEL,
  type ContractDetailDto,
  type ContractYearInput,
  type PremiumDto,
  type PremiumInput,
  type TermsDto,
  type TermsInput,
  deleteHistoryEntry,
  getContract,
  saveContractYear,
  saveHistoryEntry,
  updateContract,
} from './api';
import ContractYearDialog from './ContractYearDialog.vue';
import PremiumFormDialog from './PremiumFormDialog.vue';
import TermsFormDialog from './TermsFormDialog.vue';

/**
 * View/edit a policy (Police) as a display mask (see dialog-design.md), plus
 * its two histories — premiums valid from a date (intra-year adjustments) and
 * terms valid from a year (deductible/cap/rate/bonus scale) — and the year
 * history of claim-free years and bonus computed by the API. Opened by
 * ResourceView via ResourceConfig.detailDialog; creating a policy stays the
 * classic form.
 */
const props = defineProps<{
  open: boolean;
  uid: string | null;
  /** Resolved lookups of the contracts resource (accounts, companies). */
  options: Record<string, SelectOption[]>;
}>();

const emit = defineEmits<{ close: []; changed: [] }>();

const contract = ref<ContractDetailDto | null>(null);
const loadError = ref<string | null>(null);
const values = reactive<Record<string, DetailValue>>({});
const saved = reactive<Record<string, DetailValue>>({});
const saving = ref(false);
const saveError = ref<string | null>(null);
/** Which history blocks show their older entries (see the history section). */
const showOlder = reactive({ premiums: false, terms: false, years: false });

const kindOptions = Object.entries(CONTRACT_KIND_LABEL).map(([value, label]) => ({ value, label }));
const forfeitOptions = Object.entries(BONUS_FORFEIT_RULE_LABEL).map(([value, label]) => ({
  value,
  label,
}));

function seedMask(dto: ContractDetailDto): void {
  const seed: Record<string, DetailValue> = {
    contractNumber: dto.contractNumber,
    companyUID: dto.companyUID,
    contractKind: dto.contractKind,
    contractBegin: dto.contractBegin,
    contractEnd: dto.contractEnd,
    bonusForfeitRule: dto.bonusForfeitRule,
    claimFreeYearsAtStart: String(dto.claimFreeYearsAtStart),
    claimFreeCountingFromYear:
      dto.claimFreeCountingFromYear === null ? '' : String(dto.claimFreeCountingFromYear),
  };
  Object.assign(values, seed);
  Object.assign(saved, seed);
}

async function load(): Promise<void> {
  if (!props.uid) return;
  loadError.value = null;
  try {
    const dto = await getContract(props.uid);
    contract.value = dto;
    seedMask(dto);
  } catch (error) {
    loadError.value = describeError(error);
  }
}

watch(
  () => [props.open, props.uid] as const,
  ([open]) => {
    saveError.value = null;
    showOlder.premiums = false;
    showOlder.terms = false;
    showOlder.years = false;
    if (open) void load();
    else contract.value = null;
  },
  { immediate: true },
);

const accountName = computed(
  () => props.options.accounts?.find((o) => o.value === contract.value?.accountUID)?.label ?? '–',
);
const title = computed(() =>
  contract.value ? `Police ${contract.value.contractNumber}` : 'Police',
);
const str = (value: DetailValue): string => (typeof value === 'string' ? value.trim() : '');

async function saveMask(): Promise<void> {
  if (!contract.value) return;
  saveError.value = null;
  const years = str(values.claimFreeYearsAtStart);
  const fromYear = str(values.claimFreeCountingFromYear);
  if (!str(values.contractNumber) || !values.companyUID || !values.contractBegin) {
    saveError.value = 'Bitte Vertragsnummer, Versicherung und Vertragsbeginn ausfüllen.';
    return;
  }
  if (!/^\d{1,2}$/.test(years) || (fromYear !== '' && !/^\d{4}$/.test(fromYear))) {
    saveError.value =
      'Leistungsfreie Jahre als ganze Zahl, Zählbeginn als Jahreszahl (z. B. 2024) angeben.';
    return;
  }
  saving.value = true;
  try {
    await updateContract(contract.value.contractUID, {
      contractNumber: str(values.contractNumber),
      companyUID: values.companyUID,
      contractKind: values.contractKind,
      contractBegin: values.contractBegin,
      contractEnd: values.contractEnd || null,
      bonusForfeitRule: values.bonusForfeitRule,
      claimFreeYearsAtStart: Number(years),
      claimFreeCountingFromYear: fromYear === '' ? null : Number(fromYear),
    });
    await load();
    emit('changed');
  } catch (error) {
    saveError.value = describeError(error);
  } finally {
    saving.value = false;
  }
}

// --- History entries (premiums / terms) -------------------------------------

type Segment = 'premiums' | 'terms';

const premiumDialog = reactive({ open: false, entry: null as PremiumDto | null });
const termsDialog = reactive({
  open: false,
  entry: null as TermsDto | null,
  /** Year a new entry should start in, when opened from the year history. */
  year: null as number | null,
});
const entrySaving = ref(false);
const entryError = ref<string | null>(null);
const pendingDelete = ref<{ segment: Segment; uid: string; label: string } | null>(null);
const deleteError = ref<string | null>(null);

const beginYear = computed(() =>
  Number(contract.value?.contractBegin.slice(0, 4) ?? new Date().getFullYear()),
);
const suggestedTermsYear = computed(() => {
  const last = contract.value?.terms.at(-1);
  return last ? last.validFromYear + 1 : beginYear.value;
});

function openPremium(entry: PremiumDto | null): void {
  entryError.value = null;
  premiumDialog.entry = entry;
  premiumDialog.open = true;
}

function openTerms(entry: TermsDto | null, year: number | null = null): void {
  entryError.value = null;
  termsDialog.entry = entry;
  termsDialog.year = year;
  termsDialog.open = true;
}

/** A new terms entry copies the terms in force for its year, else the latest ones. */
const termsTemplate = computed(() => {
  const terms = contract.value?.terms ?? [];
  const year = termsDialog.year;
  if (year === null) return terms.at(-1) ?? null;
  return terms.filter((t) => t.validFromYear <= year).at(-1) ?? null;
});

async function saveEntry(
  segment: Segment,
  entryUID: string | null,
  payload: PremiumInput | TermsInput,
): Promise<void> {
  if (!contract.value) return;
  entrySaving.value = true;
  entryError.value = null;
  try {
    await saveHistoryEntry(contract.value.contractUID, segment, entryUID, payload);
    premiumDialog.open = false;
    termsDialog.open = false;
    await load();
    emit('changed');
  } catch (error) {
    entryError.value = describeError(error);
  } finally {
    entrySaving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!contract.value || !pendingDelete.value) return;
  deleteError.value = null;
  try {
    await deleteHistoryEntry(
      contract.value.contractUID,
      pendingDelete.value.segment,
      pendingDelete.value.uid,
    );
    pendingDelete.value = null;
    await load();
    emit('changed');
  } catch (error) {
    deleteError.value = describeError(error);
  }
}

/**
 * A policy running since 2018 fills two screens with history rows before the
 * year list even starts. Only the entry in force is shown; the rest sits
 * behind one button per block. Newest first everywhere — the API sorts both
 * histories ascending, so the entry in force is their last one.
 */
const premiumsNewestFirst = computed(() => [...(contract.value?.premiums ?? [])].reverse());
const termsNewestFirst = computed(() => [...(contract.value?.terms ?? [])].reverse());

function visibleRows<T>(rows: T[], expanded: boolean): T[] {
  return expanded ? rows : rows.slice(0, 1);
}

const olderLabel = (count: number, one = 'älteren Eintrag', many = 'ältere Einträge'): string =>
  `${plural(count, one, many)} anzeigen`;

const premiumPeriod = (p: PremiumDto): string =>
  p.validTo
    ? `${germanDate(p.validFrom)} – ${germanDate(p.validTo)}`
    : `ab ${germanDate(p.validFrom)}`;
const termsPeriod = (t: TermsDto): string =>
  t.validToYear === null
    ? `ab ${t.validFromYear}`
    : t.validToYear === t.validFromYear
      ? String(t.validFromYear)
      : `${t.validFromYear} – ${t.validToYear}`;
const percent = (value: number): string => `${new Intl.NumberFormat('de-DE').format(value)} %`;
const tierLabel = (tier: BonusTierDto): string =>
  `ab ${tier.claimFreeYears} J.: ${euro(tier.bonusAmount)}`;

// --- Year history (claim-free years & bonus) ---------------------------------

/** Years newest first: the running year is the one the author looks at most. */
const yearsNewestFirst = computed(() => [...(contract.value?.years ?? [])].reverse());

function yearStatus(y: BonusYearDto): {
  tone: 'open' | 'submitted' | 'done' | 'neutral';
  label: string;
  icon: IconDefinition;
} {
  const manual = y.bonusForfeitedOverride !== null ? ' (manuell)' : '';
  if (y.forfeited) return { tone: 'open', label: `verwirkt${manual}`, icon: faCircleXmark };
  if (y.pendingClaims > 0) {
    return {
      tone: 'submitted',
      label: `in Gefahr (${y.pendingClaims} offen)`,
      icon: faTriangleExclamation,
    };
  }
  if (y.inProgress) return { tone: 'neutral', label: 'laufend', icon: faHourglassHalf };
  return { tone: 'done', label: `leistungsfrei${manual}`, icon: faCircleCheck };
}

/**
 * The forecast rests on a scale taken over from an earlier year. Only worth
 * flagging while the forecast still matters: not for a forfeited year, nor
 * once the actually paid bonus is recorded.
 */
const scaleOutdated = (y: BonusYearDto): boolean =>
  y.tiersInherited && y.hasBonusScale && !y.forfeited && y.actualBonus === null;

function expectedLabel(y: BonusYearDto): string {
  if (y.expectedBonus === null) return 'keine Konditionen';
  if (!y.hasBonusScale) return 'kein Bonus';
  return euro(y.expectedBonus);
}

const yearDialog = reactive({ open: false, year: null as BonusYearDto | null });
const yearSaving = ref(false);
const yearError = ref<string | null>(null);

function openYear(year: BonusYearDto): void {
  yearError.value = null;
  yearDialog.year = year;
  yearDialog.open = true;
}

async function saveYear(payload: ContractYearInput): Promise<void> {
  if (!contract.value || !yearDialog.year) return;
  yearSaving.value = true;
  yearError.value = null;
  try {
    await saveContractYear(contract.value.contractUID, yearDialog.year.year, payload);
    yearDialog.open = false;
    await load();
    emit('changed');
  } catch (error) {
    yearError.value = describeError(error);
  } finally {
    yearSaving.value = false;
  }
}
</script>

<template>
  <EuDialog :open="open" :title="title" wide @close="emit('close')">
    <p v-if="loadError" class="eu-contract__error" role="alert">{{ loadError }}</p>
    <template v-if="contract">
      <EuDetailMask>
        <EuDetailField
          v-model="values.contractNumber"
          :saved-value="saved.contractNumber"
          label="Vertragsnummer"
          type="text"
          required
        />
        <EuDetailField label="Versicherter" type="readonly" :model-value="accountName" />
        <EuDetailField
          v-model="values.companyUID"
          :saved-value="saved.companyUID"
          label="Versicherung"
          type="select"
          :options="options.companies ?? []"
          required
        />
        <EuDetailField
          v-model="values.contractKind"
          :saved-value="saved.contractKind"
          label="Art"
          type="select"
          :options="kindOptions"
          required
        />
        <EuDetailField
          v-model="values.contractBegin"
          :saved-value="saved.contractBegin"
          label="Vertragsbeginn"
          type="date"
          required
        />
        <EuDetailField
          v-model="values.contractEnd"
          :saved-value="saved.contractEnd"
          label="Vertragsende"
          type="date"
        />
        <EuDetailField
          v-model="values.bonusForfeitRule"
          :saved-value="saved.bonusForfeitRule"
          label="Bonus verfällt"
          type="select"
          :options="forfeitOptions"
          required
        />
        <EuDetailField
          v-model="values.claimFreeYearsAtStart"
          :saved-value="saved.claimFreeYearsAtStart"
          label="Leistungsfreie Jahre vorab"
          type="text"
          required
        />
        <EuDetailField
          v-model="values.claimFreeCountingFromYear"
          :saved-value="saved.claimFreeCountingFromYear"
          label="Zählbeginn (Jahr)"
          type="text"
        />
      </EuDetailMask>
      <p v-if="saveError" class="eu-contract__error" role="alert">{{ saveError }}</p>

      <section class="eu-contract__block" aria-labelledby="eu-contract-premiums">
        <div class="eu-contract__block-head">
          <h3 id="eu-contract-premiums">Beitragsverlauf</h3>
          <EuButton variant="secondary" :icon="faPlus" @click="openPremium(null)"
            >Beitragsanpassung erfassen</EuButton
          >
        </div>
        <p v-if="contract.premiums.length === 0" class="eu-contract__hint">
          Noch kein Beitrag erfasst.
        </p>
        <div v-else class="eu-contract__scroll eu-scroll-focus-safe">
          <table class="eu-contract__table">
            <thead>
              <tr>
                <th scope="col">Gültig</th>
                <th scope="col" class="eu-contract__num">Monatsbeitrag</th>
                <th scope="col" class="eu-contract__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="premium in visibleRows(premiumsNewestFirst, showOlder.premiums)"
                :key="premium.premiumUID"
              >
                <td class="eu-contract__period">
                  {{ premiumPeriod(premium) }}
                  <span v-if="premium.note" class="eu-contract__note">
                    <EuIconLabel :icon="faCommentDots" :label="premium.note" />
                  </span>
                </td>
                <td class="eu-contract__num">{{ euro(premium.monthlyPremium) }}</td>
                <td class="eu-contract__actions">
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faPen"
                    :aria-label="`Beitragsstand ab ${germanDate(premium.validFrom)} bearbeiten`"
                    @click="openPremium(premium)"
                  />
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faTrash"
                    :aria-label="`Beitragsstand ab ${germanDate(premium.validFrom)} löschen`"
                    @click="
                      pendingDelete = {
                        segment: 'premiums',
                        uid: premium.premiumUID,
                        label: `den Beitragsstand ab ${germanDate(premium.validFrom)}`,
                      }
                    "
                  />
                </td>
              </tr>
              <tr v-if="contract.premiums.length > 1">
                <td colspan="3" class="eu-contract__more">
                  <button
                    type="button"
                    :aria-expanded="showOlder.premiums"
                    @click="showOlder.premiums = !showOlder.premiums"
                  >
                    {{
                      showOlder.premiums
                        ? 'Ältere Einträge ausblenden'
                        : olderLabel(contract.premiums.length - 1)
                    }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="eu-contract__block" aria-labelledby="eu-contract-terms">
        <div class="eu-contract__block-head">
          <h3 id="eu-contract-terms">Konditionen je Jahr</h3>
          <EuButton variant="secondary" :icon="faPlus" @click="openTerms(null)"
            >Konditionen ab Jahr erfassen</EuButton
          >
        </div>
        <p v-if="contract.terms.length === 0" class="eu-contract__hint">
          Noch keine Konditionen erfasst.
        </p>
        <div v-else class="eu-contract__scroll eu-scroll-focus-safe">
          <table class="eu-contract__table">
            <thead>
              <tr>
                <th scope="col">Jahre</th>
                <th scope="col" class="eu-contract__num">Selbstbeteiligung</th>
                <th scope="col" class="eu-contract__num">Obergrenze</th>
                <th scope="col" class="eu-contract__num">
                  <abbr title="Erstattungssatz">Satz</abbr>
                </th>
                <th scope="col">Bonus-Staffel</th>
                <th scope="col" class="eu-contract__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="terms in visibleRows(termsNewestFirst, showOlder.terms)"
                :key="terms.termsUID"
              >
                <td class="eu-contract__period">{{ termsPeriod(terms) }}</td>
                <td class="eu-contract__num">{{ euro(terms.deductible) }}</td>
                <td class="eu-contract__num">
                  {{ terms.reimbursementCap === null ? 'keine' : euro(terms.reimbursementCap) }}
                </td>
                <td class="eu-contract__num">{{ percent(terms.reimbursementRate) }}</td>
                <td>
                  <ul v-if="terms.bonusTiers.length > 0" class="eu-contract__tiers">
                    <li v-for="tier in terms.bonusTiers" :key="tier.claimFreeYears">
                      {{ tierLabel(tier) }}
                    </li>
                  </ul>
                  <template v-else>kein Bonus</template>
                </td>
                <td class="eu-contract__actions">
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faPen"
                    :aria-label="`Konditionen ab ${terms.validFromYear} bearbeiten`"
                    @click="openTerms(terms)"
                  />
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faTrash"
                    :aria-label="`Konditionen ab ${terms.validFromYear} löschen`"
                    @click="
                      pendingDelete = {
                        segment: 'terms',
                        uid: terms.termsUID,
                        label: `die Konditionen ab ${terms.validFromYear}`,
                      }
                    "
                  />
                </td>
              </tr>
              <tr v-if="contract.terms.length > 1">
                <td colspan="6" class="eu-contract__more">
                  <button
                    type="button"
                    :aria-expanded="showOlder.terms"
                    @click="showOlder.terms = !showOlder.terms"
                  >
                    {{
                      showOlder.terms
                        ? 'Ältere Einträge ausblenden'
                        : olderLabel(contract.terms.length - 1)
                    }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="eu-contract__block" aria-labelledby="eu-contract-years">
        <div class="eu-contract__block-head">
          <h3 id="eu-contract-years">Jahresverlauf</h3>
        </div>
        <p class="eu-contract__hint eu-contract__hint--intro">
          Leistungsfreie Jahre werden aus Einreichungen und Erstattungen gezählt (Bonus verfällt
          {{ BONUS_FORFEIT_RULE_LABEL[contract.bonusForfeitRule] }}).
        </p>
        <p v-if="contract.years.length === 0" class="eu-contract__hint">
          Noch kein Jahr zu zählen – der Zählbeginn liegt in der Zukunft.
        </p>
        <div v-else class="eu-contract__scroll eu-scroll-focus-safe">
          <table class="eu-contract__table">
            <thead>
              <tr>
                <th scope="col">Jahr</th>
                <th scope="col">Status</th>
                <th scope="col" class="eu-contract__num">
                  <abbr title="Leistungsfreie Jahre in Folge">In Folge</abbr>
                </th>
                <th scope="col" class="eu-contract__num">Bonus erwartet</th>
                <th scope="col" class="eu-contract__num">Erhalten</th>
                <th scope="col" class="eu-contract__actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="y in visibleRows(yearsNewestFirst, showOlder.years)" :key="y.year">
                <th scope="row" class="eu-contract__period">
                  {{ y.year }}
                  <span v-if="y.note" class="eu-contract__note">
                    <EuIconLabel :icon="faCommentDots" :label="y.note" />
                  </span>
                </th>
                <td>
                  <EuBadge :tone="yearStatus(y).tone" :icon="yearStatus(y).icon">{{
                    yearStatus(y).label
                  }}</EuBadge>
                </td>
                <td class="eu-contract__num">{{ y.claimFreeStreak }}</td>
                <td class="eu-contract__num">
                  {{ expectedLabel(y) }}
                  <span v-if="scaleOutdated(y)" class="eu-contract__stale">
                    nicht aktualisiert (Staffel {{ y.termsFromYear }})
                  </span>
                </td>
                <td class="eu-contract__num">
                  {{ y.actualBonus === null ? '–' : euro(y.actualBonus) }}
                </td>
                <td class="eu-contract__actions">
                  <EuButton
                    v-if="scaleOutdated(y)"
                    variant="secondary"
                    icon-only
                    :icon="faPlus"
                    :aria-label="`Konditionen und Staffel für ${y.year} erfassen`"
                    @click="openTerms(null, y.year)"
                  />
                  <EuButton
                    variant="secondary"
                    icon-only
                    :icon="faPen"
                    :aria-label="`Jahr ${y.year} erfassen (Rückerstattung, Verwirkung)`"
                    @click="openYear(y)"
                  />
                </td>
              </tr>
              <tr v-if="contract.years.length > 1">
                <td colspan="6" class="eu-contract__more">
                  <button
                    type="button"
                    :aria-expanded="showOlder.years"
                    @click="showOlder.years = !showOlder.years"
                  >
                    {{
                      showOlder.years
                        ? 'Ältere Jahre ausblenden'
                        : olderLabel(contract.years.length - 1, 'älteres Jahr', 'ältere Jahre')
                    }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <template #footer>
      <EuButton variant="secondary" @click="emit('close')">Schließen</EuButton>
      <EuButton :disabled="saving || !contract" @click="saveMask">{{
        saving ? 'Speichern…' : 'Speichern'
      }}</EuButton>
    </template>
  </EuDialog>

  <PremiumFormDialog
    :open="premiumDialog.open"
    :entry="premiumDialog.entry"
    :min-date="contract?.contractBegin ?? ''"
    :submitting="entrySaving"
    :error="entryError"
    @close="premiumDialog.open = false"
    @submit="saveEntry('premiums', premiumDialog.entry?.premiumUID ?? null, $event)"
  />
  <TermsFormDialog
    :open="termsDialog.open"
    :entry="termsDialog.entry"
    :min-year="beginYear"
    :suggested-year="termsDialog.year ?? suggestedTermsYear"
    :template="termsTemplate"
    :submitting="entrySaving"
    :error="entryError"
    @close="termsDialog.open = false"
    @submit="saveEntry('terms', termsDialog.entry?.termsUID ?? null, $event)"
  />
  <ContractYearDialog
    :open="yearDialog.open"
    :year="yearDialog.year"
    :submitting="yearSaving"
    :error="yearError"
    @close="yearDialog.open = false"
    @submit="saveYear"
  />
  <EuDialog :open="pendingDelete !== null" title="Eintrag löschen" @close="pendingDelete = null">
    <p>Soll {{ pendingDelete?.label }} wirklich gelöscht werden?</p>
    <p v-if="deleteError" class="eu-contract__error" role="alert">{{ deleteError }}</p>
    <template #footer>
      <EuButton variant="secondary" @click="pendingDelete = null">Abbrechen</EuButton>
      <EuButton @click="confirmDelete">Löschen</EuButton>
    </template>
  </EuDialog>
</template>

<style scoped>
.eu-contract__block {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--eu-color-border);
}

.eu-contract__block-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.eu-contract__block-head h3 {
  margin: 0;
  font-family: var(--eu-font-heading);
  font-size: 1.05rem;
}

.eu-contract__hint {
  margin: 0;
  color: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
}

.eu-contract__scroll {
  overflow-x: auto;
}

.eu-contract__tiers {
  margin: 0;
  padding: 0;
  list-style: none;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.eu-contract__table :deep(.eu-badge) {
  white-space: nowrap;
}

.eu-contract__table abbr {
  text-decoration: none;
}

.eu-contract__hint--intro {
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}

.eu-contract__stale {
  display: block;
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  white-space: normal;
}

.eu-contract__error {
  margin: 1rem 0 0;
  color: var(--eu-color-error-fg);
  font-size: 0.9rem;
}

.eu-contract__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-contract__table th,
.eu-contract__table td {
  padding: 0.4rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
}

.eu-contract__table th {
  font-family: var(--eu-font-heading);
  color: var(--eu-color-text-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.eu-contract__table .eu-contract__period {
  white-space: nowrap;
}

.eu-contract__table .eu-contract__num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.eu-contract__table .eu-contract__actions {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}

.eu-contract__actions button + button {
  margin-left: 0.4rem;
}

/* A recorded note: the bubble stands next to the period or year it belongs to,
   the text itself is the tooltip (and the icon's accessible name). */
.eu-contract__note {
  margin-left: 0.4rem;
  color: var(--eu-color-text-muted);
}

/* The disclosure row under a history table — a quiet link, not a data row. */
.eu-contract__table .eu-contract__more {
  border-bottom: none;
  padding-top: 0.5rem;
}

.eu-contract__more button {
  border: none;
  background: none;
  padding: 0.15rem 0;
  font: inherit;
  color: var(--eu-color-accent-text);
  cursor: pointer;
}

.eu-contract__more button:hover {
  text-decoration: underline;
}
</style>
