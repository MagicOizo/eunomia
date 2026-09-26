/**
 * German wording the API itself produces. Normally the API answers in English
 * and the UI translates (see error-codes.ts), but two kinds of text leave the
 * server already written out: the payment reminder mails (reminders/message.ts)
 * and the labels the trash shows for a deleted record (domain/trash.ts). Both
 * need the same number and date formats, so they share them here.
 */

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** `45` → `45,00 €`. */
export function germanMoney(value: number): string {
  return money.format(value);
}

/** `2026-10-01` → `01.10.2026`, without pulling the server's locale into it. */
export function germanDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}.${month}.${year}`;
}
