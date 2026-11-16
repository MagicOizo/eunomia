import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyText } from './clipboard';

/**
 * Copying with and without the clipboard API: over plain http under an own
 * host name the browser offers no `navigator.clipboard`, and the copy has to
 * go through the selection instead.
 */
describe('copyText', () => {
  const setClipboard = (value: unknown): void => {
    Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
  };
  const execCommand = vi.fn<(command: string) => boolean>();

  afterEach(() => {
    setClipboard(undefined);
    execCommand.mockReset();
    document.body.innerHTML = '';
  });

  function withExecCommand(): void {
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
  }

  it('uses the clipboard API where there is one', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    setClipboard({ writeText });
    withExecCommand();

    expect(await copyText('https://x.example/cb')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x.example/cb');
    expect(execCommand).not.toHaveBeenCalled();
  });

  it('copies through the selection without a secure context', async () => {
    setClipboard(undefined);
    withExecCommand();
    let copied = '';
    execCommand.mockImplementation(() => {
      const area = document.querySelector('textarea');
      copied = area ? area.value.slice(area.selectionStart, area.selectionEnd) : '';
      return true;
    });

    expect(await copyText('Ab3d-Ef4g')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copied).toBe('Ab3d-Ef4g');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('falls back when the clipboard API refuses', async () => {
    setClipboard({ writeText: () => Promise.reject(new Error('denied')) });
    withExecCommand();
    execCommand.mockReturnValue(true);

    expect(await copyText('text')).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('says no when neither way works, so the caller can mark the text', async () => {
    setClipboard(undefined);
    withExecCommand();
    execCommand.mockReturnValue(false);

    expect(await copyText('text')).toBe(false);
  });

  it('puts the text area into the open dialog and gives the focus back', async () => {
    setClipboard(undefined);
    withExecCommand();
    const dialog = document.createElement('dialog');
    const button = document.createElement('button');
    dialog.appendChild(button);
    document.body.appendChild(dialog);
    button.focus();
    let parent: Element | null = null;
    execCommand.mockImplementation(() => {
      parent = document.querySelector('textarea')?.parentElement ?? null;
      return true;
    });

    await copyText('text');
    expect(parent).toBe(dialog);
    expect(document.activeElement).toBe(button);
  });
});
