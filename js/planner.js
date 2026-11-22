// Budget, rent limit, move cost and the earliest month someone can afford to move.
// Pure functions over a plain "plan" object, so they can be tested without a browser.

export const RENT_ID = "rent";
export const MOVE_SAVING_ID = "move-saving";

export function sum(list, key) { return list.reduce((a, x) => a + (Number(x[key]) || 0), 0); }

export function income(plan) {
  return (Number(plan.pay.net) || 0) + (Number(plan.pay.other) || 0);
}

/** Totals for today's budget and the budget after the move (at the rent being planned for). */
export function budgetTotals(plan, rent = plan.move.rent) {
  const lines = plan.lines;
  const net = income(plan);
  const nowTotal = sum(lines, "now");
  const afterExRent = lines.reduce((a, l) => a + (l.id === RENT_ID ? 0 : Number(l.after) || 0), 0);
  return {
    net, nowTotal, nowLeft: net - nowTotal,
    afterExRent, afterTotal: afterExRent + rent, afterLeft: net - afterExRent - rent,
  };
}

/** The highest rent that fits: the lowest of the switched-on rules. */
export function rentLimit(plan) {
  const r = plan.rules, net = income(plan), gross = Number(plan.pay.gross) || 0;
  const { afterExRent } = budgetTotals(plan);
  const rules = [];
  if (r.budgetOn) rules.push({ key: "budget", label: "What your budget leaves",
    how: `Income minus after-move spending, minus a R${fmt(r.cushion)} cushion`,
    max: net - afterExRent - (Number(r.cushion) || 0) });
  if (r.shareOn) rules.push({ key: "share", label: "Share of income",
    how: `${Math.round(r.sharePct * 100)}% of take-home income`, max: net * r.sharePct });
  if (r.landlordOn) {
    const useGross = r.landlordBasis === "gross" && gross > 0;
    rules.push({ key: "landlord", label: "Landlord check",
      how: `${useGross ? "Gross" : "Take-home"} income at least ${r.landlordMultiple}× the rent`,
      max: (useGross ? gross : net) / r.landlordMultiple });
  }
  if (!rules.length) return { limit: null, binding: null, rules };
  const min = rules.reduce((a, b) => (b.max < a.max ? b : a));
  return { limit: Math.max(0, min.max), binding: min.key, rules };
}

export function fit(rent, limit, stretchPct = 0.1) {
  if (rent == null || limit == null) return "unknown";
  if (rent <= limit) return "fits";
  if (rent <= limit * (1 + stretchPct)) return "stretch";
  return "over";
}

/** Money needed in hand before moving in. deposit: a known amount for one listing (optional). */
export function moveCost(plan, rent = plan.move.rent, deposit = null) {
  const m = plan.move;
  const items = sum(m.items.filter(i => i.on !== false), "amount");
  const dep = deposit != null ? deposit : rent * (Number(m.depositMonths) || 0);
  const overlap = rent * (Number(m.overlapMonths) || 0);
  const contingency = items * (Number(m.contingencyPct) || 0);
  return { deposit: dep, overlap, items, contingency, total: dep + overlap + items + contingency };
}

export function monthlyMoveSaving(plan) {
  const line = plan.lines.find(l => l.id === MOVE_SAVING_ID);
  const fromLine = line ? Number(line.now) || 0 : 0;
  const left = budgetTotals(plan).nowLeft;
  return fromLine + (plan.move.countLeftover ? Math.max(0, left) : 0);
}

export function addMonths(d, n) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
export function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

/**
 * Earliest month the move can happen. Rules: everything (deposit, van, fees) must be in hand at
 * the end of the month BEFORE the move; savings below the floor are never used; the move can't be
 * earlier than next month plus the notice period, or before the place is available.
 * Today's savings count at the end of this month; each later month adds the monthly saving.
 */
export function earliestMove(plan, { rent = plan.move.rent, deposit = null, availableFrom = null, today = new Date(), months = 60 } = {}) {
  const m = plan.move;
  const cost = moveCost(plan, rent, deposit);
  const saving = monthlyMoveSaving(plan);
  const start = monthStart(today);
  let allowed = addMonths(start, 1 + (Number(m.noticeMonths) || 0));
  if (availableFrom) { const a = monthStart(availableFrom); if (a > allowed) allowed = a; }
  const usableNow = (Number(m.savings) || 0) - (Number(m.floor) || 0);
  const rows = [];
  let moveMonth = null;
  for (let i = 0; i < months; i++) {
    const month = addMonths(start, i);
    const usable = usableNow + saving * i;
    rows.push({ month, usable });
    const next = addMonths(month, 1);
    if (!moveMonth && usable >= cost.total && next >= allowed) moveMonth = next;
  }
  const last = rows[rows.length - 1];
  return { cost, saving, usableNow, allowed, moveMonth,
    shortfall: Math.max(0, cost.total - usableNow), monthsToSave: moveMonth ? Math.max(0, monthsBetween(start, moveMonth) - 1) : null,
    shortAtEnd: moveMonth ? 0 : cost.total - last.usable, rows };
}

export function monthsBetween(a, b) { return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth(); }

/** Check one listing against the filters. Each check: pass, fail or unknown. */
export function checkListing(l, f) {
  const c = [];
  if (l.shared) c.push({ k: "Whole unit", s: "fail", why: "Room-by-room or shared let" });
  if (l.type === "commercial" || l.type === "room") c.push({ k: "A home", s: "fail", why: l.type === "commercial" ? "Commercial property" : "A single room" });
  if (f.types.length && l.type && l.type !== "other") c.push({ k: "Type", s: f.types.includes(l.type) ? "pass" : "fail", why: l.type });
  if (f.bedsMin) c.push({ k: "Bedrooms", s: l.beds == null ? "unknown" : l.beds >= f.bedsMin ? "pass" : "fail", why: l.beds == null ? "not stated" : `${l.beds === 0.5 ? "studio" : l.beds}` });
  if (f.maxRent) c.push({ k: "Rent", s: l.rent == null ? "unknown" : l.rent <= f.maxRent ? "pass" : "fail", why: l.rent == null ? "no price" : "" });
  if (f.parkingMin) c.push({ k: "Parking", s: l.parking == null ? "unknown" : l.parking >= f.parkingMin ? "pass" : "fail", why: l.parking == null ? "not stated" : `${l.parking}` });
  if (f.pets) c.push({ k: "Pets", s: l.pets === "yes" ? "pass" : l.pets === "no" ? "fail" : "unknown", why: l.pets === "unknown" ? "ask the agent" : "" });
  if (f.unfurnished) c.push({ k: "Unfurnished", s: l.furnished === "no" ? "pass" : l.furnished === "yes" ? "fail" : l.furnished === "optional" ? "pass" : "unknown", why: l.furnished === "unknown" ? "not stated" : "" });
  const status = c.some(x => x.s === "fail") ? "fail" : c.some(x => x.s === "unknown") ? "unknown" : "pass";
  return { checks: c, status };
}

export function fmt(v, dp = 0) {
  if (v == null || !isFinite(v)) return "–";
  return Number(v).toLocaleString("en-ZA", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
