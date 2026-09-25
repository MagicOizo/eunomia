import { FIELD_FORMATS, fieldLabel, settingLabel } from './field-labels';

/**
 * German sentences for what the API reports. The API answers in English (its
 * messages are for API clients and logs); the UI never shows those. Two
 * sources are translated here:
 *
 * - `VALIDATION_ERROR` carries zod issues, which are turned into a sentence
 *   from the issue's `code` and the field's German label.
 * - Every other failure carries a specific error code (apps/api
 *   src/lib/error-codes.ts) plus the data its sentence needs in `details`.
 */

/** The parts of a zod issue this translation uses (zod 3 shapes). */
interface ZodIssueLike {
  code?: string;
  path?: Array<string | number>;
  validation?: string;
  type?: string;
  minimum?: number;
  maximum?: number;
  received?: string;
}

type Details = Record<string, unknown>;

const quoted = (label: string): string => `„${label}“`;

/** The field a zod issue belongs to: the last named segment of its path. */
function keyOf(issue: ZodIssueLike): string {
  const named = (issue.path ?? []).filter((part): part is string => typeof part === 'string');
  return named[named.length - 1] ?? '';
}

function tooSmall(issue: ZodIssueLike, label: string): string {
  const min = issue.minimum ?? 0;
  if (issue.type === 'string') {
    return min <= 1
      ? `Bitte ${quoted(label)} ausfüllen.`
      : `${quoted(label)} muss mindestens ${min} Zeichen haben.`;
  }
  if (issue.type === 'array') return `Bitte mindestens einen Eintrag bei ${quoted(label)} angeben.`;
  return `${quoted(label)} darf nicht kleiner als ${min} sein.`;
}

function tooBig(issue: ZodIssueLike, label: string): string {
  const max = issue.maximum ?? 0;
  if (issue.type === 'string') return `${quoted(label)} darf höchstens ${max} Zeichen haben.`;
  if (issue.type === 'array') return `${quoted(label)} darf höchstens ${max} Einträge haben.`;
  return `${quoted(label)} darf höchstens ${max} sein.`;
}

function invalidString(issue: ZodIssueLike, key: string, label: string): string {
  switch (issue.validation) {
    case 'email':
      return `${quoted(label)} ist keine gültige E-Mail-Adresse.`;
    case 'url':
      return `${quoted(label)} muss eine vollständige Internetadresse sein (mit https://).`;
    case 'date':
    case 'datetime':
      return `${quoted(label)} ist kein gültiges Datum.`;
    default: {
      const format = FIELD_FORMATS[key];
      return format
        ? `Bitte ${quoted(label)} im richtigen Format angeben (${format}).`
        : `${quoted(label)} hat nicht das erwartete Format.`;
    }
  }
}

/** One validation issue as a German sentence. */
export function describeIssue(issue: ZodIssueLike): string {
  const key = keyOf(issue);
  const label = fieldLabel(key);

  switch (issue.code) {
    case 'invalid_type':
      return issue.received === 'undefined' || issue.received === 'null'
        ? `Bitte ${quoted(label)} ausfüllen.`
        : `${quoted(label)} hat ein unerwartetes Format.`;
    case 'too_small':
      return tooSmall(issue, label);
    case 'too_big':
      return tooBig(issue, label);
    case 'invalid_string':
      return invalidString(issue, key, label);
    case 'invalid_date':
      return `${quoted(label)} ist kein gültiges Datum.`;
    default:
      return `Die Angabe bei ${quoted(label)} ist nicht zulässig.`;
  }
}

/** Invoice numbers (or other names) the server named, as a readable list. */
function list(value: unknown): string {
  return Array.isArray(value) ? value.map(String).join(', ') : '';
}

/** The German noun for a resource the API reports as missing. */
const RESOURCE_NAMES: Record<string, string> = {
  Account: 'Der Versicherte',
  Allocation: 'Die Erstattung',
  'Collection agency': 'Der Abrechnungsdienstleister',
  Contract: 'Die Police',
  'Contract terms': 'Die Konditionen',
  Exclusion: 'Die Markierung',
  Facility: 'Der Leistungserbringer',
  'Insurance company': 'Die Versicherung',
  Invoice: 'Die Rechnung',
  'Invoice in submission': 'Die Rechnung in dieser Einreichung',
  Premium: 'Der Beitragsstand',
  Resource: 'Der Eintrag',
  'Service billing': 'Die Leistungsabrechnung',
  Submission: 'Die Einreichung',
  User: 'Der Nutzer',
};

/**
 * Premium and terms share the history rules but not their grammar
 * ("Konditionen können …" vs "Ein Beitragsstand kann …").
 */
const historyClause = (details: Details): string =>
  details.kind === 'terms' ? 'Konditionen können' : 'Ein Beitragsstand kann';

const CODE_MESSAGES: Record<string, (details: Details) => string> = {
  NOT_FOUND: (d) =>
    `${RESOURCE_NAMES[String(d.resource)] ?? 'Der Eintrag'} wurde nicht gefunden. Vielleicht ist der Eintrag inzwischen gelöscht.`,
  DUPLICATE_VALUE: () => 'Es gibt bereits einen Eintrag mit diesem Wert.',
  STILL_REFERENCED: () => 'Der Eintrag wird noch verwendet und kann deshalb nicht gelöscht werden.',
  MISSING_REFERENCE: () => 'Ein verknüpfter Eintrag existiert nicht mehr.',
  BAD_REQUEST: () => 'Die Anfrage war nicht gültig.',
  CONFLICT: () => 'Die Aktion ist im aktuellen Zustand nicht möglich.',
  INTERNAL: () => 'Auf dem Server ist ein Fehler aufgetreten.',

  // Anmeldung und Ersteinrichtung
  INVALID_CREDENTIALS: () => 'E-Mail oder Passwort ist falsch.',
  INVALID_REFRESH_TOKEN: () => 'Die Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  UNAUTHENTICATED: () => 'Bitte melde dich erneut an.',
  FORBIDDEN: () => 'Dazu fehlt dir die Berechtigung.',
  SETUP_DISABLED: () => 'Die Ersteinrichtung ist deaktiviert.',
  INVALID_SETUP_TOKEN: () => 'Das Setup-Token ist ungültig.',
  SETUP_ALREADY_DONE: () => 'Die Ersteinrichtung ist bereits abgeschlossen.',

  // Rechnungen, Einreichungen, Abrechnungen
  INVOICES_UNKNOWN: (d) => `Diese Rechnungen gibt es nicht mehr: ${list(d.invoices)}.`,
  INVOICES_WRONG_ACCOUNT: (d) =>
    `Diese Rechnungen gehören nicht zum Versicherten der Police: ${list(d.invoices)}.`,
  INVOICES_ALREADY_SUBMITTED: (d) =>
    `Diese Rechnungen liegen bei dieser Police bereits: ${list(d.invoices)}.`,
  INVOICES_EXCLUDED: (d) =>
    `Diese Rechnungen sind bei dieser Police als nicht erstattungsfähig markiert: ${list(d.invoices)}.`,
  INVOICES_ALREADY_BILLED: (d) =>
    `Diese Rechnungen sind bereits als abgerechnet markiert: ${list(d.invoices)}.`,
  INVOICES_NOT_SUBMITTED_HERE: (d) =>
    `Diese Rechnungen sind bei der Police dieser Leistungsabrechnung nicht eingereicht: ${list(d.invoices)}.`,
  REIMBURSEMENT_EXCEEDS_INVOICE: (d) =>
    `Die Erstattungen würden den Rechnungsbetrag übersteigen: ${list(d.invoices)}.`,
  INVOICE_AMOUNT_BELOW_REIMBURSED: () =>
    'Der Rechnungsbetrag kann nicht unter die bereits erstatteten Beträge sinken.',
  INVOICE_NOT_SUBMITTED: () =>
    'Nur eine eingereichte Rechnung kann als abgerechnet markiert werden.',
  INVOICE_ALREADY_SUBMITTED: () => 'Die Rechnung ist bei dieser Police bereits eingereicht.',
  INVOICE_ALREADY_EXCLUDED: () =>
    'Die Rechnung ist bei dieser Police bereits als nicht erstattungsfähig markiert.',
  CONTRACT_ACCOUNT_MISMATCH: () =>
    'Die Police gehört zu einem anderen Versicherten als die Rechnung.',
  INVOICE_HAS_REIMBURSEMENT: () =>
    'Für diese Rechnung wurde bei dieser Police bereits eine Erstattung gebucht, sie kann nicht mehr zurückgezogen werden.',
  BILLING_NUMBER_TAKEN: (d) =>
    `Die Leistungsabrechnung ${d.billingNumber} gibt es bei dieser Police schon.`,

  // Policen
  HISTORY_BEFORE_CONTRACT: (d) => `${historyClause(d)} nicht vor dem Vertragsbeginn starten.`,
  HISTORY_AFTER_CONTRACT: (d) => `${historyClause(d)} nicht nach dem Vertragsende starten.`,
  HISTORY_START_EXISTS: (d) =>
    d.kind === 'terms'
      ? 'Für dieses Jahr gibt es bereits Konditionen.'
      : 'Für dieses Datum gibt es bereits einen Beitragsstand.',
  YEAR_OUTSIDE_CONTRACT: () => 'Das Jahr liegt außerhalb der Vertragslaufzeit.',
  INVALID_YEAR: () => 'Bitte ein gültiges Jahr angeben.',

  // Nutzerverwaltung
  SELF_ACCOUNT_ACTION: () => 'Diese Aktion ist für das eigene Konto nicht möglich.',
  LAST_ADMIN: () => 'Der letzte aktive Administrator kann nicht entfernt oder deaktiviert werden.',

  // System-Einstellungen und E-Mail-Versand
  SETTING_UNKNOWN: () =>
    'Diese Einstellung kennt die Anwendung nicht. Bitte die Seite neu laden und es erneut versuchen.',
  SETTING_READONLY: () =>
    'Diese Angabe schreibt die Anwendung selbst, sie kann nicht gesetzt werden.',
  SETTING_INVALID_VALUE: (d) =>
    typeof d.key === 'string'
      ? `Der Wert für ${quoted(settingLabel(d.key))} passt nicht.`
      : 'Der Wert passt nicht zu dieser Einstellung.',
  SETTINGS_ENCRYPTION_UNAVAILABLE: () =>
    'Ohne den Schlüssel CONFIG_ENCRYPTION_KEY in der Server-Umgebung können Passwörter und Token nicht gespeichert werden.',
  MAIL_NOT_CONFIGURED: () =>
    'Der E-Mail-Versand ist nicht vollständig eingerichtet. Bitte Aktivierung, Mailserver und Absenderadresse prüfen.',
  MAIL_SEND_FAILED: (d) =>
    typeof d.reason === 'string'
      ? `Der Mailserver hat den Versand abgelehnt: ${d.reason}`
      : 'Der Versand über den eingetragenen Mailserver ist fehlgeschlagen.',
};

/** The German sentence for an error code, or null if the code is unknown here. */
export function describeCode(code: string, details: unknown): string | null {
  const build = CODE_MESSAGES[code];
  if (!build) return null;
  return build(typeof details === 'object' && details !== null ? (details as Details) : {});
}
