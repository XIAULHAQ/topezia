/**
 * ISO-3166 country -> ISO-4217 currency. Mechanical, objective public fact —
 * one entry per country in lib/countries.ts's COUNTRY_NAMES, so a country the
 * app already knows about never falls through with no currency to convert to.
 *
 * Where a currency is effectively USD in practice (Ecuador; Panama's Balboa
 * is pegged 1:1 and USD is the note in circulation), USD is used — that's
 * what a salary there would actually be quoted in, not a technicality.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  US: "USD", GB: "GBP", IE: "EUR", DE: "EUR", FR: "EUR",
  ES: "EUR", PT: "EUR", IT: "EUR", NL: "EUR", BE: "EUR",
  AT: "EUR", CH: "CHF", LU: "EUR", SE: "SEK", NO: "NOK",
  DK: "DKK", FI: "EUR", IS: "ISK", EE: "EUR", LV: "EUR",
  LT: "EUR", PL: "PLN", CZ: "CZK", SK: "EUR", HU: "HUF",
  RO: "RON", BG: "BGN", HR: "EUR", SI: "EUR", RS: "RSD",
  BA: "BAM", AL: "ALL", GR: "EUR", CY: "EUR", MT: "EUR",
  UA: "UAH", MD: "MDL", TR: "TRY", RU: "RUB",
  KZ: "KZT", AZ: "AZN", AM: "AMD", UZ: "UZS", GE: "GEL",
  CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP",
  CO: "COP", PE: "PEN", UY: "UYU", EC: "USD", CR: "CRC",
  PA: "USD", GT: "GTQ", DO: "DOP",
  IL: "ILS", AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD",
  BH: "BHD", OM: "OMR", JO: "JOD", LB: "LBP",
  EG: "EGP", MA: "MAD", TN: "TND", DZ: "DZD",
  ZA: "ZAR", NG: "NGN", KE: "KES", GH: "GHS", ET: "ETB",
  UG: "UGX", TZ: "TZS", RW: "RWF",
  IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  CN: "CNY", HK: "HKD", TW: "TWD", JP: "JPY", KR: "KRW",
  SG: "SGD", MY: "MYR", ID: "IDR", TH: "THB", VN: "VND",
  PH: "PHP", AU: "AUD", NZ: "NZD",
};

export const currencyOf = (iso: string): string | null => COUNTRY_CURRENCY[iso.toUpperCase()] ?? null;
