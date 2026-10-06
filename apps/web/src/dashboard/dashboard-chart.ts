import { formatWholeMoney } from '../lib/format';
import type { DashboardYearDto } from './api';

/**
 * The geometry of the start page's year chart, kept out of the component so
 * it can be tested without a DOM: the scale, the axis ticks and one column
 * group per treatment year — a stacked column of reimbursed and self-borne
 * (together what the year's invoices came to) and a slim column of the bonus
 * paid for that year beside it.
 */

/** Pixel layout of the chart; the SVG is drawn at this natural size. */
export const CHART = {
  plotHeight: 200,
  top: 12,
  /** Room for the year labels under the baseline. */
  bottom: 28,
  /** Room for the tick labels left of the plot. */
  left: 72,
  right: 8,
  band: 72,
  stackWidth: 24,
  bonusWidth: 12,
  /** Air between the stacked column and the bonus column of one year. */
  pairGap: 4,
  /** The surface-coloured gap between the two segments of the stack. */
  segmentGap: 2,
  /** Rounded data end of a column; the baseline end stays square. */
  radius: 4,
} as const;

export interface Scale {
  max: number;
  ticks: number[];
}

/**
 * A scale from zero to a round number at or above `max`, in four to six steps
 * of 1, 2 or 5 times a power of ten. Zero data still gets an axis (0–100), so
 * an empty year draws flat rather than not at all.
 */
export function niceScale(max: number): Scale {
  if (!(max > 0)) return { max: 100, ticks: [0, 25, 50, 75, 100] };
  const rough = max / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((f) => f * power).find((s) => s >= rough) ?? 10 * power;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= top + step / 2; value += step) ticks.push(value);
  return { max: top, ticks };
}

/** The SVG path of a column with a rounded top and a square foot. */
export function columnPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return '';
  const r = Math.min(CHART.radius, width / 2, height);
  const bottom = y + height;
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ');
}

/** A plain rectangle, for the lower segment of the stack. */
export function rectPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return '';
  return `M${x},${y + height} V${y} H${x + width} V${y + height} Z`;
}

export interface YearColumns {
  year: number;
  /** Left edge of the year's band. */
  x: number;
  center: number;
  reimbursedPath: string;
  selfBornePath: string;
  bonusPath: string;
}

export interface ChartLayout {
  width: number;
  height: number;
  baseline: number;
  scale: Scale;
  /** Tick values with their y position. */
  ticks: Array<{ value: number; y: number }>;
  columns: YearColumns[];
}

/** Lays out the whole chart for a year series (oldest first). */
export function layoutChart(years: readonly DashboardYearDto[]): ChartLayout {
  const scale = niceScale(
    Math.max(0, ...years.map((y) => Math.max(y.reimbursed + y.selfBorne, y.bonusPaid))),
  );
  const baseline = CHART.top + CHART.plotHeight;
  const toHeight = (value: number): number => (Math.max(0, value) / scale.max) * CHART.plotHeight;
  const pairWidth = CHART.stackWidth + CHART.pairGap + CHART.bonusWidth;

  const columns = years.map((entry, index) => {
    const x = CHART.left + index * CHART.band;
    const stackX = x + (CHART.band - pairWidth) / 2;
    const bonusX = stackX + CHART.stackWidth + CHART.pairGap;

    const reimbursedHeight = toHeight(entry.reimbursed);
    const selfBorneHeight = toHeight(entry.selfBorne);
    const reimbursedTop = baseline - reimbursedHeight;
    // The upper segment gives up the gap, so the stack keeps its true height.
    const gap = reimbursedHeight > 0 && selfBorneHeight > 0 ? CHART.segmentGap : 0;
    const selfBorneDrawn = Math.max(0, selfBorneHeight - gap);

    return {
      year: entry.year,
      x,
      center: x + CHART.band / 2,
      reimbursedPath:
        selfBorneDrawn > 0
          ? rectPath(stackX, reimbursedTop, CHART.stackWidth, reimbursedHeight)
          : columnPath(stackX, reimbursedTop, CHART.stackWidth, reimbursedHeight),
      selfBornePath: columnPath(
        stackX,
        reimbursedTop - gap - selfBorneDrawn,
        CHART.stackWidth,
        selfBorneDrawn,
      ),
      bonusPath: columnPath(
        bonusX,
        baseline - toHeight(entry.bonusPaid),
        CHART.bonusWidth,
        toHeight(entry.bonusPaid),
      ),
    };
  });

  return {
    width: CHART.left + Math.max(1, years.length) * CHART.band + CHART.right,
    height: baseline + CHART.bottom,
    baseline,
    scale,
    ticks: scale.ticks.map((value) => ({ value, y: baseline - toHeight(value) })),
    columns,
  };
}

/** An axis label: whole euros, "2.500 €". */
export function tickLabel(value: number): string {
  return formatWholeMoney(value);
}
