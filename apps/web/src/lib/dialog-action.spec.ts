import { describe, expect, it } from 'vitest';

import { useDialogAction } from './dialog-action';
import { HttpError } from './http';

describe('useDialogAction', () => {
  it('closes the dialog and reloads, in that order', async () => {
    const steps: string[] = [];
    const action = useDialogAction(() => {
      steps.push('reload');
    });

    const ok = await action.run(
      async () => {
        steps.push('write');
      },
      () => steps.push('close'),
    );

    expect(ok).toBe(true);
    expect(steps).toEqual(['write', 'close', 'reload']);
    expect(action.error).toBe(null);
    expect(action.busy).toBe(false);
  });

  it('keeps the dialog open with a German sentence when the write fails', async () => {
    let closed = false;
    let reloaded = false;
    const action = useDialogAction(() => {
      reloaded = true;
    });

    const ok = await action.run(
      () => Promise.reject(new HttpError(404, 'NOT_FOUND', 'not found')),
      () => (closed = true),
    );

    expect(ok).toBe(false);
    expect(closed).toBe(false);
    expect(reloaded).toBe(false);
    expect(action.error).toMatch(/^Der Eintrag wurde nicht gefunden\./);
    expect(action.busy).toBe(false);
  });

  it("says a conflict in the caller's own words", async () => {
    const action = useDialogAction();

    await action.run(
      () => Promise.reject(new HttpError(409, 'CONFLICT', 'conflict')),
      undefined,
      'Diese E-Mail-Adresse wird bereits verwendet.',
    );

    expect(action.error).toBe('Diese E-Mail-Adresse wird bereits verwendet.');
  });

  it('is busy while the action runs and clears its error on the next try', async () => {
    const action = useDialogAction();
    action.error = 'Von vorher stehengeblieben.';

    let busyDuring = false;
    await action.run(() => {
      busyDuring = action.busy;
      return Promise.resolve();
    });

    expect(busyDuring).toBe(true);
    expect(action.busy).toBe(false);
    expect(action.error).toBe(null);
  });
});
