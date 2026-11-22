// South African PAYE estimate. Pure functions, amounts in rand.
// Table: SARS 2026/27 (1 March 2026 to 28 February 2027), from the SARS rates page and Budget 2026 tax guide.
export const TAX_TABLE = {
  year: "2026/27",
  // [lower bound, marginal rate, tax at the lower bound]
  brackets: [
    [0, 0.18, 0],
    [245100, 0.26, 44118],
    [383100, 0.31, 79998],
    [530200, 0.36, 125599],
    [695800, 0.39, 185215],
    [887000, 0.41, 259783],
    [1878600, 0.45, 666339],
  ],
  rebates: { primary: 17820, secondary: 9765, tertiary: 3249 },   // secondary from 65, tertiary from 75
  retirementPct: 0.275,          // pension / provident / RA deduction limit: share of income...
  retirementCap: 430000,         // ...and rand cap per year (raised from R350,000 in Budget 2026)
  medicalCredit: { main: 376, firstDependant: 376, additional: 254 },  // per month
  uifRate: 0.01,
  uifCapMonthly: 177.12,
};

export function bracketTax(taxable, t = TAX_TABLE) {
  taxable = Math.max(0, taxable);
  for (let i = t.brackets.length - 1; i >= 0; i--) {
    const [lower, rate, base] = t.brackets[i];
    if (taxable > lower) return base + rate * (taxable - lower);
  }
  return 0;
}

export function rebate(age, t = TAX_TABLE) {
  let r = t.rebates.primary;
  if (age >= 65) r += t.rebates.secondary;
  if (age >= 75) r += t.rebates.tertiary;
  return r;
}

export function medicalCreditMonthly(members, t = TAX_TABLE) {
  if (!members || members <= 0) return 0;
  const m = t.medicalCredit;
  return m.main + (members >= 2 ? m.firstDependant : 0) + (members >= 3 ? m.additional * (members - 2) : 0);
}

export function uifMonthly(gross, t = TAX_TABLE) {
  return Math.min(Math.max(0, gross) * t.uifRate, t.uifCapMonthly);
}

/**
 * Monthly PAYE on a regular salary, annualised the way payroll does it.
 * gross: monthly salary. retirement: monthly pension/provident/RA deducted by the employer.
 * medicalMembers: people on a medical aid the employer deducts (gives the medical tax credit).
 */
export function payeMonthly({ gross, retirement = 0, medicalMembers = 0, age = 30 }, t = TAX_TABLE) {
  const annual = Math.max(0, gross) * 12;
  const ded = Math.min(Math.max(0, retirement) * 12, t.retirementPct * annual, t.retirementCap);
  const tax = Math.max(0, bracketTax(annual - ded, t) - rebate(age, t)) / 12;
  return Math.max(0, tax - medicalCreditMonthly(medicalMembers, t));
}

/** Take-home estimate. Medical aid deducted by the employer is not subtracted here: it stays a budget line. */
export function takeHome(p, t = TAX_TABLE) {
  const paye = payeMonthly(p, t);
  const uif = uifMonthly(p.gross, t);
  const retirement = Math.max(0, p.retirement || 0);
  return { gross: p.gross, paye, uif, retirement, net: Math.max(0, p.gross - paye - uif - retirement) };
}
