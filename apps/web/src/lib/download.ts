/**
 * Handing the browser a file. The app had no download until the account export
 * (Scheibe 18, SEC-15): everything else it shows, it shows on screen.
 *
 * The file is built here rather than streamed from the API, because every
 * request carries the access token in a header — a plain link to the endpoint
 * would arrive unauthenticated. So the client fetches the JSON like any other
 * answer and turns it into a file, which also lets it pretty-print: an export
 * meant to be read by a person should be readable.
 */

/** Builds a file from `payload` and lets the browser save it under `filename`. */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  // Firefox only follows a click on a link that is in the document.
  document.body.append(link);
  link.click();
  link.remove();
  // Not before the click: revoking it first would cancel the download. A
  // timeout of zero is enough — the browser has the blob by then.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `2026-10-04`, for a file name that sorts by itself. */
export function isoToday(now = new Date()): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}
