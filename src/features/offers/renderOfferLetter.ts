export const OFFER_MERGE_FIELDS = [
  "{{candidate}}",
  "{{position}}",
  "{{rate}}",
  "{{start_date}}",
  "{{company}}",
  "{{signatory}}",
  "{{signatory_title}}",
  "{{accept_url}}",
] as const;

export const DEFAULT_OFFER_COMPANY_NAME = "Your Organization";
export const DEFAULT_OFFER_SIGNATORY_NAME = "Hiring Team";
export const DEFAULT_OFFER_SIGNATORY_TITLE = "Hiring Representative";

export const DEFAULT_OFFER_LETTER_TEMPLATE = `Dear {{candidate}},

We are pleased to offer you the position of {{position}} with {{company}}.

Offer details:
- Position: {{position}}
- Pay rate: {{rate}}
- Start date: {{start_date}}

Please review this offer carefully. You can respond using this secure link:
{{accept_url}}

Sincerely,
{{signatory}}
{{signatory_title}}`;

export type OfferLetterMergeKey =
  | "candidate"
  | "position"
  | "rate"
  | "start_date"
  | "company"
  | "signatory"
  | "signatory_title"
  | "accept_url";

export type OfferLetterMergeValues = Record<OfferLetterMergeKey, string | number | null | undefined>;

export interface OfferLetterSettingsLike {
  offer_company_name?: string | null;
  offer_signatory_name?: string | null;
  offer_signatory_title?: string | null;
  offer_letter_template?: string | null;
}

export interface NormalizedOfferLetterSettings {
  companyName: string;
  signatoryName: string;
  signatoryTitle: string;
  template: string;
}

export interface OfferLetterOfferLike {
  position_title: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clean(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function getOfferLetterSettings(
  settings?: OfferLetterSettingsLike | null,
): NormalizedOfferLetterSettings {
  return {
    companyName: clean(settings?.offer_company_name, DEFAULT_OFFER_COMPANY_NAME),
    signatoryName: clean(settings?.offer_signatory_name, DEFAULT_OFFER_SIGNATORY_NAME),
    signatoryTitle: clean(settings?.offer_signatory_title, DEFAULT_OFFER_SIGNATORY_TITLE),
    template: clean(settings?.offer_letter_template, DEFAULT_OFFER_LETTER_TEMPLATE),
  };
}

export function renderOfferLetter(
  template: string | null | undefined,
  values: OfferLetterMergeValues,
): string {
  let output = escapeHtml(clean(template, DEFAULT_OFFER_LETTER_TEMPLATE));

  for (const key of Object.keys(values) as OfferLetterMergeKey[]) {
    const safeValue = escapeHtml(String(values[key] ?? ""));
    output = output.replace(new RegExp(`{{\\s*${key}\\s*}}`, "g"), safeValue);
  }

  return output;
}

export function renderOfferLetterHtml(
  template: string | null | undefined,
  values: OfferLetterMergeValues,
): string {
  return renderOfferLetter(template, values).replace(/\r?\n/g, "<br />");
}

export function buildOfferLetterValues(params: {
  offer: OfferLetterOfferLike;
  settings?: OfferLetterSettingsLike | null;
  candidateName: string;
  rate: string;
  startDate: string;
  acceptUrl: string;
}): OfferLetterMergeValues {
  const normalized = getOfferLetterSettings(params.settings);
  return {
    candidate: params.candidateName,
    position: params.offer.position_title,
    rate: params.rate,
    start_date: params.startDate,
    company: normalized.companyName,
    signatory: normalized.signatoryName,
    signatory_title: normalized.signatoryTitle,
    accept_url: params.acceptUrl,
  };
}
