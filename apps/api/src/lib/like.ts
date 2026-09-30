/**
 * The free-text searches of the API run through `LIKE`, where `%` and `_` are
 * wildcards. Without escaping them the search answers a question nobody asked:
 * a `%` finds everything, a `_` every single-character match — silently, since
 * the value itself is bound and nothing goes wrong.
 *
 * The escape character is `!`, not the backslash MariaDB uses by default: what
 * a backslash means inside a string literal depends on `NO_BACKSLASH_ESCAPES`,
 * and a search must not hang on a server setting. Every query that takes a term
 * from here therefore writes `LIKE ? ESCAPE '!'`.
 */

const ESCAPED = /[!%_]/g;

/** Wraps a user's search text as a `LIKE` term, wildcards escaped. */
export function likeTerm(text: string): string {
  return `%${text.replace(ESCAPED, (char) => `!${char}`)}%`;
}
