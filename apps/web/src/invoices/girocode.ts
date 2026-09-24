/**
 * The EPC QR payload ("GiroCode") for an invoice transfer — EPC069-12, the
 * scheme every German banking app reads: scan it instead of typing IBAN,
 * amount and reference by hand.
 *
 * Built here rather than taken from a package: the payload is a fixed twelve
 * line text block, while the interesting part is what to do when the data does
 * not fit it (names longer than the field, an amount outside the scheme's
 * range, a payload over the byte budget). Those rules are decisions of this
 * application, so they live with its tests. The QR image itself comes from the
 * `qrcode` library, client-side — payment data never reaches a third party.
 */

/** Longest beneficiary name the scheme allows (field AT-21). */
const MAX_NAME = 70;
/** Longest unstructured remittance information (field AT-05). */
const MAX_SUBJECT = 140;
/** The scheme's payload budget, counted in UTF-8 bytes, not characters. */
const MAX_BYTES = 331;
/** Amount range of the scheme (EUR). */
const MIN_AMOUNT = 0.01;
const MAX_AMOUNT = 999999999.99;

export type GirocodeResult =
  /** `payload` is the string to encode as a QR code. */
  | { ok: true; payload: string }
  /** `reason` is a finished German sentence, shown in place of the code. */
  | { ok: false; reason: string };

export interface GirocodeInput {
  /** Beneficiary — the collection agency the invoice is paid to. */
  recipient: string;
  iban: string;
  amount: number;
  /** Verwendungszweck; may be missing, the scheme allows an empty reference. */
  subject: string | null;
}

/** `EUR320.00` — the scheme's amount format, which is not the German one. */
function epcAmount(amount: number): string {
  return `EUR${amount.toFixed(2)}`;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).length;
}

/**
 * Assembles the payload, or explains why it cannot be built. Version `002`
 * leaves the BIC optional inside the EEA, and this application has no BIC to
 * offer, so that line stays empty. Line 12 (beneficiary-to-originator
 * information) is optional and omitted entirely.
 */
export function buildGirocode(input: GirocodeInput): GirocodeResult {
  const iban = input.iban.replace(/\s+/g, '').toUpperCase();
  if (iban === '') {
    return { ok: false, reason: 'Für diese Rechnung ist keine IBAN hinterlegt.' };
  }

  const recipient = input.recipient.trim().slice(0, MAX_NAME);
  if (recipient === '') {
    return { ok: false, reason: 'Für diese Rechnung ist kein Empfänger hinterlegt.' };
  }

  if (!Number.isFinite(input.amount) || input.amount < MIN_AMOUNT || input.amount > MAX_AMOUNT) {
    return { ok: false, reason: 'Der Rechnungsbetrag lässt sich nicht als GiroCode darstellen.' };
  }

  const subject = (input.subject ?? '').trim().slice(0, MAX_SUBJECT);

  const payload = [
    'BCD', // service tag
    '002', // version
    '1', // character set: UTF-8
    'SCT', // SEPA Credit Transfer
    '', // BIC — optional in version 002 within the EEA
    recipient,
    iban,
    epcAmount(input.amount),
    '', // purpose code
    '', // structured remittance (creditor reference)
    subject, // unstructured remittance
  ].join('\n');

  if (utf8Length(payload) > MAX_BYTES) {
    return { ok: false, reason: 'Die Zahlungsdaten sind für einen GiroCode zu lang.' };
  }

  return { ok: true, payload };
}
