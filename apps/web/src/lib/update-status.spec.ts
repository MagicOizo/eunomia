import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiData } from './api';
import {
  type UpdateStatus,
  clearUpdateStatus,
  loadUpdateStatus,
  refreshUpdateStatus,
  updateStatus,
} from './update-status';

vi.mock('./api', () => ({ apiData: vi.fn() }));

const apiDataMock = vi.mocked(apiData);

function status(overrides: Partial<UpdateStatus> = {}): UpdateStatus {
  return {
    current: '0.15.0',
    latest: '0.16.0',
    updateAvailable: true,
    releaseUrl: 'https://github.com/MagicOizo/eunomia/releases/tag/v0.16.0',
    checkedAt: '2026-09-29T10:00:00.000Z',
    status: 'ok',
    ...overrides,
  };
}

describe('update status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearUpdateStatus();
  });

  it('knows nothing until it is asked', () => {
    expect(updateStatus.value).toBeNull();
  });

  it('shares one request between callers that ask at the same time', async () => {
    apiDataMock.mockResolvedValue(status());

    const [first, second] = await Promise.all([loadUpdateStatus(), loadUpdateStatus()]);

    // The footer and the settings page both ask on mount; GitHub is asked once.
    expect(apiDataMock).toHaveBeenCalledTimes(1);
    expect(apiDataMock).toHaveBeenCalledWith('/update-check');
    expect(first).toEqual(second);
    expect(updateStatus.value?.latest).toBe('0.16.0');
  });

  it('asks again once the shared request is done', async () => {
    apiDataMock.mockResolvedValue(status());

    await loadUpdateStatus();
    await loadUpdateStatus();

    expect(apiDataMock).toHaveBeenCalledTimes(2);
  });

  it('a forced check replaces what was known', async () => {
    apiDataMock.mockResolvedValue(status());
    await loadUpdateStatus();

    apiDataMock.mockResolvedValue(status({ latest: '0.15.0', updateAvailable: false }));
    await refreshUpdateStatus();

    expect(apiDataMock).toHaveBeenLastCalledWith('/update-check/refresh', { method: 'POST' });
    expect(updateStatus.value?.updateAvailable).toBe(false);
  });

  it('keeps the last answer when a request fails, and throws for the caller', async () => {
    apiDataMock.mockResolvedValue(status());
    await loadUpdateStatus();

    apiDataMock.mockRejectedValue(new Error('403'));
    await expect(refreshUpdateStatus()).rejects.toThrow('403');

    // The settings page names the cause; nothing pretends the answer is gone.
    expect(updateStatus.value?.latest).toBe('0.16.0');
  });

  it('drops an answer that arrives after the session it belonged to ended', async () => {
    let answer: (value: UpdateStatus) => void = () => {};
    apiDataMock.mockReturnValue(
      new Promise<UpdateStatus>((resolve) => {
        answer = resolve;
      }),
    );

    const pending = loadUpdateStatus();
    clearUpdateStatus();
    answer(status());
    await pending;

    expect(updateStatus.value).toBeNull();
  });
});
