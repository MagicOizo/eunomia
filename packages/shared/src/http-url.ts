/**
 * Whether a stored link may be handed to a browser.
 *
 * The question is the SCHEME, and it has to be asked explicitly: zod's
 * `.url()` only asks whether the WHATWG parser accepts the value, which it
 * does for `javascript:`, `data:`, `vbscript:` and `file:` alike. A document
 * link that reaches an `<a href>` or `window.open` therefore passes through
 * here first — on the way in (the API schemas), through the stored rows
 * (migration 017) and at the sink in the web.
 *
 * In the shared package because both sides apply the rule, and a second copy
 * of it would be the one that forgets a scheme.
 *
 * Narrows to `string`, so a caller holding `string | null` can hand the value
 * straight to the sink after asking — without a cast that would put the
 * question back to the reader.
 */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
