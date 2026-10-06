<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import { formatMoney } from '../lib/format';
import type { DashboardYearDto } from './api';
import { CHART, layoutChart, tickLabel } from './dashboard-chart';

/**
 * The treatment years at a glance: per year one column of what was reimbursed
 * with the self-borne rest stacked on top — together what the invoices came
 * to — and a slim column of the bonus paid for that year beside it.
 *
 * The drawing is decoration for the eye (`aria-hidden`); the figures
 * themselves stand in the table below it, which is what a screen reader and
 * a keyboard reach. Hovering a year shows its figures as a tooltip.
 */
const props = defineProps<{ years: DashboardYearDto[] }>();

const layout = computed(() => layoutChart(props.years));
const hovered = ref<number | null>(null);

const SERIES = [
  { key: 'reimbursed', label: 'Erstattet', color: 'var(--eu-color-chart-1)' },
  { key: 'selfBorne', label: 'Eigenanteil', color: 'var(--eu-color-chart-2)' },
  { key: 'bonusPaid', label: 'Bonus', color: 'var(--eu-color-chart-3)' },
] as const;

const hoveredYear = computed(() => props.years.find((y) => y.year === hovered.value) ?? null);
/**
 * The tooltip stands beside the hovered band, not over it, so it never hides
 * the top of a tall column: right of the band in the older half, left of it
 * in the newer half, where it would otherwise run off the plot.
 */
const tooltipStyle = computed(() => {
  const index = layout.value.columns.findIndex((c) => c.year === hovered.value);
  const column = layout.value.columns[index];
  if (!column) return null;
  return index < layout.value.columns.length / 2
    ? { left: `${column.x + CHART.band}px` }
    : { left: `${column.x}px`, transform: 'translateX(-100%)' };
});

// With more years than fit, the plot opens on the newest ones.
const plot = ref<HTMLElement | null>(null);
onMounted(() => {
  if (plot.value) plot.value.scrollLeft = plot.value.scrollWidth;
});
</script>

<template>
  <figure class="eu-yearchart">
    <ul class="eu-yearchart__legend">
      <li v-for="series in SERIES" :key="series.key">
        <span class="eu-yearchart__swatch" :style="{ background: series.color }" />
        {{ series.label }}
      </li>
    </ul>

    <div ref="plot" class="eu-yearchart__plot" @mouseleave="hovered = null">
      <svg
        :width="layout.width"
        :height="layout.height"
        :viewBox="`0 0 ${layout.width} ${layout.height}`"
        aria-hidden="true"
        focusable="false"
      >
        <g class="eu-yearchart__grid">
          <line
            v-for="tick in layout.ticks"
            :key="tick.value"
            :x1="CHART.left"
            :x2="layout.width - CHART.right"
            :y1="tick.y"
            :y2="tick.y"
          />
        </g>
        <g class="eu-yearchart__ticks">
          <text
            v-for="tick in layout.ticks"
            :key="tick.value"
            :x="CHART.left - 8"
            :y="tick.y"
            text-anchor="end"
            dominant-baseline="middle"
          >
            {{ tickLabel(tick.value) }}
          </text>
        </g>
        <g
          v-for="column in layout.columns"
          :key="column.year"
          class="eu-yearchart__year"
          :class="{ 'is-dimmed': hovered !== null && hovered !== column.year }"
        >
          <path :d="column.reimbursedPath" fill="var(--eu-color-chart-1)" />
          <path :d="column.selfBornePath" fill="var(--eu-color-chart-2)" />
          <path :d="column.bonusPath" fill="var(--eu-color-chart-3)" />
          <text
            class="eu-yearchart__label"
            :x="column.center"
            :y="layout.baseline + 18"
            text-anchor="middle"
          >
            {{ column.year }}
          </text>
          <!-- The hit target is the whole band, not the slim column. -->
          <rect
            class="eu-yearchart__hit"
            :x="column.x"
            :y="0"
            :width="CHART.band"
            :height="layout.height"
            @mouseenter="hovered = column.year"
          />
        </g>
        <line
          class="eu-yearchart__baseline"
          :x1="CHART.left"
          :x2="layout.width - CHART.right"
          :y1="layout.baseline"
          :y2="layout.baseline"
        />
      </svg>

      <div
        v-if="hoveredYear && tooltipStyle"
        class="eu-yearchart__tooltip"
        :style="tooltipStyle"
        aria-hidden="true"
      >
        <strong>{{ hoveredYear.year }}</strong>
        <span>Rechnungen {{ formatMoney(hoveredYear.invoiceAmount) }}</span>
        <span v-for="series in SERIES" :key="series.key">
          <span class="eu-yearchart__swatch" :style="{ background: series.color }" />
          {{ series.label }} {{ formatMoney(hoveredYear[series.key]) }}
        </span>
      </div>
    </div>

    <details class="eu-yearchart__details">
      <summary>Zahlen je Jahr</summary>
      <div class="eu-yearchart__table-wrap">
        <table class="eu-yearchart__table">
          <thead>
            <tr>
              <th scope="col">Behandlungsjahr</th>
              <th scope="col" class="num">Rechnungen</th>
              <th scope="col" class="num">Betrag</th>
              <th scope="col" class="num">Erstattet</th>
              <th scope="col" class="num">Eigenanteil</th>
              <th scope="col" class="num">Bonus</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="year in years" :key="year.year">
              <th scope="row">{{ year.year }}</th>
              <td class="num">{{ year.invoiceCount }}</td>
              <td class="num">{{ formatMoney(year.invoiceAmount) }}</td>
              <td class="num">{{ formatMoney(year.reimbursed) }}</td>
              <td class="num">{{ formatMoney(year.selfBorne) }}</td>
              <td class="num">{{ formatMoney(year.bonusPaid) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
</template>

<style scoped>
.eu-yearchart {
  margin: 0;
}

.eu-yearchart__legend {
  list-style: none;
  margin: 0 0 0.5rem;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.25rem;
  font-family: var(--eu-font-data);
  font-size: 0.9rem;
}

.eu-yearchart__legend li {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.eu-yearchart__swatch {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 0.2rem;
  flex: none;
}

/* Many years scroll inside the card rather than shrinking the labels. The
   plot holds nothing focusable, so the focus ring needs no room here. */
.eu-yearchart__plot {
  position: relative;
  overflow-x: auto;
}

.eu-yearchart__plot svg {
  display: block;
}

.eu-yearchart__grid line {
  stroke: var(--eu-color-chart-grid);
  stroke-width: 1;
}

.eu-yearchart__baseline {
  stroke: var(--eu-color-text-muted);
  stroke-width: 1;
}

.eu-yearchart__ticks text,
.eu-yearchart__label {
  fill: var(--eu-color-text-muted);
  font-family: var(--eu-font-data);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.eu-yearchart__year path {
  transition: opacity 0.15s ease;
}

.eu-yearchart__year.is-dimmed path {
  opacity: 0.35;
}

.eu-yearchart__hit {
  fill: transparent;
}

.eu-yearchart__tooltip {
  position: absolute;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--eu-color-border);
  border-radius: 0.5rem;
  background: var(--eu-color-surface-bg);
  color: var(--eu-color-text);
  font-family: var(--eu-font-data);
  font-size: 0.85rem;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgb(0 0 0 / 15%);
}

.eu-yearchart__tooltip span {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.eu-yearchart__details {
  margin-top: 0.75rem;
}

.eu-yearchart__details summary {
  cursor: pointer;
  font-family: var(--eu-font-heading);
}

.eu-yearchart__table-wrap {
  overflow-x: auto;
  margin-top: 0.6rem;
}

.eu-yearchart__table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--eu-font-data);
}

.eu-yearchart__table th,
.eu-yearchart__table td {
  padding: 0.45rem 0.7rem;
  text-align: left;
  border-bottom: 1px solid var(--eu-color-border);
  white-space: nowrap;
}

.eu-yearchart__table .num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
