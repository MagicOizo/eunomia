import type { SettingKey } from '@eunomia/shared';

/**
 * German labels for the API's payload keys, so a validation error can name the
 * field the user sees ("Bitte „PLZ" ausfüllen.") instead of repeating the
 * server's English sentence. One dictionary for the whole app: the keys are
 * unique across the resources, and a central list is easier to keep complete
 * than labels threaded through every dialog (field-labels.spec.ts checks the
 * master-data configs against it).
 */
export const FIELD_LABELS: Record<string, string> = {
  // Versicherte
  firstname: 'Vorname',
  surname: 'Nachname',
  middlename: 'Zweiter Vorname',
  birthDate: 'Geburtsdatum',
  leadAccountUID: 'Hauptversicherter',
  accountUID: 'Versicherter',

  // Versicherungen
  companyName: 'Name',
  companyUID: 'Versicherung',
  addressStreet: 'Straße',
  addressPostalCode: 'PLZ',
  addressCity: 'Ort',
  serviceHotline: 'Service-Hotline',
  url: 'Website',

  // Leistungserbringer und Abrechnungsdienstleister
  facilityName: 'Name',
  facilityUID: 'Leistungserbringer',
  distanceKm: 'Entfernung',
  agencyName: 'Name',
  agencyUID: 'Abrechnungsdienstleister',
  agencyAccountUID: 'Kontoverbindung',
  bankAccount: 'IBAN',
  bic: 'BIC',
  recipientName: 'Empfänger',

  // Policen
  contractNumber: 'Vertragsnummer',
  contractUID: 'Police',
  contractKind: 'Art',
  contractBegin: 'Vertragsbeginn',
  contractEnd: 'Vertragsende',
  bonusForfeitRule: 'Bonus verfällt',
  claimFreeYearsAtStart: 'Leistungsfreie Jahre bei Beginn',
  claimFreeCountingFromYear: 'Zählbeginn',
  initialMonthlyPremium: 'Monatsbeitrag',
  initialDeductible: 'Selbstbeteiligung',
  initialReimbursementCap: 'Erstattungsobergrenze',
  validFrom: 'Gültig ab',
  validFromYear: 'Gültig ab Jahr',
  monthlyPremium: 'Monatsbeitrag',
  deductible: 'Selbstbeteiligung',
  reimbursementCap: 'Erstattungsobergrenze',
  reimbursementRate: 'Erstattungssatz',
  bonusTiers: 'Bonus-Staffel',
  claimFreeYears: 'Leistungsfreie Jahre',
  bonusAmount: 'Bonus',
  actualBonus: 'Tatsächliche Rückerstattung',
  bonusForfeited: 'Bonus verwirkt',

  // Rechnungen
  invoiceNumber: 'Rechnungsnummer',
  invoiceUID: 'Rechnung',
  invoiceUIDs: 'Rechnungen',
  invoiceDate: 'Rechnungsdatum',
  treatmentDate: 'Behandlungsdatum',
  treatmentDates: 'Behandlungstage',
  invoiceAmount: 'Rechnungsbetrag',
  directPayment: 'Direkt-/Barzahlung',
  transferUntilDate: 'Zahlungsziel',
  transferDate: 'Zahlungsdatum',
  transferSubject: 'Verwendungszweck',
  documentLink: 'Dokument-Link',
  reimbursementClosed: 'Als abgerechnet markiert',
  notCovered: 'Nicht gedeckt',
  notCoveredReason: 'Begründung',

  // Einreichungen, Leistungsabrechnungen, Erstattungen
  submittedDate: 'Einreichungsdatum',
  submissionUID: 'Einreichung',
  billingNumber: 'Abrechnungsnummer',
  billingDate: 'Abrechnungsdatum',
  forfeitsBonus: 'Verwirkt den Bonus',
  objectionDate: 'Widerspruchsdatum',
  objectionResolvedDate: 'Widerspruch erledigt am',
  objectionNote: 'Notiz zum Widerspruch',
  entries: 'Erstattungen',
  receiptNumber: 'Belegnummer',
  reimbursement: 'Erstattung',
  note: 'Notiz',

  // Nutzerverwaltung
  email: 'E-Mail-Adresse',
  password: 'Passwort',
  roleUIDs: 'Rollen',
  status: 'Status',
};

/**
 * What a field has to look like, for the rules the API enforces with a regular
 * expression — its message alone ("Expected a 5-digit postal code") says it in
 * English and in the API's words.
 */
export const FIELD_FORMATS: Record<string, string> = {
  addressPostalCode: 'fünfstellig, z. B. 12345',
  bankAccount: 'nur Großbuchstaben und Ziffern, z. B. DE02120300000000202051',
  bic: '8 oder 11 Zeichen in Großbuchstaben, z. B. COBADEFFXXX',
  documentLink: 'vollständige Internetadresse mit http:// oder https://',
};

/** The German label of a payload key, or the key itself if it has none yet. */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

/**
 * German labels for the system settings (Slice 30). Kept here with the other
 * labels, because both the settings page and an error message about a rejected
 * value need the same words.
 *
 * Keyed by the shared list of setting keys, so a typo or a renamed setting shows
 * up here. Not every key needs a label: the ones the application writes itself
 * (the status of the last send or run) are shown as a sentence, not as a field.
 */
export const SETTING_LABELS: Partial<Record<SettingKey, string>> = {
  'mail.enabled': 'E-Mail-Versand aktiv',
  'mail.host': 'Mailserver',
  'mail.port': 'Port',
  'mail.secure': 'Verschlüsselt ab Verbindungsaufbau (TLS)',
  'mail.authMethod': 'Anmeldeverfahren',
  'mail.user': 'Benutzer',
  'mail.password': 'Passwort',
  'mail.fromAddress': 'Absenderadresse',
  'mail.fromName': 'Absendername',
  'updateCheck.token': 'GitHub-Token (nur Lesezugriff)',
  'reminders.enabled': 'Zahlungserinnerungen aktiv',
  'reminders.hour': 'Uhrzeit des täglichen Laufs (volle Stunde)',
  'reminders.timeZone': 'Zeitzone',
  'reminders.repeatDays': 'Erneut erinnern nach (Tagen)',
  'reminders.appUrl': 'URL dieser Instanz (für den Link in der Mail)',
  'retention.enabled': 'Papierkorb automatisch leeren',
  'retention.trashDays': 'Gelöschtes endgültig entfernen nach (Tagen)',
};

/**
 * The German label of a setting key, or the key itself if it has none — the key
 * arrives as plain text from the server's `details`, so it may be one of the
 * unlabelled ones, or one this version does not know.
 */
export function settingLabel(key: string): string {
  return (SETTING_LABELS as Record<string, string | undefined>)[key] ?? key;
}
