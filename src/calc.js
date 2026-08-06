/**
 * Italy net salary calculator — standard case (tax year 2026)
 *
 * Employee-side pipeline:
 *   RAL (gross annual)
 *   → − employee INPS
 *   → taxable income
 *   → IRPEF gross (progressive)
 *   → − work tax credit (+ fiscal-wedge credit)
 *   → IRPEF net
 *   → + Lombardy regional surcharge
 *   → + Milan municipal surcharge
 *   → (+ cash bonus if taxable ≤ 20k)
 *   = net annual
 *
 * Formulas/sources: docs/ASSUMPTIONS.md
 */

export const TAX_YEAR = 2026;

/** @typedef {{ label: string; upTo: number | null; rate: number }} Bracket */

export const CONFIG = {
  // ── Social security (INPS) ──────────────────────────────────────────
  inps: {
    employeeRate: 0.0919, // standard private-sector employee share
    additionalRate: 0.01, // art. 3-ter L. 438/1992
    additionalThreshold: 56_224, // annual threshold for +1%
    ceiling: 122_295, // massimale contributivo 2026 (post-1995 careers)
  },

  // ── IRPEF 2026 (L. Bilancio 2026: mid bracket 35% → 33%) ───────────
  /** @type {Bracket[]} */
  irpefBrackets: [
    { label: "€0 – €28,000", upTo: 28_000, rate: 0.23 },
    { label: "€28,000 – €50,000", upTo: 50_000, rate: 0.33 },
    { label: "Over €50,000", upTo: null, rate: 0.43 },
  ],

  // ── Detrazione lavoro dipendente (art. 13 TUIR, valori 2025/2026) ──
  employeeDeduction: {
    low: { maxIncome: 15_000, amount: 1_955, minTI: 690 },
    mid: {
      maxIncome: 28_000,
      base: 1_910,
      variable: 1_190,
      span: 13_000, // 28_000 − 15_000
    },
    high: {
      maxIncome: 50_000,
      base: 1_910,
      span: 22_000, // 50_000 − 28_000
    },
    // Extra €65 for incomes in [25k, 35k] (art. 13 TUIR)
    extra65: { min: 25_000, max: 35_000, amount: 65 },
  },

  // ── Cuneo fiscale (L. 207/2024 art. 1 cc. 4–9) ─────────────────────
  // ≤20k: tax-free "somma aggiuntiva" (bonus on payroll)
  // 20k–40k: ulteriore detrazione d'imposta
  fiscalWedge: {
    bonus: [
      { maxIncome: 8_500, rate: 0.071 },
      { maxIncome: 15_000, rate: 0.053 },
      { maxIncome: 20_000, rate: 0.048 },
    ],
    furtherDeduction: {
      flatUpTo: 32_000,
      flatAmount: 1_000,
      taperTo: 40_000,
      taperSpan: 8_000, // 40_000 − 32_000
    },
  },

  // ── Addizionale regionale Lombardia (progressive, same IRPEF base) ─
  /** @type {Bracket[]} */
  lombardiaBrackets: [
    { label: "€0 – €15,000", upTo: 15_000, rate: 0.0123 },
    { label: "€15,000 – €28,000", upTo: 28_000, rate: 0.0158 },
    { label: "€28,000 – €50,000", upTo: 50_000, rate: 0.0172 },
    { label: "Over €50,000", upTo: null, rate: 0.0173 },
  ],

  // ── Addizionale comunale Milano ────────────────────────────────────
  milano: {
    exemptionThreshold: 23_000, // full exemption if imponibile ≤ this
    rate: 0.008, // flat 0.8% above threshold (no franchise)
  },

  defaultMonths: 13, // common for Italian permanent office contracts
};

// ─── Pure helpers ─────────────────────────────────────────────────────

/**
 * Progressive tax over ordered brackets.
 * @param {number} base
 * @param {Bracket[]} brackets
 * @returns {{ total: number; breakdown: { label: string; taxable: number; rate: number; tax: number }[] }}
 */
export function progressiveTax(base, brackets) {
  const breakdown = [];
  let remaining = Math.max(0, base);
  let lower = 0;
  let total = 0;

  for (const b of brackets) {
    const upper = b.upTo ?? Infinity;
    const slice = Math.min(remaining, upper - lower);
    if (slice <= 0 && remaining <= 0) break;
    const taxable = Math.max(0, Math.min(slice, remaining));
    const tax = taxable * b.rate;
    if (taxable > 0) {
      breakdown.push({
        label: b.label,
        taxable: round2(taxable),
        rate: b.rate,
        tax: round2(tax),
      });
      total += tax;
      remaining -= taxable;
    }
    lower = upper;
    if (remaining <= 0) break;
  }

  return { total: round2(total), breakdown };
}

/**
 * INPS employee contribution with +1% above threshold and ceiling.
 * @param {number} ral
 */
export function computeInps(ral) {
  const { employeeRate, additionalRate, additionalThreshold, ceiling } =
    CONFIG.inps;

  const contributoryBase = Math.min(Math.max(0, ral), ceiling);
  const baseContribution = contributoryBase * employeeRate;

  const additionalBase = Math.max(
    0,
    Math.min(contributoryBase, ceiling) - additionalThreshold
  );
  const additionalContribution = additionalBase * additionalRate;

  return {
    contributoryBase: round2(contributoryBase),
    baseRate: employeeRate,
    baseContribution: round2(baseContribution),
    additionalThreshold,
    additionalBase: round2(additionalBase),
    additionalRate,
    additionalContribution: round2(additionalContribution),
    total: round2(baseContribution + additionalContribution),
  };
}

/**
 * Detrazione per redditi da lavoro dipendente (art. 13 TUIR).
 * @param {number} redditoComplessivo  — imponibile IRPEF in this prototype
 */
export function computeEmployeeDeduction(redditoComplessivo) {
  const d = CONFIG.employeeDeduction;
  const rc = Math.max(0, redditoComplessivo);
  let amount = 0;
  let formula = "";

  if (rc <= d.low.maxIncome) {
    // Full-year permanent contract: statutory amount €1,955 (floor €690 non-binding)
    amount = d.low.amount;
    formula = `Flat €${d.low.amount.toLocaleString("en-GB")} (taxable income ≤ €15,000)`;
  } else if (rc <= d.mid.maxIncome) {
    const factor = (d.mid.maxIncome - rc) / d.mid.span;
    amount = d.mid.base + d.mid.variable * factor;
    formula = `€${d.mid.base} + €${d.mid.variable} × (${d.mid.maxIncome.toLocaleString("en-GB")} − TI) / ${d.mid.span.toLocaleString("en-GB")}`;
  } else if (rc <= d.high.maxIncome) {
    const factor = (d.high.maxIncome - rc) / d.high.span;
    amount = d.high.base * factor;
    formula = `€${d.high.base} × (${d.high.maxIncome.toLocaleString("en-GB")} − TI) / ${d.high.span.toLocaleString("en-GB")}`;
  } else {
    amount = 0;
    formula = "No credit (taxable income > €50,000)";
  }

  let extra65 = 0;
  if (rc > d.extra65.min && rc <= d.extra65.max) {
    extra65 = d.extra65.amount;
  }

  const total = round2(Math.max(0, amount) + extra65);
  return {
    base: round2(Math.max(0, amount)),
    extra65,
    total,
    formula,
  };
}

/**
 * Cuneo fiscale: bonus (≤20k) or ulteriore detrazione (20–40k).
 * @param {number} redditoComplessivo
 * @param {number} redditoLavoroDipendente  — same as RC in this prototype
 */
export function computeFiscalWedge(redditoComplessivo, redditoLavoroDipendente) {
  const rc = Math.max(0, redditoComplessivo);
  const rld = Math.max(0, redditoLavoroDipendente);
  const fw = CONFIG.fiscalWedge;

  // Bonus (somma aggiuntiva non imponibile) for RC ≤ 20.000
  if (rc <= 20_000) {
    let rate = 0;
    for (const band of fw.bonus) {
      if (rc <= band.maxIncome) {
        rate = band.rate;
        break;
      }
    }
    const bonus = round2(rld * rate);
    return {
      kind: /** @type {"bonus"} */ ("bonus"),
      rate,
      bonus,
      furtherDeduction: 0,
      description: `Cash bonus ${(rate * 100).toFixed(1)}% of employment income (taxable ≤ €20,000)`,
    };
  }

  // Additional tax credit for 20k < RC ≤ 40k
  const fd = fw.furtherDeduction;
  let further = 0;
  let description = "";

  if (rc <= fd.flatUpTo) {
    further = fd.flatAmount;
    description = `Flat additional credit €${fd.flatAmount.toLocaleString("en-GB")} (taxable ≤ €32,000)`;
  } else if (rc <= fd.taperTo) {
    further = fd.flatAmount * ((fd.taperTo - rc) / fd.taperSpan);
    description = `€1,000 × (€40,000 − TI) / €8,000 (taper 32k–40k)`;
  } else {
    description = "No fiscal-wedge benefit (taxable income > €40,000)";
  }

  return {
    kind: /** @type {"deduction"} */ ("deduction"),
    rate: 0,
    bonus: 0,
    furtherDeduction: round2(Math.max(0, further)),
    description,
  };
}

/**
 * Full annual net salary projection from RAL.
 * @param {number} ral  Gross annual salary
 * @param {{ months?: number }} [opts]
 */
export function calculateNetSalary(ral, opts = {}) {
  const months = opts.months ?? CONFIG.defaultMonths;

  if (!Number.isFinite(ral) || ral < 0) {
    throw new Error("RAL must be a non-negative number");
  }

  // 1. Social security
  const inps = computeInps(ral);

  // 2. Taxable income (simplified: RAL − employee INPS only)
  const imponibile = round2(Math.max(0, ral - inps.total));

  // 3. IRPEF gross
  const irpefGross = progressiveTax(imponibile, CONFIG.irpefBrackets);

  // 4. Deductions
  const employeeDeduction = computeEmployeeDeduction(imponibile);
  const wedge = computeFiscalWedge(imponibile, imponibile);

  const totalDeductions = round2(
    employeeDeduction.total + wedge.furtherDeduction
  );

  // IRPEF cannot go negative; unused deductions are lost (no refund of excess)
  const irpefNet = round2(Math.max(0, irpefGross.total - totalDeductions));

  // 5. Regional surcharge (Lombardia) — progressive on imponibile
  const regional = progressiveTax(imponibile, CONFIG.lombardiaBrackets);

  // 6. Municipal surcharge (Milano) — flat with full exemption threshold
  const municipalExempt = imponibile <= CONFIG.milano.exemptionThreshold;
  const municipal = {
    exempt: municipalExempt,
    rate: CONFIG.milano.rate,
    base: municipalExempt ? 0 : imponibile,
    total: municipalExempt ? 0 : round2(imponibile * CONFIG.milano.rate),
  };

  // 7. Totals
  const totalTaxes = round2(irpefNet + regional.total + municipal.total);
  const totalWithholdings = round2(inps.total + totalTaxes);
  const netAnnual = round2(ral - totalWithholdings + wedge.bonus);
  const netMonthly = round2(netAnnual / months);
  const grossMonthly = round2(ral / months);

  const effectiveTaxRate =
    ral > 0 ? round2((totalWithholdings / ral) * 100) : 0;
  const takeHomeRate = ral > 0 ? round2((netAnnual / ral) * 100) : 0;

  return {
    taxYear: TAX_YEAR,
    inputs: {
      ral: round2(ral),
      months,
      location: "Milan (Lombardy), Italy",
      contract: "Permanent full-time office employee",
    },
    inps,
    imponibile,
    irpef: {
      gross: irpefGross.total,
      brackets: irpefGross.breakdown,
      employeeDeduction,
      fiscalWedge: wedge,
      totalDeductions,
      net: irpefNet,
    },
    regional: {
      total: regional.total,
      brackets: regional.breakdown,
    },
    municipal,
    summary: {
      ral: round2(ral),
      grossMonthly,
      inpsTotal: inps.total,
      irpefNet,
      regionalTotal: regional.total,
      municipalTotal: municipal.total,
      totalTaxes,
      totalWithholdings,
      bonus: wedge.bonus,
      netAnnual,
      netMonthly,
      effectiveTaxRate,
      takeHomeRate,
    },
  };
}

/** @param {number} n */
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** @param {number} n */
export function formatEUR(n) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/** @param {number} rate  0–1 */
export function formatPct(rate) {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rate);
}
