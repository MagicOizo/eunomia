/**
 * Puts `text` on the clipboard and says whether that worked. The clipboard API
 * exists only in a secure context and may be refused; the caller then marks
 * the text so a Ctrl+C takes it — what to mark is the caller's to know.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
