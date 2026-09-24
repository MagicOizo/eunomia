/**
 * One line format for the events an operator needs to find again in the
 * container log. Until now the API logged free-form sentences, which are fine
 * to read but impossible to filter: `docker logs eunomia | grep …` needs a
 * stable token, not a phrase that may be reworded.
 *
 * Every line looks like this and stays on a single line:
 *
 *   eunomia event=MAIL_SEND_FAILED level=error host=smtp.example.com:587 message="Invalid login"
 *
 * `event` comes first after the fixed `eunomia` prefix, so the documented
 * filter is `grep MAIL_SEND_FAILED` (see DEV.md). Values containing spaces,
 * quotes or newlines are quoted and escaped, which keeps one event on one line
 * even when a mail server answers with a multi-line error.
 *
 * Deliberately not a logging library: this is a homelab app writing to stdout,
 * and JSON lines would trade the readability of `docker logs` for a feature
 * (log shipping) nobody has asked for. A field value must never contain a
 * secret — pass the host, the error code and the message, never the password.
 */

export type LogLevel = 'info' | 'warn' | 'error';

/** Field values we accept; `undefined` fields are dropped rather than printed as "undefined". */
export type LogFields = Record<string, string | number | boolean | null | undefined>;

/** Quotes a value when it would otherwise break the one-line key=value shape. */
function formatValue(value: string | number | boolean | null): string {
  const text = String(value);
  if (text === '') return '""';
  if (!/[\s"\\]/.test(text)) return text;
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ')}"`;
}

/** Builds the log line. Exported for the tests, which assert on the format. */
export function formatLogEvent(level: LogLevel, event: string, fields: LogFields = {}): string {
  const parts = [`eunomia event=${event}`, `level=${level}`];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    parts.push(`${key}=${formatValue(value)}`);
  }
  return parts.join(' ');
}

/**
 * Writes one greppable event line. `error` and `warn` go to stderr (where
 * Docker and systemd expect them), `info` to stdout.
 */
export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = formatLogEvent(level, event, fields);
  if (level === 'info') {
    console.log(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.error(line);
  }
}
