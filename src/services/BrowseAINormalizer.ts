// Utilities and types to normalize BrowseAI capturedLists payloads into a canonical CreditReport
export type Bureau = "TransUnion" | "Experian" | "Equifax" | string;

export type Account = {
  bureau: Bureau | null;
  creditor: string | null;
  account_number_mask: string | null;
  high_balance: number | null;
  opened_on: string | null; // ISO
  reported_on: string | null; // ISO
  last_activity_on: string | null; // ISO
  balance: number | null;
  closed_on: string | null; // ISO
  account_rating: string | null;
  description: string | null;
  dispute_status: string | null;
  creditor_type: string | null;
  account_status: string | null;
  payment_status: string | null;
  remarks: string[];
  payment_amount: number | null;
  last_payment_on: string | null; // ISO
  term_length_months: number | null;
  past_due: number | null;
  account_type: string | null;
  payment_frequency: string | null;
  credit_limit: number | null;
  two_year_history: Record<string, "OK" | "U" | "C" | "">;
  days_late_7y: { "30": number; "60": number; "90": number };
  status: string | null;
  position: number | null;
};

export type CreditReport = {
  runId: string;
  collectedAt: string; // ISO
  version: "v1";
  scores: { bureau: Bureau; score: number | null; status: string; position: number }[];
  personalInformation: { position: number; status: string; fields: Record<string, string | null> }[];
  consumerStatements: { bureau: string; statement: string | null; status: string; position: number }[];
  accounts: {
    realEstate: Account[];
    revolving: Account[];
    other: Account[];
  };
  publicRecords: any[];
  collections: any[];
  inquiries: any[];
  creditorsAddresses: any[];
  additional: Record<string, unknown>;
  rawSections: Record<string, unknown>;
};

// Map of truncated/variant keys to canonical section names
const ALIAS_MAP: { pattern: RegExp; canonical: string }[] = [
  { pattern: /^credit\s*score/i, canonical: "credit_scores" },
  { pattern: /^personal\s*inform/i, canonical: "personal_information" },
  { pattern: /^consumer\s*stateme?n?/i, canonical: "consumer_statements" },
  { pattern: /^real\s*estate\s*accounts?/i, canonical: "accounts.real_estate" },
  { pattern: /^revolving\s*accounts?/i, canonical: "accounts.revolving" },
  { pattern: /^public\s*informations?/i, canonical: "public_records" },
  { pattern: /^inquiries\s*credit/i, canonical: "inquiries" },
  { pattern: /^creditors?\s*addresses/i, canonical: "creditor_addresses" },
];

export function stripHtmlPreserve(html: string | null | undefined): { text: string | null; html: string | null } {
  if (!html) return { text: null, html: null };
  try {
    const d = new DOMParser().parseFromString(String(html), "text/html");
    const text = d.body?.textContent?.trim() || "";
    return { text, html: String(html) };
  } catch {
    return { text: String(html), html: String(html) };
  }
}

export function normalizeMoney(v: any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9.-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function normalizeDate(v: any): string | null {
  if (!v) return null;
  const s = String(v).trim();
  // Basic MM/DD/YYYY or M/D/YYYY support
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [_, mm, dd, yyyy] = m;
    const iso = new Date(Number(yyyy), Number(mm) - 1, Number(dd)).toISOString();
    return iso.split(".")[0] + "Z";
  }
  // Try Date.parse
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export function parseScore(raw: string | null | undefined, bureauHint?: Bureau): { bureau: Bureau; score: number | null } | null {
  if (!raw) return null;
  const text = stripHtmlPreserve(raw).text || "";
  const scoreMatch = text.match(/(\d{3})\b/);
  let bureau: Bureau = bureauHint || "";
  if (/transunion/i.test(text)) bureau = "TransUnion";
  if (/experian/i.test(text)) bureau = "Experian";
  if (/equifax/i.test(text)) bureau = "Equifax";
  return { bureau, score: scoreMatch ? Number(scoreMatch[1]) : null };
}

function toCanonicalKey(k: string): string {
  const key = k.trim();
  for (const { pattern, canonical } of ALIAS_MAP) {
    if (pattern.test(key)) return canonical;
  }
  return key;
}

// Very lightweight accounts parser placeholder; extend as needed
function parseAccounts(gridHtml: any, plainText: any): Account[] {
  const out: Account[] = [];
  const source = Array.isArray(plainText) ? plainText : [];
  for (let i = 0; i < source.length; i++) {
    const row = source[i] ?? {};
    const creditor = row.creditor || row.Creditor || null;
    const bureau: Bureau | null = (row.bureau || row.Bureau || null) as any;
    out.push({
      bureau,
      creditor,
      account_number_mask: row.account_number_mask || row.Mask || null,
      high_balance: normalizeMoney(row.high_balance ?? row.HighBalance),
      opened_on: normalizeDate(row.opened_on ?? row.Opened),
      reported_on: normalizeDate(row.reported_on ?? row.Reported),
      last_activity_on: normalizeDate(row.last_activity_on ?? row.LastActivity),
      balance: normalizeMoney(row.balance ?? row.Balance),
      closed_on: normalizeDate(row.closed_on ?? row.Closed),
      account_rating: row.account_rating ?? null,
      description: (stripHtmlPreserve(row.description).text ?? null),
      dispute_status: row.dispute_status ?? null,
      creditor_type: row.creditor_type ?? null,
      account_status: row.account_status ?? row.Status ?? null,
      payment_status: row.payment_status ?? null,
      remarks: Array.isArray(row.remarks) ? row.remarks : [],
      payment_amount: normalizeMoney(row.payment_amount),
      last_payment_on: normalizeDate(row.last_payment_on),
      term_length_months: row.term_length_months != null ? Number(row.term_length_months) : null,
      past_due: normalizeMoney(row.past_due),
      account_type: row.account_type ?? null,
      payment_frequency: row.payment_frequency ?? null,
      credit_limit: normalizeMoney(row.credit_limit ?? row.Limit),
      two_year_history: {},
      days_late_7y: { "30": 0, "60": 0, "90": 0 },
      status: row._STATUS ?? row.status ?? null,
      position: row.Position != null ? Number(row.Position) : null,
    });
  }
  return out;
}

export function normalizeBrowseAI(runId: string, userId: string, payload: any): CreditReport {
  const nowIso = new Date().toISOString();
  const captured = payload?.capturedLists || payload?.items || payload || {};

  const rawSections: Record<string, unknown> = {};
  const additional: Record<string, unknown> = {};

  const scores: CreditReport["scores"] = [];
  const personalInformation: CreditReport["personalInformation"] = [];
  const consumerStatements: CreditReport["consumerStatements"] = [];
  const accounts = { realEstate: [] as Account[], revolving: [] as Account[], other: [] as Account[] };
  const publicRecords: any[] = [];
  const collections: any[] = [];
  const inquiries: any[] = [];
  const creditorsAddresses: any[] = [];

  // Walk sections
  for (const key of Object.keys(captured)) {
    const canonical = toCanonicalKey(key);
    rawSections[canonical] = captured[key];
    switch (canonical) {
      case "credit_scores": {
        const arr = Array.isArray(captured[key]) ? captured[key] : [];
        arr.forEach((v: any, idx: number) => {
          const parsed = parseScore(v?.text ?? v?.html ?? JSON.stringify(v)) || { bureau: "", score: null };
          scores.push({ bureau: parsed.bureau, score: parsed.score, status: v?._STATUS ?? "", position: v?.Position ?? idx });
        });
        break;
      }
      case "personal_information": {
        const arr = Array.isArray(captured[key]) ? captured[key] : [];
        arr.forEach((v: any, idx: number) => {
          const fields: Record<string, string | null> = {};
          Object.keys(v || {}).forEach((fk) => {
            if (fk.startsWith("_") || fk === "Position") return;
            const val = v[fk];
            const clean = typeof val === "string" ? stripHtmlPreserve(val).text : (val == null ? null : String(val));
            fields[fk] = clean;
          });
          personalInformation.push({ position: v?.Position ?? idx, status: v?._STATUS ?? "", fields });
        });
        break;
      }
      case "consumer_statements": {
        const arr = Array.isArray(captured[key]) ? captured[key] : [];
        arr.forEach((v: any, idx: number) => {
          const { text, html } = stripHtmlPreserve(v?.text ?? v?.html ?? "");
          const statement = text && text.trim().length ? text : "NONE REPORTED";
          consumerStatements.push({ bureau: v?.bureau ?? v?.Bureau ?? "", statement, status: v?._STATUS ?? "", position: v?.Position ?? idx });
        });
        break;
      }
      case "accounts.real_estate": {
        accounts.realEstate = parseAccounts(captured[key]?.gridHtml, captured[key]?.plainText ?? captured[key]);
        break;
      }
      case "accounts.revolving": {
        accounts.revolving = parseAccounts(captured[key]?.gridHtml, captured[key]?.plainText ?? captured[key]);
        break;
      }
      case "public_records":
        publicRecords.push(captured[key]);
        break;
      case "inquiries":
        inquiries.push(captured[key]);
        break;
      case "creditor_addresses":
        creditorsAddresses.push(captured[key]);
        break;
      default:
        additional[canonical] = captured[key];
    }
  }

  return {
    runId,
    collectedAt: nowIso,
    version: "v1",
    scores,
    personalInformation,
    consumerStatements,
    accounts,
    publicRecords,
    collections,
    inquiries,
    creditorsAddresses,
    additional,
    rawSections,
  };
}
