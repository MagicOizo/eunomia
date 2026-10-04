import { afterEach, describe, expect, it, vi } from 'vitest';

import { downloadJson, isoToday } from './download';

/**
 * The first download in the app (the account export, Scheibe 18). Three things
 * can quietly go wrong and each costs the user their file: the link is not in
 * the document (Firefox ignores the click), the object URL is revoked before
 * the click, or it is never revoked at all.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('downloadJson', () => {
  it('hands the browser a named, pretty-printed JSON file', () => {
    const created: Blob[] = [];
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      created.push(blob as Blob);
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const clicked: HTMLAnchorElement[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
      // At the moment of the click the link has to be in the document.
      expect(this.isConnected).toBe(true);
    });

    downloadJson('eunomia-export.json', { account: { firstname: 'Anna' } });

    expect(click).toHaveBeenCalledTimes(1);
    expect(clicked[0]?.download).toBe('eunomia-export.json');
    expect(clicked[0]?.getAttribute('href')).toBe('blob:test');
    expect(created[0]?.type).toBe('application/json;charset=utf-8');
    // And it is gone again afterwards.
    expect(clicked[0]?.isConnected).toBe(false);
  });

  it('revokes the object URL after the click, never before it', () => {
    vi.useFakeTimers();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      expect(revoke).not.toHaveBeenCalled();
    });

    downloadJson('x.json', {});
    expect(revoke).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });

  it('writes the payload as readable JSON', async () => {
    let blob: Blob | undefined;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((value: Blob | MediaSource) => {
      blob = value as Blob;
      return 'blob:test';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadJson('x.json', { a: 1, b: [2] });

    expect(await blob!.text()).toBe('{\n  "a": 1,\n  "b": [\n    2\n  ]\n}');
  });
});

describe('isoToday', () => {
  it('is the local calendar day, zero-padded', () => {
    expect(isoToday(new Date(2026, 9, 4, 23, 30))).toBe('2026-10-04');
    expect(isoToday(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});
