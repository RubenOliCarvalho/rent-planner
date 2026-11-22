// Rent planner app. The plan is kept in this browser (localStorage) so a reload keeps it; nothing is sent anywhere.
import { takeHome, medicalCreditMonthly, TAX_TABLE } from "./tax.js";
import { RENT_ID, MOVE_SAVING_ID, budgetTotals, rentLimit, fit, moveCost, earliestMove, checkListing, monthlyMoveSaving, fmt } from "./planner.js";
import { GROUPS, AREAS, SITES, defaultPlan } from "./defaults.js";

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const R = (v, dp = 0) => (v == null || !isFinite(v) ? "–" : (v < 0 ? "−R " : "R ") + fmt(Math.abs(v), dp));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const monthName = d => d ? d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }) : "–";
const num = v => (v === "" || v == null || isNaN(Number(v)) ? 0 : Number(v));

let plan = defaultPlan();
let listings = [];           // listings sent back from the sites, in memory only
let dirty = false;
let showFailed = false;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}
function getPath(path) { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), plan); }
function setPath(path, v) {
  const ks = path.split("."); let o = plan;
  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
  o[ks[ks.length - 1]] = v;
}
// Saved in this browser only. If storage is blocked (private window, blocked site data) the app still works,
// and falls back to warning before the tab closes.
const STORE_KEY = "rent-planner:plan";
let canStore = true, saveTimer = null;
function savePlan() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(STORE_KEY, JSON.stringify(plan)); dirty = false; }
  catch { canStore = false; showStorageNote(); }
}
function readSavedPlan() {
  try { const s = localStorage.getItem(STORE_KEY); return s ? JSON.parse(s) : null; } catch { canStore = false; return null; }
}
function clearSavedPlan() { try { localStorage.removeItem(STORE_KEY); } catch {} }
function showStorageNote() {
  const el = document.getElementById("privacy");
  if (el) el.innerHTML = `<strong>This browser isn't letting the page save.</strong> Your numbers are gone when you close or reload the tab. Download your plan to keep it.`;
}
function markDirty() { dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(savePlan, 300); }

// ---------------------------------------------------------------------------
// Bound inputs (data-path="pay.net" etc.)
// ---------------------------------------------------------------------------
function fillBound() {
  $$("[data-path]").forEach(el => {
    if (el === document.activeElement) return;
    const v = getPath(el.dataset.path);
    if (el.type === "checkbox") el.checked = !!v;
    else if (el.dataset.pct) el.value = v == null ? "" : +(v * 100).toFixed(2);
    else el.value = v == null || (v === 0 && el.dataset.path !== "pay.age") ? (v === 0 ? "" : "") : v;
  });
  $$("[data-type]").forEach(el => (el.checked = plan.search.types.includes(el.dataset.type)));
  $$("[data-site]").forEach(el => (el.checked = plan.search.sites.includes(el.dataset.site)));
  $("#maxRent").placeholder = (() => { const l = rentLimit(plan).limit; return l ? `Your limit: ${fmt(l)}` : "Your rent limit"; })();
}
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.path) {
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.dataset.path === "search.maxRent") v = el.value === "" ? null : Math.max(0, num(el.value));
    else if (el.dataset.pct) v = num(el.value) / 100;
    else v = Math.max(0, num(el.value));
    setPath(el.dataset.path, v);
    markDirty();
    if (el.dataset.path === "move.rent") syncRentInputs(el);
    update();
  }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.type) {
    const set = new Set(plan.search.types); el.checked ? set.add(el.dataset.type) : set.delete(el.dataset.type);
    plan.search.types = [...set]; markDirty(); renderListings();
  }
  if (el.dataset.site) {
    const set = new Set(plan.search.sites); el.checked ? set.add(el.dataset.site) : set.delete(el.dataset.site);
    plan.search.sites = [...set]; markDirty(); renderSiteLinks();
  }
});

function syncRentInputs(src) {
  $$('[data-path="move.rent"], [data-line-rent]').forEach(el => { if (el !== src) el.value = plan.move.rent || ""; });
}

// ---------------------------------------------------------------------------
// Income estimator
// ---------------------------------------------------------------------------
function renderEstimator() {
  const p = plan.pay;
  if (!p.gross) { $("#estOut").innerHTML = `<p class="sub">Enter your gross salary to see an estimate.</p>`; return; }
  // A rand amount typed into the people-count box would give a huge credit and zero PAYE: ignore it and say so.
  const members = Math.floor(p.medicalMembers || 0);
  const badMembers = members > 20;
  const medMembers = badMembers ? 0 : members;
  const t = takeHome({ gross: p.gross, retirement: p.retirement, medicalMembers: medMembers, age: p.age || 30 });
  const credit = medicalCreditMonthly(medMembers);
  $("#estOut").innerHTML = `${badMembers ? `<p class="sub"><b>Medical aid people is ${members}.</b> That looks like a rand amount, so it is ignored. Enter the number of people covered instead.</p>` : ""}<table>
    <tr><td>Gross salary</td><td class="num">${R(t.gross, 2)}</td></tr>
    <tr><td>PAYE (income tax)${credit ? ` <small>after ${R(credit, 2)} medical tax credit</small>` : ""}</td><td class="num">−${R(t.paye, 2)}</td></tr>
    <tr><td>UIF</td><td class="num">−${R(t.uif, 2)}</td></tr>
    ${t.retirement ? `<tr><td>Pension / RA</td><td class="num">−${R(t.retirement, 2)}</td></tr>` : ""}
    <tr><td><b>Estimated take-home</b></td><td class="num"><b>${R(t.net, 2)}</b></td></tr></table>
    <p class="sub">SARS ${TAX_TABLE.year} tables. Medical aid deducted by your employer is not subtracted here, so keep it as a budget line.
      Your payslip is more accurate: bonuses, fringe benefits and other deductions change it.</p>
    <button class="btn small" id="useEst" type="button">Use ${R(t.net)} as my take-home pay</button>`;
  $("#useEst").onclick = () => { plan.pay.net = Math.round(t.net * 100) / 100; markDirty(); update(); toast("Take-home pay updated"); };
}

// ---------------------------------------------------------------------------
// Budget table
// ---------------------------------------------------------------------------
function renderBudget() {
  const rows = [];
  for (const [g, label] of GROUPS) {
    const lines = plan.lines.map((l, i) => ({ l, i })).filter(x => x.l.group === g);
    const now = lines.reduce((a, x) => a + num(x.l.now), 0);
    const after = lines.reduce((a, x) => a + (x.l.id === RENT_ID ? num(plan.move.rent) : num(x.l.after)), 0);
    rows.push(`<tr class="grp"><td colspan="4">${esc(label)} <span class="gtot">${R(now)} → ${R(after)}</span></td></tr>`);
    for (const { l, i } of lines) {
      const isRent = l.id === RENT_ID, isSave = l.id === MOVE_SAVING_ID;
      const afterVal = isRent ? plan.move.rent : l.after;
      const changed = !isRent && num(l.after) !== num(l.now);
      rows.push(`<tr data-i="${i}" class="${isRent || isSave ? "special" : ""}">
        <td><input type="text" value="${esc(l.name)}" data-line="${i}" data-f="name" aria-label="Line name"
          ${isRent || isSave ? `title="${isRent ? "Rent today, and the rent you plan for after the move" : "What you put aside each month for the move until you move"}"` : ""}></td>
        <td class="num"><input type="number" inputmode="decimal" min="0" step="50" value="${num(l.now) || ""}" data-line="${i}" data-f="now" aria-label="${esc(l.name)} now"></td>
        <td class="num ${changed ? "changed" : ""}"><input type="number" inputmode="decimal" min="0" step="${isRent ? 250 : 50}" value="${num(afterVal) || ""}"
          ${isRent ? "data-line-rent" : `data-line="${i}" data-f="after"`} aria-label="${esc(l.name)} after the move"></td>
        <td>${isRent || isSave ? "" : `<button class="link del" data-del="${i}" type="button" aria-label="Remove ${esc(l.name)}">✕</button>`}</td></tr>`);
    }
    rows.push(`<tr><td colspan="4"><button class="link" data-add="${g}" type="button">+ Add a line</button></td></tr>`);
  }
  $("#budget").innerHTML = `<table class="budget"><thead><tr><th>Line</th><th class="num">Now (R)</th><th class="num">After the move (R)</th><th></th></tr></thead>
    <tbody>${rows.join("")}</tbody><tbody id="budgetTotals"></tbody></table>`;
  renderBudgetTotals();
}
function renderBudgetTotals() {
  const b = budgetTotals(plan);
  const el = $("#budgetTotals"); if (!el) return;
  el.innerHTML = `
    <tr class="tot"><td>Total spending</td><td class="num">${R(b.nowTotal)}</td><td class="num">${R(b.afterTotal)}</td><td></td></tr>
    <tr class="tot"><td>Income</td><td class="num">${R(b.net)}</td><td class="num">${R(b.net)}</td><td></td></tr>
    <tr class="tot"><td>Left over each month</td><td class="num ${b.nowLeft < 0 ? "neg" : ""}">${R(b.nowLeft)}</td>
      <td class="num ${b.afterLeft < 0 ? "neg" : ""}">${R(b.afterLeft)}</td><td></td></tr>`;
  $$(".budget tr.grp").forEach((tr, gi) => {
    const g = GROUPS[gi][0];
    const lines = plan.lines.filter(l => l.group === g);
    const now = lines.reduce((a, l) => a + num(l.now), 0);
    const after = lines.reduce((a, l) => a + (l.id === RENT_ID ? num(plan.move.rent) : num(l.after)), 0);
    tr.querySelector(".gtot").textContent = `${R(now)} → ${R(after)}`;
  });
}
$("#budget").addEventListener("input", e => {
  const el = e.target;
  if (el.hasAttribute("data-line-rent")) {
    plan.move.rent = Math.max(0, num(el.value)); markDirty(); syncRentInputs(el); update(); return;
  }
  const i = el.dataset.line; if (i == null) return;
  const l = plan.lines[i], f = el.dataset.f;
  if (f === "name") l.name = el.value.slice(0, 80);
  else {
    const v = Math.max(0, num(el.value));
    // a line that hasn't been changed for after the move follows the "now" amount
    if (f === "now" && num(l.after) === num(l.now) && l.id !== RENT_ID) {
      l.after = v;
      const a = el.closest("tr").querySelector('[data-f="after"]'); if (a) a.value = v || "";
    }
    l[f] = v;
    el.closest("td.num")?.parentElement.querySelector('td.num:nth-child(3)')?.classList.toggle("changed", l.id !== RENT_ID && num(l.after) !== num(l.now));
  }
  markDirty(); update();
});
$("#budget").addEventListener("click", e => {
  const d = e.target.dataset.del, g = e.target.dataset.add;
  if (d != null) { plan.lines.splice(+d, 1); markDirty(); renderBudget(); update(); }
  if (g) {
    plan.lines.push({ id: `${g}-custom-${Date.now()}`, group: g, name: "", now: 0, after: 0 });
    markDirty(); renderBudget(); update();
    const inputs = $$(`.budget input[data-f="name"]`); inputs[inputs.length - 1]?.focus();
  }
});
$("#copyNow").onclick = () => {
  plan.lines.forEach(l => { if (l.id !== RENT_ID) l.after = l.now; });
  markDirty(); renderBudget(); update(); toast("Copied: after the move now matches today");
};

// ---------------------------------------------------------------------------
// Rent rules, move items, move summary
// ---------------------------------------------------------------------------
function renderRules() {
  const r = plan.rules, rl = rentLimit(plan);
  const all = [
    { key: "budget", on: "budgetOn", label: "What your budget leaves",
      how: `Income minus after-move spending, minus a cushion of R <input type="number" min="0" step="100" data-rule="cushion" value="${r.cushion}">` },
    { key: "share", on: "shareOn", label: "Share of income",
      how: `At most <input type="number" min="1" max="100" step="1" data-rule="sharePct" value="${Math.round(r.sharePct * 100)}">% of take-home income` },
    { key: "landlord", on: "landlordOn", label: "Landlord check",
      how: `<select data-rule="landlordBasis"><option value="gross" ${r.landlordBasis === "gross" ? "selected" : ""}>Gross</option>
        <option value="net" ${r.landlordBasis === "net" ? "selected" : ""}>Take-home</option></select> income at least
        <input type="number" min="1" step="0.5" data-rule="landlordMultiple" value="${r.landlordMultiple}">× the rent
        ${r.landlordBasis === "gross" && !plan.pay.gross ? "<small>No gross salary entered, so take-home is used.</small>" : ""}` },
  ];
  $("#rules").innerHTML = `<div class="rules"><table>${all.map(x => {
    const res = rl.rules.find(y => y.key === x.key);
    return `<tr class="${!r[x.on] ? "off" : rl.binding === x.key ? "binding" : ""}">
      <td><label class="check"><input type="checkbox" data-rule-on="${x.on}" ${r[x.on] ? "checked" : ""}> ${x.label}</label><small>${x.how}</small></td>
      <td class="num">${res ? R(res.max) : "off"}${rl.binding === x.key ? "<small>sets your limit</small>" : ""}</td></tr>`;
  }).join("")}</table></div>`;
}
$("#rules").addEventListener("change", e => {
  const el = e.target;
  if (el.dataset.ruleOn) plan.rules[el.dataset.ruleOn] = el.checked;
  else if (el.dataset.rule === "landlordBasis") plan.rules.landlordBasis = el.value;
  else if (!el.dataset.rule) return;
  markDirty(); update(); renderRules();
});
$("#rules").addEventListener("input", e => {
  const el = e.target, k = el.dataset.rule; if (!k || k === "landlordBasis") return;
  plan.rules[k] = k === "sharePct" ? Math.min(100, Math.max(1, num(el.value))) / 100 : Math.max(k === "landlordMultiple" ? 1 : 0, num(el.value));
  markDirty(); update();
});

function renderItems() {
  $("#items").innerHTML = `<div class="items"><table>${plan.move.items.map((it, i) => `<tr>
    <td><input type="text" value="${esc(it.name)}" data-item="${i}" data-f="name" aria-label="Cost item"></td>
    <td class="num"><input type="number" min="0" step="100" value="${num(it.amount) || ""}" placeholder="0" data-item="${i}" data-f="amount" aria-label="${esc(it.name)} amount"></td>
    <td><button class="link del" data-idel="${i}" type="button" aria-label="Remove">✕</button></td></tr>`).join("")}
    <tr><td colspan="3"><button class="link" id="itemAdd" type="button">+ Add a cost</button></td></tr></table></div>`;
}
$("#items").addEventListener("input", e => {
  const el = e.target, i = el.dataset.item; if (i == null) return;
  if (el.dataset.f === "name") plan.move.items[i].name = el.value.slice(0, 80);
  else plan.move.items[i].amount = Math.max(0, num(el.value));
  markDirty(); update();
});
$("#items").addEventListener("click", e => {
  if (e.target.id === "itemAdd") { plan.move.items.push({ name: "", amount: 0 }); renderItems(); markDirty(); }
  if (e.target.dataset.idel != null) { plan.move.items.splice(+e.target.dataset.idel, 1); renderItems(); markDirty(); update(); }
});

function renderMoveOut(em, rent, atLimit) {
  const c = em.cost, m = plan.move;
  const lines = [
    [`Deposit (${fmt(m.depositMonths, 1)} × ${R(rent)}${atLimit ? ", your limit" : ""})`, c.deposit],
    m.overlapMonths ? [`Paying both rents (${fmt(m.overlapMonths, 1)} months)`, c.overlap] : null,
    ["Items above", c.items],
    [`Contingency (${Math.round(m.contingencyPct * 100)}% of items)`, c.contingency],
  ].filter(Boolean);
  const when = em.moveMonth ? `You can move in <b>${monthName(em.moveMonth)}</b>${em.monthsToSave ? ` after ${em.monthsToSave} month${em.monthsToSave === 1 ? "" : "s"} of saving` : ""}. Pay the deposit by the end of the month before.`
    : em.saving > 0 ? `Not within 5 years at ${R(em.saving)} a month.` : `Add a monthly amount on the <b>Saving for the move</b> line in step 2 (or tick the box above) to see when.`;
  $("#moveOut").innerHTML = `${atLimit ? `<p class="sub">No rent entered, so these figures use your limit of ${R(rent)}.</p>` : ""}<table>${lines.map(([k, v]) => `<tr><td>${k}</td><td class="num">${R(v)}</td></tr>`).join("")}
    <tr class="tot"><td>Cash needed</td><td class="num">${R(c.total)}</td></tr>
    <tr><td>Usable today (savings minus what you keep)</td><td class="num">${R(em.usableNow)}</td></tr>
    <tr><td>Saved each month until the move</td><td class="num">${R(em.saving)}</td></tr></table>
    <p>${when}</p>
    ${em.allowed > new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1) && em.moveMonth && +em.moveMonth === +em.allowed ? `<p class="sub">Your notice period sets this date: the money is ready sooner.</p>` : ""}`;
}

// ---------------------------------------------------------------------------
// Summary bar and overall update
// ---------------------------------------------------------------------------
function update() {
  const b = budgetTotals(plan), rl = rentLimit(plan);
  // With no rent typed in, plan at the limit; a typed rent always takes over.
  const atLimit = !plan.move.rent && rl.limit > 0;
  const rent = atLimit ? rl.limit : plan.move.rent;
  const em = earliestMove(plan, { rent });
  const f = fit(plan.move.rent, rl.limit, plan.rules.stretchPct);
  $("#sNet").textContent = R(b.net);
  $("#sLimit").textContent = R(rl.limit);
  const bind = rl.rules.find(r => r.key === rl.binding);
  $("#sLimitWhy").textContent = bind ? `Set by: ${bind.label.toLowerCase()}` : "Switch on a check in step 3";
  $("#sCash").textContent = R(em.cost.total);
  $("#sCashWhy").textContent = plan.move.rent ? `At ${R(plan.move.rent)} rent` : atLimit ? `At your limit of ${R(rent)}` : "Enter a rent in step 3";
  $("#sWhen").textContent = em.moveMonth ? monthName(em.moveMonth) : "–";
  $("#sWhenWhy").textContent = em.moveMonth ? (em.monthsToSave ? `${em.monthsToSave} months of saving` : "You have enough now") :
    em.saving > 0 ? "Not within 5 years" : "Needs a monthly saving";
  const limitBox = $("#sLimit").parentElement;
  limitBox.className = "sum" + (plan.move.rent && rl.limit != null ? " " + f : "");
  const note = $("#fitNote");
  $("#planRent").placeholder = rl.limit > 0 ? `Your limit: ${fmt(rl.limit)}` : "";
  if (atLimit) { note.className = "note"; note.textContent = `Planning at your limit of ${R(rent)}. Type a rent to plan for a specific amount.`; }
  else if (!plan.move.rent || rl.limit == null) { note.className = "note"; note.textContent = ""; }
  else {
    note.className = "note " + f;
    note.textContent = f === "fits" ? `${R(plan.move.rent)} fits: ${R(rl.limit - plan.move.rent)} under your limit, leaving ${R(b.afterLeft)} a month after the move.`
      : f === "stretch" ? `${R(plan.move.rent)} is a stretch: ${R(plan.move.rent - rl.limit)} over your limit of ${R(rl.limit)}.`
      : `${R(plan.move.rent)} is over your limit of ${R(rl.limit)} by ${R(plan.move.rent - rl.limit)}.`;
  }
  renderBudgetTotals();
  renderEstimator();
  renderMoveOut(em, rent, atLimit);
  // rule amounts change with every number: refresh them unless the person is typing in that table
  if (!$("#rules").contains(document.activeElement)) renderRules();
  else $$("#rules td.num").forEach((td, i) => { const res = rl.rules.find(x => x.key === ["budget", "share", "landlord"][i]); td.firstChild.textContent = res ? R(res.max) : "off"; });
  fillBound();
  renderListings();
}

// ---------------------------------------------------------------------------
// Areas and site searches
// ---------------------------------------------------------------------------
function allAreas() { return [...AREAS, ...plan.search.customAreas]; }
function renderAreas() {
  const groups = {};
  allAreas().forEach(a => (groups[a.group] = groups[a.group] || []).push(a));
  $("#areas").innerHTML = Object.entries(groups).map(([g, list]) => `<div class="grp">${esc(g)}</div>` +
    list.map(a => `<label class="check"><input type="checkbox" data-area="${esc(a.name)}" ${plan.search.areas.includes(a.name) ? "checked" : ""}> ${esc(a.name)}</label>`).join("")).join("");
}
$("#areas").addEventListener("change", e => {
  const n = e.target.dataset.area; if (!n) return;
  const set = new Set(plan.search.areas); e.target.checked ? set.add(n) : set.delete(n);
  plan.search.areas = [...set]; markDirty(); renderSiteLinks();
});
$("#areaAdd").onclick = () => {
  const err = $("#areaErr"); err.textContent = "";
  let u; try { u = new URL($("#areaUrl").value.trim()); } catch { err.textContent = "That isn't a link. Copy the address of a results page."; return; }
  const site = Object.keys(SITES).find(k => SITES[k].host.test(u.hostname));
  if (!site || !/\/to-rent\//.test(u.pathname)) { err.textContent = "Use a Property24 or Private Property 'to rent' results page."; return; }
  const parts = u.pathname.split("/").filter(Boolean);
  const slug = site === "property24" ? parts[1] : parts.filter(p => !/^\d+$/.test(p)).pop();
  const name = (slug || "Area").replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  let a = plan.search.customAreas.find(x => x.name === name);
  if (!a) { a = { name, group: "Added by you", property24: null, privateproperty: null }; plan.search.customAreas.push(a); }
  a[site] = u.origin + u.pathname + u.search;
  if (!plan.search.areas.includes(name)) plan.search.areas.push(name);
  $("#areaUrl").value = ""; markDirty(); renderAreas(); renderSiteLinks(); toast(`${name} added`);
};

function renderSiteLinks() {
  const s = plan.search, out = [];
  const chosen = allAreas().filter(a => s.areas.includes(a.name));
  for (const site of s.sites) {
    for (const a of chosen) if (a[site]) out.push(`<button class="btn small" data-open="${esc(a[site])}" type="button">${esc(a.name)} on ${SITES[site].name} ↗</button>`);
    const missing = chosen.filter(a => !a[site]).map(a => a.name);
    if (missing.length) out.push(`<p class="sub">${esc(missing.join(", "))}: no ${SITES[site].name} link. <button class="link" data-open="${SITES[site].home}" type="button">Search ${SITES[site].name}</button></p>`);
  }
  if (!s.sites.length) out.push(`<p class="sub">Choose at least one site.</p>`);
  else if (!chosen.length) out.push(`<p class="sub">Choose areas on the left, or search the sites directly:</p>` +
    s.sites.map(k => `<button class="btn small" data-open="${SITES[k].home}" type="button">${SITES[k].name} rentals ↗</button>`).join(" "));
  else out.push(`<p class="sub">On the site, set bedrooms and price with its own filters if you like. This page checks the rest.</p>`);
  $("#siteLinks").innerHTML = `<div class="site-links">${out.join("")}</div>`;
}
// opened with window.open (not a plain link) so the site tab can hand listings straight back
$("#siteLinks").addEventListener("click", e => {
  const u = e.target.dataset.open; if (!u) return;
  const w = window.open(u, "_blank");
  if (!w) toast("Your browser blocked the new tab. Allow pop-ups for this page.");
});

// ---------------------------------------------------------------------------
// The "Send to Rent planner" bookmark
// ---------------------------------------------------------------------------
async function setupBookmarklet() {
  const a = $("#bookmarklet");
  a.addEventListener("click", e => { e.preventDefault(); toast("Drag this button onto your bookmarks bar, then click it on Property24 or Private Property"); });
  let src;
  try { src = await (await fetch("js/parsers.js")).text(); }
  catch { a.textContent = "Bookmark unavailable (open this page from a web address)"; return; }
  const app = JSON.stringify(location.origin);
  const runner = `
(function(){var APP=${app};
function box(msg,data){var o=document.getElementById('rp-box');if(o)o.remove();o=document.createElement('div');o.id='rp-box';
o.style.cssText='position:fixed;top:16px;right:16px;z-index:2147483647;max-width:360px;background:#fff;color:#1d1d1b;border:1px solid #888;border-radius:10px;padding:14px 16px;font:14px/1.45 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25)';
var p=document.createElement('div');p.textContent=msg;o.appendChild(p);
if(data){var t=document.createElement('textarea');t.value=data;t.readOnly=true;t.style.cssText='width:100%;height:70px;margin-top:8px;font:11px monospace';o.appendChild(t);setTimeout(function(){t.select()},0)}
var c=document.createElement('button');c.textContent='Close';c.style.cssText='margin-top:8px;padding:4px 12px;cursor:pointer';c.onclick=function(){o.remove()};o.appendChild(c);
document.body.appendChild(o);if(!data)setTimeout(function(){o.remove()},6000)}
var r=RPParse.parseDocument(document,location.href);
if(!r.site){box('Rent planner: open a Property24 or Private Property results page, or a single listing, then click this again.');return}
if(!r.listings.length){box('Rent planner: no listings found on this page. Open a results page or a single listing.');return}
var n=r.listings.length,label=r.kind==='results'?n+' listing'+(n===1?'':'s'):'this listing';
var payload={rp:1,kind:r.kind,site:r.site,from:location.href,listings:r.listings},done=false;
function ack(e){if(e.origin===APP&&e.data&&e.data.rpAck){done=true;window.removeEventListener('message',ack);box('Sent '+label+' to Rent planner. Switch back to its tab.'+(r.kind==='results'?' Next page? Open it and click again.':''))}}
window.addEventListener('message',ack);
try{if(window.opener&&!window.opener.closed)window.opener.postMessage(payload,APP)}catch(e){}
setTimeout(function(){if(done)return;var s='RENTPLANNER:'+JSON.stringify(payload);
function shown(ok){box((ok?'Copied ':'Copy ')+label+' for Rent planner. In Rent planner, open \\'Paste listings\\' and paste.',s)}
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){shown(true)},function(){shown(false)})}else shown(false)},700)})();`;
  a.href = "javascript:" + encodeURIComponent(src + runner);
}

// listings arriving from a site tab this page opened
window.addEventListener("message", e => {
  let host; try { host = new URL(e.origin).hostname; } catch { return; }
  if (!Object.values(SITES).some(s => s.host.test(host))) return;
  if (!e.data || e.data.rp !== 1) return;
  const added = importPayload(e.data);
  try { e.source.postMessage({ rpAck: 1 }, e.origin); } catch {}
  toast(added);
});

$("#pasteGo").onclick = () => {
  const err = $("#pasteErr"); err.textContent = "";
  let t = $("#pasteBox").value.trim();
  if (t.startsWith("RENTPLANNER:")) t = t.slice(12);
  let data; try { data = JSON.parse(t); } catch { err.textContent = "That doesn't look like what the button copies. Click the button on the site again and paste the full text."; return; }
  if (!data || data.rp !== 1) { err.textContent = "That doesn't look like what the button copies."; return; }
  toast(importPayload(data)); $("#pasteBox").value = "";
};

// ---------------------------------------------------------------------------
// Listings
// ---------------------------------------------------------------------------
const SITE_URL = { property24: /^https:\/\/www\.property24\.com\//, privateproperty: /^https:\/\/www\.privateproperty\.co\.za\// };
function clean(l) {
  const n = v => (v == null || v === "" || !isFinite(Number(v)) ? null : Math.max(0, Number(v)));
  const s = (v, max = 200) => (v == null ? null : String(v).slice(0, max));
  const tri = (v, ok) => (ok.includes(v) ? v : "unknown");
  const site = l.site in SITE_URL ? l.site : "manual";
  const url = typeof l.url === "string" && (site === "manual" ? /^https:\/\//.test(l.url) : SITE_URL[site].test(l.url)) ? l.url.slice(0, 400) : null;
  const avail = typeof l.available === "string" && (/^\d{4}-\d{2}-\d{2}$/.test(l.available) || l.available === "now") ? l.available : null;
  return { site, id: s(l.id, 40) || url || `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, url,
    suburb: s(l.suburb, 80), title: s(l.title), type: ["apartment", "townhouse", "house", "room", "commercial", "other"].includes(l.type) ? l.type : "other",
    rent: n(l.rent), beds: n(l.beds), baths: n(l.baths), parking: n(l.parking), size: n(l.size), deposit: n(l.deposit),
    available: avail, pets: tri(l.pets, ["yes", "no", "unknown"]), furnished: tri(l.furnished, ["yes", "no", "optional", "unknown"]),
    shared: !!l.shared, detail: !!l.detail, description: s(l.description, 600) };
}
function importPayload(data) {
  const list = Array.isArray(data.listings) ? data.listings.slice(0, 200).map(clean) : [];
  let added = 0, updated = 0;
  for (const l of list) {
    const old = listings.find(x => x.site === l.site && x.id === l.id);
    if (!old) { listings.push(l); added++; continue; }
    // a single-listing page fills in what the results card left out; never blank out a known value
    for (const [k, v] of Object.entries(l)) {
      if (v == null || v === "unknown" || (k === "shared" && !v)) continue;
      if (!l.detail && ["pets", "furnished"].includes(k) && old.detail) continue;
      old[k] = v;
    }
    updated++;
  }
  renderListings();
  return data.kind === "listing" ? (added ? "Listing added" : "Listing details updated")
    : `${added} listing${added === 1 ? "" : "s"} added${updated ? `, ${updated} updated` : ""}`;
}

$("#manual").addEventListener("submit", e => {
  e.preventDefault();
  const f = new FormData(e.target), err = $("#manualErr"); err.textContent = "";
  const rent = num(f.get("rent"));
  if (!f.get("suburb").trim() || rent <= 0) { err.textContent = "Enter at least the suburb and the rent."; return; }
  const url = (f.get("url") || "").trim();
  if (url && !/^https:\/\//.test(url)) { err.textContent = "The link must start with https://"; return; }
  const site = Object.keys(SITE_URL).find(k => SITE_URL[k].test(url)) || "manual";
  listings.push(clean({ site: "manual", id: null, url: url || null, suburb: f.get("suburb").trim(), title: `${f.get("beds") ? f.get("beds") + " bed " : ""}${site !== "manual" ? "listing" : "rental"} in ${f.get("suburb").trim()}`,
    rent, beds: f.get("beds") || null, parking: f.get("parking") || null, deposit: f.get("deposit") || null,
    pets: f.get("pets"), furnished: f.get("furnished"), available: f.get("available") || null, detail: true }));
  e.target.reset(); renderListings(); toast("Listing added");
});

function renderListings() {
  const host = $("#listings");
  if (!listings.length) { host.innerHTML = `<div class="lhead"><h3>Your listings</h3></div><p class="empty">Listings you send back or add appear here, checked against your filters and budget.</p>`; return; }
  const rl = rentLimit(plan), s = plan.search;
  const f = { types: s.types, bedsMin: num(s.bedsMin), maxRent: s.maxRent ?? rl.limit, parkingMin: num(s.parkingMin), pets: s.pets, unfurnished: s.unfurnished };
  const today = new Date();
  const rows = listings.map((l, i) => {
    const chk = checkListing(l, f), fitS = fit(l.rent, rl.limit, plan.rules.stretchPct);
    let avail = null;
    if (l.available === "now") avail = today; else if (l.available) avail = new Date(l.available + "T00:00:00");
    const em = l.rent ? earliestMove(plan, { rent: l.rent, deposit: l.deposit, availableFrom: avail, today }) : null;
    return { l, i, chk, fitS, em };
  });
  const order = { fits: 0, stretch: 1, over: 2, unknown: 3 };
  rows.sort((a, b) => (a.chk.status === "fail") - (b.chk.status === "fail") || order[a.fitS] - order[b.fitS] || (a.l.rent || 9e9) - (b.l.rent || 9e9));
  const failed = rows.filter(r => r.chk.status === "fail").length;
  const shown = rows.filter(r => showFailed || r.chk.status !== "fail");
  const siteName = k => (SITES[k] ? SITES[k].name : "Added by you");
  host.innerHTML = `<div class="lhead"><h3>Your listings (${shown.length}${failed && !showFailed ? ` of ${rows.length}` : ""})</h3>
    <div>${failed ? `<button class="link" id="toggleFailed" type="button">${showFailed ? "Hide" : "Show"} ${failed} that don't meet your filters</button> · ` : ""}
    <button class="link" id="clearListings" type="button">Clear all</button></div></div>
    <p class="sub">Checked against: max rent ${R(f.maxRent)}${f.bedsMin ? `, ${f.bedsMin}+ bedrooms` : ""}${f.parkingMin ? `, ${f.parkingMin}+ parking` : ""}${f.pets ? ", pets allowed" : ""}${f.unfurnished ? ", unfurnished" : ""}.
      Amber means the listing doesn't say: ask the agent, or open the listing and click the button on it.</p>
    <table class="lst"><thead><tr><th>Budget</th><th>Listing</th><th class="num">Rent</th><th class="num hide-sm">Beds</th><th class="num hide-sm">Parking</th><th>Your must-haves</th><th>Earliest move</th><th></th></tr></thead><tbody>
    ${shown.map(({ l, i, chk, fitS, em }) => `<tr class="${chk.status === "fail" ? "failed" : ""}">
      <td><span class="pill ${fitS}">${{ fits: "fits", stretch: "stretch", over: "over", unknown: "no price" }[fitS]}</span></td>
      <td>${l.url ? `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.title || "Listing")}</a>` : esc(l.title || "Listing")}
        <div class="where">${esc(l.suburb || "")} · ${esc(siteName(l.site))}${l.size ? ` · ${fmt(l.size)} m²` : ""}${l.available ? ` · available ${l.available === "now" ? "now" : new Date(l.available + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}</div></td>
      <td class="num">${R(l.rent)}${l.deposit ? `<small>deposit ${R(l.deposit)}</small>` : ""}</td>
      <td class="num hide-sm">${l.beds == null ? "–" : l.beds === 0.5 ? "studio" : fmt(l.beds, l.beds % 1 ? 1 : 0)}</td>
      <td class="num hide-sm">${l.parking == null ? "–" : fmt(l.parking)}</td>
      <td>${chk.checks.filter(c => !(c.k === "Rent" && c.s === "pass")).map(c => `<span class="pill ${c.s}" title="${esc(c.why || "")}">${esc(c.k)}${c.s === "unknown" ? "?" : c.s === "fail" ? " ✕" : " ✓"}</span>`).join("") || "–"}</td>
      <td>${em ? (em.moveMonth ? monthName(em.moveMonth) : "not in 5 years") : "–"}${em ? `<small>needs ${R(em.cost.total)}</small>` : ""}</td>
      <td><button class="link del" data-ldel="${i}" type="button" aria-label="Remove listing">✕</button></td></tr>`).join("")}
    </tbody></table>`;
}
$("#listings").addEventListener("click", e => {
  if (e.target.id === "toggleFailed") { showFailed = !showFailed; renderListings(); }
  if (e.target.id === "clearListings" && confirm("Remove all listings from this page?")) { listings = []; renderListings(); }
  if (e.target.dataset.ldel != null) { listings.splice(+e.target.dataset.ldel, 1); renderListings(); }
});

// ---------------------------------------------------------------------------
// Download, load and share a plan
// ---------------------------------------------------------------------------
function validPlan(p) {
  const d = defaultPlan();
  if (!p || typeof p !== "object" || !Array.isArray(p.lines)) throw new Error("not a plan");
  const merge = (a, b) => { const o = { ...a }; for (const k of Object.keys(a)) if (b && b[k] !== undefined && typeof b[k] === typeof a[k] || (a[k] === null && b && b[k] !== undefined)) o[k] = b[k]; return o; };
  return {
    v: 1, pay: merge(d.pay, p.pay), rules: merge(d.rules, p.rules),
    move: { ...merge(d.move, p.move), items: Array.isArray(p.move?.items) ? p.move.items.slice(0, 40).map(i => ({ name: String(i.name ?? "").slice(0, 80), amount: Math.max(0, num(i.amount)) })) : d.move.items },
    lines: p.lines.slice(0, 200).map(l => ({ id: String(l.id ?? "").slice(0, 60) || `x-${Math.random()}`, group: GROUPS.some(g => g[0] === l.group) ? l.group : "other",
      name: String(l.name ?? "").slice(0, 80), now: Math.max(0, num(l.now)), after: Math.max(0, num(l.after)) })),
    search: { ...merge(d.search, p.search),
      areas: Array.isArray(p.search?.areas) ? p.search.areas.map(String).slice(0, 100) : [],
      types: Array.isArray(p.search?.types) ? p.search.types.filter(t => ["apartment", "townhouse", "house"].includes(t)) : d.search.types,
      sites: Array.isArray(p.search?.sites) ? p.search.sites.filter(t => t in SITES) : d.search.sites,
      customAreas: Array.isArray(p.search?.customAreas) ? p.search.customAreas.slice(0, 50).map(a => ({ name: String(a.name).slice(0, 60), group: "Added by you",
        property24: SITE_URL.property24.test(a.property24 || "") ? a.property24 : null, privateproperty: SITE_URL.privateproperty.test(a.privateproperty || "") ? a.privateproperty : null })) : [] },
  };
}
function loadPlan(p, msg) { plan = validPlan(p); renderAll(); savePlan(); toast(msg); }

$("#dlPlan").onclick = () => {
  const blob = new Blob([JSON.stringify({ ...plan, savedAt: new Date().toISOString() }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = `rent-plan-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000); dirty = false; toast("Plan downloaded");
};
$("#loadPlan").onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { loadPlan(JSON.parse(await file.text()), "Plan loaded"); } catch { toast("That file isn't a Rent planner plan"); }
  e.target.value = "";
};

const b64 = { enc: u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)) };
async function packPlan(p) {
  const raw = new TextEncoder().encode(JSON.stringify(p));
  if (typeof CompressionStream === "undefined") return "0." + b64.enc(raw);
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
  return "1." + b64.enc(z);
}
async function unpackPlan(s) {
  const [v, data] = s.split(".");
  let bytes = b64.dec(data);
  if (v === "1") bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(bytes));
}
$("#shareLink").onclick = async () => {
  const url = location.origin + location.pathname + "#plan=" + await packPlan(plan);
  try { await navigator.clipboard.writeText(url); toast("Link copied. It holds your numbers: share it only with people you trust."); }
  catch { prompt("Copy this link. It holds your numbers, so share it only with people you trust:", url); }
};
$("#resetPlan").onclick = () => {
  if (!confirm("Clear everything on this page and start again?")) return;
  clearTimeout(saveTimer); clearSavedPlan();
  plan = defaultPlan(); listings = []; dirty = false; renderAll(); toast("Started over");
};
window.addEventListener("beforeunload", e => {
  if (canStore) savePlan();                    // flush a save still waiting on the timer
  if (dirty && !canStore) { e.preventDefault(); e.returnValue = ""; }
});

// ---------------------------------------------------------------------------
function renderAll() { renderBudget(); renderItems(); renderAreas(); renderSiteLinks(); renderRules(); update(); }

async function start() {
  const m = location.hash.match(/^#plan=([01]\.[A-Za-z0-9_-]+)/);
  const saved = readSavedPlan();
  if (saved) { try { plan = validPlan(saved); } catch { clearSavedPlan(); } }
  if (!canStore) showStorageNote();
  renderAll();
  if (m) {
    // don't silently replace a plan already saved in this browser
    if (!saved || confirm("Replace the plan saved in this browser with the one in this link?")) {
      try { loadPlan(await unpackPlan(m[1]), "Plan loaded from the link"); }
      catch { toast("That plan link is incomplete or damaged"); }
    }
    history.replaceState(null, "", location.pathname);   // keep the numbers out of the address bar
  }
  setupBookmarklet();
}
start();

// exposed for the browser tests only
window.__rp = { get plan() { return plan; }, get listings() { return listings; }, importPayload };
