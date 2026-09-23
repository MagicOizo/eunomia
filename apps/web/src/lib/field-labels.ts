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
  bankAccount: 'IBAN',

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
  invoiceAmount: 'Rechnungsbetrag',
  directPayment: 'Direkt-/Barzahlung',
  transferUntilDate: 'Zahlungsziel',
  transferDate: 'Zahlungsdatum',
  transferSubject: 'Verwendungszweck',
  documentLink: 'Dokument-Link',
  reimbursementClosed: 'Als abgerechnet markiert',

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
};

/** The German label of a payload key, or the key itself if it has none yet. */
export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}
