import {
  DEFAULT_FORMAT,
  type FormatRegion,
  isFormatRegion,
  isLocale,
  type Locale,
} from '@eunomia/shared';

/**
 * The texts of the mails the API writes itself, per language (Slice 82, see
 * Notes/eunomia-plan.md "Paket Lokalisierung"). Everything else the API says is
 * an English message with a code that the web translates; a mail has no web in
 * between, so its words live here.
 *
 * A small typed table rather than the web's vue-i18n: two mails do not need a
 * message format, and functions carry the plural forms and the word order each
 * language wants. German is the schema — `en` has to match `de` key by key.
 * Values arrive already formatted (dates, amounts), so the catalogue knows no
 * format region.
 */

const de = {
  reminder: {
    /** The subject counts the worse group first: "2 überfällige und 1 fällige Zahlung". */
    subject: (overdue: number, due: number): string => {
      const groups = [];
      if (overdue > 0)
        groups.push(
          `${overdue} ${overdue === 1 ? 'überfällige Zahlung' : 'überfällige Zahlungen'}`,
        );
      if (due > 0) groups.push(`${due} ${due === 1 ? 'fällige Zahlung' : 'fällige Zahlungen'}`);
      return `Eunomia: ${groups.join(' und ')}`;
    },
    greeting: (name: string): string => `Hallo ${name},`,
    lead: (count: number): string =>
      count === 1
        ? 'für eine Rechnung steht eine Zahlung an:'
        : 'für die folgenden Rechnungen steht eine Zahlung an:',
    overdueHeading: 'Überfällig:',
    dueHeading: 'Fällig:',
    invoice: (number: string): string => `Rechnung ${number}`,
    noPayee: 'Empfänger nicht erfasst',
    undated: 'ohne Zahlungsziel erfasst',
    overdueSince: (date: string, days: number): string =>
      `fällig war der ${date} (seit ${days} ${days === 1 ? 'Tag' : 'Tagen'} überfällig)`,
    dueToday: (date: string): string => `fällig heute, ${date}`,
    dueIn: (date: string, days: number): string =>
      `fällig am ${date} (in ${days} ${days === 1 ? 'Tag' : 'Tagen'})`,
    openWorkspace: (url: string): string => `Im Arbeitsbereich öffnen: ${url}`,
    footer: [
      'Diese Nachricht kommt von Ihrer Eunomia-Instanz. Die Erinnerungen lassen sich',
      'in den Systemeinstellungen abschalten.',
    ],
  },
  testMail: {
    subject: 'Eunomia: Testnachricht',
    text: [
      'Diese Nachricht bestätigt, dass Eunomia über den eingetragenen Mailserver versenden kann.',
      '',
      'Sie wurde über die Schaltfläche „Testmail senden" in den System-Einstellungen ausgelöst.',
    ],
  },
};

export type MailCatalog = typeof de;

const en: MailCatalog = {
  reminder: {
    subject: (overdue, due) => {
      const groups = [];
      if (overdue > 0)
        groups.push(`${overdue} ${overdue === 1 ? 'overdue payment' : 'overdue payments'}`);
      if (due > 0) groups.push(`${due} ${due === 1 ? 'payment due' : 'payments due'}`);
      return `Eunomia: ${groups.join(' and ')}`;
    },
    greeting: (name) => `Hello ${name},`,
    lead: (count) =>
      count === 1
        ? 'a payment is due for one invoice:'
        : 'payments are due for the following invoices:',
    overdueHeading: 'Overdue:',
    dueHeading: 'Due:',
    invoice: (number) => `Invoice ${number}`,
    noPayee: 'payee not recorded',
    undated: 'recorded without a due date',
    overdueSince: (date, days) =>
      `was due on ${date} (overdue for ${days} ${days === 1 ? 'day' : 'days'})`,
    dueToday: (date) => `due today, ${date}`,
    dueIn: (date, days) => `due on ${date} (in ${days} ${days === 1 ? 'day' : 'days'})`,
    openWorkspace: (url) => `Open the workspace: ${url}`,
    footer: [
      'This message comes from your Eunomia instance. The reminders can be switched',
      'off in the system settings.',
    ],
  },
  testMail: {
    subject: 'Eunomia: test message',
    text: [
      'This message confirms that Eunomia can send mail through the configured mail server.',
      '',
      'It was triggered with the "Send test mail" button in the system settings.',
    ],
  },
};

const CATALOGS: Record<Locale, MailCatalog> = { de, en };

export function mailCatalog(locale: Locale): MailCatalog {
  return CATALOGS[locale];
}

/** A user's own choices, as stored on the profile (`NULL` = follow). */
export interface LocalePreferences {
  locale: string | null;
  formatRegion: string | null;
}

/** The instance's defaults from the system settings. */
export interface LocaleDefaults {
  defaultLocale: string;
  defaultFormat: string | null;
}

/**
 * Language and format of a mail to this user. The web asks the browser after
 * the profile; a mail has no browser, so the instance default comes next, then
 * German. A stored value the lists no longer know (a language removed, a row
 * edited by hand) is skipped like an empty one rather than failing the send.
 */
export function mailLocale(
  user: LocalePreferences,
  defaults: LocaleDefaults,
): { locale: Locale; region: FormatRegion } {
  const locale = [user.locale, defaults.defaultLocale].find(isLocale) ?? 'de';
  const region = [user.formatRegion, defaults.defaultFormat].find(isFormatRegion);
  return { locale, region: region ?? DEFAULT_FORMAT[locale] };
}
