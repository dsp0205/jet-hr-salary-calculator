/**
 * Self-contained verification of the calculation engine.
 * Run: node test/verify.mjs
 */

import {
  calculateNetSalary,
  computeInps,
  progressiveTax,
  computeEmployeeDeduction,
  computeFiscalWedge,
  CONFIG,
  formatEUR,
} from "../src/calc.js";

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

function approx(a, b, tol = 0.02) {
  return Math.abs(a - b) <= tol;
}

console.log("\n═══ Unit checks ═══\n");

// INPS: RAL 30_000 → pure 9.19%, no extra 1%
{
  const i = computeInps(30_000);
  assert(approx(i.total, 30_000 * 0.0919), `INPS on 30k = ${i.total} (expect ${30_000 * 0.0919})`);
  assert(i.additionalContribution === 0, "No +1% below threshold");
}

// INPS: RAL 60_000 → base on 60k + 1% on (60k − 56_224)
{
  const i = computeInps(60_000);
  const expectedBase = 60_000 * 0.0919;
  const expectedExtra = (60_000 - 56_224) * 0.01;
  assert(approx(i.baseContribution, expectedBase), `INPS base 60k = ${i.baseContribution}`);
  assert(approx(i.additionalContribution, expectedExtra), `INPS +1% = ${i.additionalContribution}`);
  assert(approx(i.total, expectedBase + expectedExtra), `INPS total 60k = ${i.total}`);
}

// INPS ceiling
{
  const i = computeInps(200_000);
  assert(i.contributoryBase === CONFIG.inps.ceiling, "Contributory base capped at massimale");
}

// Progressive IRPEF on 40_000
{
  const t = progressiveTax(40_000, CONFIG.irpefBrackets);
  // 28k @ 23% + 12k @ 33%
  const expected = 28_000 * 0.23 + 12_000 * 0.33;
  assert(approx(t.total, expected), `IRPEF on 40k imponibile = ${t.total} (expect ${expected})`);
}

// Detrazione mid band
{
  const d = computeEmployeeDeduction(27_243);
  // 1910 + 1190 * (28000-27243)/13000
  const expected = 1910 + 1190 * ((28000 - 27243) / 13000);
  assert(approx(d.base, expected, 0.05), `Detrazione LD @ 27243 = ${d.base}`);
}

// Cuneo ulteriore detrazione flat
{
  const w = computeFiscalWedge(30_000, 30_000);
  assert(w.kind === "deduction" && w.furtherDeduction === 1000, "Cuneo €1000 flat for RC 30k");
}

// Cuneo bonus low income
{
  const w = computeFiscalWedge(18_000, 18_000);
  assert(w.kind === "bonus" && approx(w.bonus, 18_000 * 0.048), `Bonus 4.8% @ 18k = ${w.bonus}`);
}

// Milano municipal exemption
{
  const r = calculateNetSalary(20_000); // imponibile well under 23k
  assert(r.municipal.exempt === true, "Milano exempt under €23k imponibile");
  assert(r.municipal.total === 0, "Municipal tax is 0 when exempt");
}

console.log("\n═══ End-to-end scenarios ═══\n");

const scenarios = [
  { ral: 25_000, label: "Entry-level" },
  { ral: 30_000, label: "Jet HR public example ballpark" },
  { ral: 35_000, label: "Mid office worker" },
  { ral: 50_000, label: "Senior" },
  { ral: 80_000, label: "High earner (+1% INPS)" },
];

for (const s of scenarios) {
  const r = calculateNetSalary(s.ral, { months: 13 });
  const sum = r.summary;

  // Invariants
  assert(sum.netAnnual > 0, `${s.label}: net > 0`);
  assert(
    approx(sum.netAnnual, sum.ral - sum.totalWithholdings + sum.bonus),
    `${s.label}: net = RAL − withholdings + bonus`
  );
  assert(
    approx(sum.totalWithholdings, sum.inpsTotal + sum.totalTaxes),
    `${s.label}: withholdings = INPS + taxes`
  );
  assert(
    approx(sum.netMonthly * 13, sum.netAnnual, 0.1),
    `${s.label}: monthly × 13 ≈ annual`
  );
  assert(sum.netAnnual < sum.ral || sum.bonus > 0, `${s.label}: net ≤ RAL (unless bonus)`);

  console.log(
    `\n  ${s.label}  RAL ${formatEUR(s.ral)}\n` +
      `    INPS ${formatEUR(sum.inpsTotal)} · IRPEF ${formatEUR(sum.irpefNet)} · ` +
      `Reg ${formatEUR(sum.regionalTotal)} · Com ${formatEUR(sum.municipalTotal)}\n` +
      `    Net annual ${formatEUR(sum.netAnnual)} · monthly ${formatEUR(sum.netMonthly)} · ` +
      `take-home ${sum.takeHomeRate}%`
  );
}

// Jet HR documented walkthrough (their numbers used older mid-bracket 35%
// and slightly different detrazioni — we only check structural alignment)
{
  console.log("\n═══ Alignment check vs Jet HR walkthrough (RAL 30k) ═══\n");
  const r = calculateNetSalary(30_000);
  assert(
    approx(r.imponibile, 27_243, 0.5),
    `Imponibile ≈ 27.243 (got ${r.imponibile}) — matches Jet HR step 1`
  );
  console.log(
    `  Our IRPEF net ${formatEUR(r.irpef.net)} | Our net annual ${formatEUR(r.summary.netAnnual)}`
  );
  console.log(
    "  (Jet HR published ~€22.610 net with older rates; 2026 mid-bracket is 33% not 35%)"
  );
}

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
