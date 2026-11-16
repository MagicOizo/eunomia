/**
 * Puts `text` on the clipboard and says whether that worked.
 *
 * Two ways, because the clipboard API exists only in a secure context (https
 * or localhost): an instance reached over plain http under its own name — a
 * dev host from the hosts file, a LAN install without TLS — has no
 * `navigator.clipboard` at all. There the old `execCommand('copy')` still
 * works, deprecated but supported everywhere. Only when both fail does the
 * caller mark the text so a Ctrl+C takes it — what to mark is the caller's to
 * know.
 *
 * Call it straight from the click handler: `execCommand('copy')` needs the
 * user's gesture, and runs before the first `await` here for that reason.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard) return copyThroughSelection(text);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Refused (permissions, a lost gesture): the old way may still be allowed.
    return copyThroughSelection(text);
  }
}

/**
 * Copies through a hidden text area and the selection. The area goes into the
 * open modal dialog when there is one: everything outside a modal `<dialog>`
 * is inert, and a selection there copies nothing.
 */
function copyThroughSelection(text: string): boolean {
  if (typeof document.execCommand !== 'function') return false;
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const host = focused?.closest('dialog') ?? document.body;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'fixed';
  area.style.top = '0';
  area.style.left = '-9999px';
  area.style.opacity = '0';
  host.appendChild(area);
  try {
    area.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
    // Back to the button, so the keyboard user stays where they were.
    focused?.focus();
  }
}
