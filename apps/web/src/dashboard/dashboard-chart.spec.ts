import { describe, expect, it } from 'vitest';

import type { DashboardYearDto } from './api';
import { CHART, columnPath, layoutChart, niceScale, tickLabel } from './dashboard-chart';

function year(overrides: Partial<DashboardYearDto> & { year: number }): DashboardYearDto {
  return {
    invoiceCount: 0,
    invoiceAmount: 0,
    reimbursed: 0,
    selfBorne: 0,
    bonusPaid: 0,
    ...overrides,
  };
}

describe('niceScale', () => {
  it('rounds the top up to a step of 1, 2 or 5 times a power of ten', () => {
    expect(niceScale(4321)).toEqual({ max: 5000, ticks: [0, 1000, 2000, 3000, 4000, 5000] });
    expect(niceScale(870)).toEqual({ max: 1000, ticks: [0, 200, 400, 600, 800, 1000] });
    expect(niceScale(12)).toEqual({ max: 15, ticks: [0, 5, 10, 15] });
  });

  it('keeps a maximum that is already round', () => {
    expect(niceScale(2000).max).toBe(2000);
  });

  it('still draws an axis without any amount', () => {
    expect(niceScale(0)).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
  });
});

describe('layoutChart', () => {
  it('scales on the higher of the stack and the bonus, so neither leaves the plot', () => {
    const layout = layoutChart([
      year({ year: 2024, reimbursed: 300, selfBorne: 100 }),
      year({ year: 2025, bonusPaid: 900 }),
    ]);

    expect(layout.scale.max).toBe(1000);
    expect(layout.columns.map((c) => c.year)).toEqual([2024, 2025]);
  });

  it('gives a year with only a bonus no stack, and a year without bonus no bonus column', () => {
    const [onlyBonus, noBonus] = layoutChart([
      year({ year: 2023, bonusPaid: 500 }),
      year({ year: 2024, reimbursed: 500 }),
    ]).columns;

    expect(onlyBonus?.reimbursedPath).toBe('');
    expect(onlyBonus?.selfBornePath).toBe('');
    expect(onlyBonus?.bonusPath).not.toBe('');
    expect(noBonus?.bonusPath).toBe('');
  });

  it('rounds the top of the stack: the upper segment, or the lower one when it stands alone', () => {
    const [both, alone] = layoutChart([
      year({ year: 2024, reimbursed: 400, selfBorne: 100 }),
      year({ year: 2025, reimbursed: 400 }),
    ]).columns;

    expect(both?.reimbursedPath).not.toContain('Q');
    expect(both?.selfBornePath).toContain('Q');
    expect(alone?.reimbursedPath).toContain('Q');
  });

  it('is as wide as its years, with room for the axis', () => {
    const layout = layoutChart([year({ year: 2024 }), year({ year: 2025 })]);

    expect(layout.width).toBe(CHART.left + 2 * CHART.band + CHART.right);
    expect(layout.ticks[0]).toEqual({ value: 0, y: layout.baseline });
  });
});

describe('columnPath', () => {
  it('draws nothing for a zero height', () => {
    expect(columnPath(0, 0, 24, 0)).toBe('');
  });

  it('never rounds more than the column is high', () => {
    expect(columnPath(0, 10, 24, 1)).toContain('V11');
  });
});

describe('tickLabel', () => {
  it('writes whole euros the German way', () => {
    expect(tickLabel(2500).replace(/\s/g, ' ')).toBe('2.500 €');
  });
});
