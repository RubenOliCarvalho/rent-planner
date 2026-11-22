// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { bracketTax, payeMonthly, takeHome, uifMonthly, medicalCreditMonthly } from "../js/tax.js";
import { budgetTotals, rentLimit, moveCost, earliestMove, fit, checkListing, RENT_ID, MOVE_SAVING_ID } from "../js/planner.js";

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test("SARS 2026/27 brackets", () => {
  close(bracketTax(245100), 44118);
  close(bracketTax(780000), 185215 + 0.39 * (780000 - 695800));
  close(bracketTax(2000000), 666339 + 0.45 * 121400);
  assert.equal(bracketTax(-5), 0);
});

test("PAYE and take-home on R65,000 a month", () => {
  // annual 780,000: 218,053 - 17,820 rebate = 200,233 a year
  close(payeMonthly({ gross: 65000 }), 200233 / 12);
  close(uifMonthly(65000), 177.12);
  const t = takeHome({ gross: 65000 });
  close(t.net, 65000 - 200233 / 12 - 177.12);
});

test("Below the tax threshold pays no PAYE", () => {
  assert.equal(payeMonthly({ gross: 8000 }), 0);            // R96,000 a year < R99,000 threshold
  assert.ok(payeMonthly({ gross: 8500 }) > 0);
  assert.equal(payeMonthly({ gross: 12000, age: 66 }), 0);  // R144,000 < R153,250 threshold at 65+
});

test("Retirement deduction and medical credits reduce PAYE", () => {
  const base = payeMonthly({ gross: 40000 });
  close(base - payeMonthly({ gross: 40000, retirement: 3000 }), 3000 * 0.31, 0.5);
  assert.equal(medicalCreditMonthly(1), 376);
  assert.equal(medicalCreditMonthly(3), 376 + 376 + 254);
  close(base - payeMonthly({ gross: 40000, medicalMembers: 2 }), 752);
});

function plan() {
  return {
    pay: { net: 48117.03, other: 0, gross: 65000 },
    lines: [
      { id: RENT_ID, group: "housing", name: "Rent", now: 8475, after: 0 },
      { id: MOVE_SAVING_ID, group: "savings", name: "Saving for the move", now: 5500, after: 1500 },
      { id: "x", group: "food", name: "Everything else", now: 34103.68, after: 31260.33 },
    ],
    rules: { budgetOn: true, cushion: 500, shareOn: true, sharePct: 0.3, landlordOn: true, landlordMultiple: 3, landlordBasis: "net", stretchPct: 0.1 },
    move: { rent: 15000, depositMonths: 2, overlapMonths: 0, noticeMonths: 1, contingencyPct: 0.1, savings: 14904.96, floor: 10000, countLeftover: false,
      items: [{ name: "Van", amount: 5000 }, { name: "Fridge", amount: 5999 }, { name: "Washer", amount: 3999 }, { name: "Microwave", amount: 1000 }] },
  };
}

test("Budget totals and rent limit", () => {
  const p = plan(), b = budgetTotals(p);
  close(b.nowLeft, 48117.03 - 8475 - 5500 - 34103.68);
  close(b.afterLeft, 48117.03 - 1500 - 31260.33 - 15000);
  const r = rentLimit(p);
  close(r.rules.find(x => x.key === "budget").max, 48117.03 - 32760.33 - 500);
  close(r.rules.find(x => x.key === "share").max, 48117.03 * 0.3);
  assert.equal(r.binding, "share");
  assert.equal(fit(15000, r.limit), "stretch");
  assert.equal(fit(14000, r.limit), "fits");
  assert.equal(fit(18000, r.limit), "over");
});

test("Earliest move: same answer as the move planner workbook (Aug 2027)", () => {
  const p = plan();
  close(moveCost(p).total, 30000 + 15998 * 1.1);
  const em = earliestMove(p, { today: new Date(2026, 10, 22) });
  close(em.usableNow, 4904.96);
  assert.equal(em.saving, 5500);
  assert.equal(em.moveMonth.getFullYear(), 2027);
  assert.equal(em.moveMonth.getMonth(), 7);              // August
  // enough cash already: notice period sets the date
  p.move.savings = 100000;
  const now = earliestMove(p, { today: new Date(2026, 10, 22) });
  assert.equal(now.moveMonth.getMonth(), 0);             // Jan 2027 = next month + 1 month notice
  // a listing available later moves the date
  const later = earliestMove(p, { today: new Date(2026, 10, 22), availableFrom: new Date(2027, 2, 1) });
  assert.equal(later.moveMonth.getMonth(), 2);
  // no saving and not enough: never
  p.move.savings = 0; p.lines[1].now = 0;
  assert.equal(earliestMove(p, { today: new Date(2026, 10, 22) }).moveMonth, null);
});

test("Listing checks", () => {
  const f = { types: ["apartment"], bedsMin: 2, maxRent: 15000, parkingMin: 1, pets: true, unfurnished: true };
  let c = checkListing({ type: "apartment", beds: 2, rent: 14000, parking: 1, pets: "yes", furnished: "no" }, f);
  assert.equal(c.status, "pass");
  c = checkListing({ type: "apartment", beds: 2, rent: 14000, parking: null, pets: "unknown", furnished: "no" }, f);
  assert.equal(c.status, "unknown");
  c = checkListing({ type: "apartment", beds: 2, rent: 14000, parking: 1, pets: "no", furnished: "no" }, f);
  assert.equal(c.status, "fail");
  c = checkListing({ type: "house", beds: 3, rent: 14000, parking: 2, pets: "yes", furnished: "no", shared: true }, f);
  assert.equal(c.status, "fail");
  c = checkListing({ type: "commercial", rent: 7000, parking: 2, pets: "unknown", furnished: "unknown" }, { ...f, bedsMin: 0 });
  assert.equal(c.status, "fail");
});
