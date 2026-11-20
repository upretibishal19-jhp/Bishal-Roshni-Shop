import type { Language } from '../types/erp';

// Official Nepal Panchanga BS month days for years 2075 to 2092 BS
// Anchor: 2075-01-01 BS = 2018-04-14 AD
const BS_MONTH_DAYS: Record<number, number[]> = {
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2077: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2085: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2088: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2089: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2091: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2092: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
};

const ANCHOR_AD_MS = Date.UTC(2018, 3, 14); // 2018-04-14 == 2075-01-01 BS
const MS_PER_DAY = 86400000;

export const BS_MONTHS_EN = [
  'Baisakh',
  'Jestha',
  'Ashadh',
  'Shrawan',
  'Bhadra',
  'Ashwin',
  'Kartik',
  'Mangsir',
  'Poush',
  'Magh',
  'Falgun',
  'Chaitra',
];

export const BS_MONTHS_NE = [
  'बैशाख',
  'जेठ',
  'असार',
  'श्रावण',
  'भदौ',
  'असोज',
  'कार्तिक',
  'मंसिर',
  'पौष',
  'माघ',
  'फागुन',
  'चैत्र',
];

const NEPALI_DIGITS = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

export function toNepaliDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => NEPALI_DIGITS[Number(d)] ?? d);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function adToBs(adDateStr: string): string {
  const [y, m, d] = adDateStr.split('-').map(Number);
  if (!y || !m || !d) return '2083-08-02';
  const targetMs = Date.UTC(y, m - 1, d);
  let diffDays = Math.floor((targetMs - ANCHOR_AD_MS) / MS_PER_DAY);
  if (diffDays < 0) return '2075-01-01';

  let bsYear = 2075;
  while (BS_MONTH_DAYS[bsYear]) {
    const months = BS_MONTH_DAYS[bsYear];
    const yearDays = months.reduce((sum, days) => sum + days, 0);
    if (diffDays < yearDays) {
      for (let idx = 0; idx < 12; idx++) {
        if (diffDays < months[idx]) {
          return `${bsYear}-${pad2(idx + 1)}-${pad2(diffDays + 1)}`;
        }
        diffDays -= months[idx];
      }
    }
    diffDays -= yearDays;
    bsYear++;
  }
  return '2092-12-30';
}

export function bsToAd(bsDateStr: string): string {
  const [bsY, bsM, bsD] = bsDateStr.split('-').map(Number);
  if (!bsY || !bsM || !bsD || !BS_MONTH_DAYS[bsY]) {
    return todayAd();
  }
  let totalDays = 0;
  for (let y = 2075; y < bsY; y++) {
    const months = BS_MONTH_DAYS[y];
    if (months) {
      totalDays += months.reduce((s, d) => s + d, 0);
    }
  }
  const months = BS_MONTH_DAYS[bsY];
  for (let m = 0; m < bsM - 1; m++) {
    totalDays += months[m] ?? 30;
  }
  totalDays += bsD - 1;
  const date = new Date(ANCHOR_AD_MS + totalDays * MS_PER_DAY);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function todayAd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function todayBs(): string {
  return adToBs(todayAd());
}

export function addDaysBs(bsDateStr: string, days: number): string {
  const ad = bsToAd(bsDateStr);
  const [y, m, d] = ad.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + days * MS_PER_DAY);
  const nextAd = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  return adToBs(nextAd);
}

export function daysBetweenAd(fromAd: string, toAd: string): number {
  const [y1, m1, d1] = fromAd.split('-').map(Number);
  const [y2, m2, d2] = toAd.split('-').map(Number);
  if (!y1 || !y2) return 0;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_PER_DAY);
}

export function formatBsDate(bsDateStr: string, lang: Language = 'en'): string {
  const [y, m, d] = bsDateStr.split('-').map(Number);
  if (!y || !m || !d) return bsDateStr;
  const monthName = lang === 'ne' ? BS_MONTHS_NE[m - 1] : BS_MONTHS_EN[m - 1];
  if (lang === 'ne') {
    return `${toNepaliDigits(y)} ${monthName} ${toNepaliDigits(d)}`;
  }
  return `${d} ${monthName} ${y} BS`;
}

export function getBsMonthRange(bsDateStr: string): { start: string; end: string } {
  const [y, m] = bsDateStr.split('-').map(Number);
  const days = BS_MONTH_DAYS[y]?.[m - 1] ?? 30;
  return {
    start: `${y}-${pad2(m)}-01`,
    end: `${y}-${pad2(m)}-${pad2(days)}`,
  };
}

export function getBsFiscalYear(bsDateStr: string): string {
  const [y, m] = bsDateStr.split('-').map(Number);
  if (m >= 4) {
    return `${y}/${String(y + 1).slice(-2)}`;
  }
  return `${y - 1}/${String(y).slice(-2)}`;
}

export function getBsFiscalYearRange(bsDateStr: string): { start: string; end: string } {
  const [y, m] = bsDateStr.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  const endYear = startYear + 1;
  const endDays = BS_MONTH_DAYS[endYear]?.[2] ?? 32;
  return {
    start: `${startYear}-04-01`,
    end: `${endYear}-03-${pad2(endDays)}`,
  };
}

// Formats NPR using Nepali numbering system (1,25,000.00)
export function formatNPR(amount: number, lang: Language = 'en'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const abs = Math.abs(safe).toFixed(2);
  const [intPart, decPart] = abs.split('.');
  let formattedInt = intPart;
  if (intPart.length > 3) {
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    formattedInt = `${rest},${last3}`;
  }
  const numStr = `${negative ? '-' : ''}${formattedInt}.${decPart}`;
  if (lang === 'ne') {
    return `रु. ${toNepaliDigits(numStr)}`;
  }
  return `NPR ${numStr}`;
}
