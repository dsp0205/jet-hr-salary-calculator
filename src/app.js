/**
 * UI controller — presentation only. Tax logic is in calc.js.
 */

import {
  calculateNetSalary,
  formatEUR,
  formatPct,
  CONFIG,
  TAX_YEAR,
} from "./calc.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $("#calc-form"),
  ral: $("#ral"),
  months: $("#months"),
  results: $("#results"),
  empty: $("#empty-state"),
  error: $("#error"),
  yearBadge: $("#tax-year"),
};

els.yearBadge.textContent = String(TAX_YEAR);
els.ral.value = "35000";
els.months.value = String(CONFIG.defaultMonths);

els.form.addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});

let hasRun = false;
["input", "change"].forEach((evt) => {
  els.ral.addEventListener(evt, () => {
    if (hasRun) run();
  });
  els.months.addEventListener(evt, () => {
    if (hasRun) run();
  });
});

run();
hasRun = true;

function run() {
  els.error.hidden = true;
  const ral = parseMoney(els.ral.value);
  const months = Number(els.months.value) || CONFIG.defaultMonths;

  if (!Number.isFinite(ral) || ral <= 0) {
    showError("Enter a valid RAL greater than zero.");
    return;
  }
  if (ral > 1_000_000) {
    showError("Enter a realistic RAL (max €1,000,000).");
    return;
  }

  try {
    const result = calculateNetSalary(ral, { months });
    render(result);
    els.empty.hidden = true;
    els.results.hidden = false;
  } catch (err) {
    showError(err instanceof Error ? err.message : "Calculation error");
  }
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.hidden = false;
  els.results.hidden = true;
  els.empty.hidden = false;
}

/** Accept 35000, 35,000.50, and European 35.000,50. */
function parseMoney(raw) {
  if (raw == null) return NaN;
  let s = String(raw).trim().replace(/\s/g, "").replace(/€/g, "");
  if (s.includes(",") && s.includes(".")) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  return Number(s);
}

function render(r) {
  const s = r.summary;

  $("#kpi-net-annual").textContent = formatEUR(s.netAnnual);
  $("#kpi-net-monthly").textContent = formatEUR(s.netMonthly);
  $("#kpi-withholdings").textContent = formatEUR(s.totalWithholdings);
  $("#kpi-take-home").textContent = `${s.takeHomeRate.toFixed(1)}%`;
  $("#kpi-months-label").textContent = `over ${r.inputs.months} pay periods`;

  renderBar(s);

  $("#breakdown-body").innerHTML = buildRows(r)
    .map(
      (row) => `
    <tr class="${row.cls || ""}">
      <td>
        <span class="row-label">${row.label}</span>
        ${row.hint ? `<span class="row-hint">${row.hint}</span>` : ""}
      </td>
      <td class="num ${row.sign || ""}">${row.value}</td>
    </tr>`
    )
    .join("");

  $("#irpef-brackets").innerHTML = r.irpef.brackets
    .map(
      (b) => `
    <tr>
      <td>${b.label}</td>
      <td class="num">${formatEUR(b.taxable)}</td>
      <td class="num">${formatPct(b.rate)}</td>
      <td class="num">${formatEUR(b.tax)}</td>
    </tr>`
    )
    .join("");

  $("#regional-brackets").innerHTML = r.regional.brackets
    .map(
      (b) => `
    <tr>
      <td>${b.label}</td>
      <td class="num">${formatEUR(b.taxable)}</td>
      <td class="num">${formatPct(b.rate)}</td>
      <td class="num">${formatEUR(b.tax)}</td>
    </tr>`
    )
    .join("");

  $("#meta-taxable").textContent = formatEUR(r.imponibile);
  $("#meta-location").textContent = r.inputs.location;
  $("#meta-contract").textContent = r.inputs.contract;
}

function buildRows(r) {
  const s = r.summary;
  const rows = [
    {
      label: "RAL — gross annual salary",
      value: formatEUR(s.ral),
      cls: "row-gross",
    },
    {
      label: "Employee social security (INPS)",
      hint: `${formatPct(r.inps.baseRate)} on contributory base${
        r.inps.additionalContribution > 0
          ? ` + ${formatPct(r.inps.additionalRate)} above €${r.inps.additionalThreshold.toLocaleString("en-GB")}`
          : ""
      }`,
      value: `− ${formatEUR(r.inps.total)}`,
      sign: "neg",
    },
  ];

  if (r.inps.additionalContribution > 0) {
    rows.push({
      label: "↳ of which additional 1% contribution",
      hint: `on ${formatEUR(r.inps.additionalBase)}`,
      value: `− ${formatEUR(r.inps.additionalContribution)}`,
      sign: "neg",
      cls: "row-sub",
    });
  }

  rows.push(
    {
      label: "Taxable income",
      hint: "RAL − employee INPS",
      value: formatEUR(r.imponibile),
      cls: "row-mid",
    },
    {
      label: "IRPEF gross (before tax credits)",
      hint: "Progressive brackets 23% / 33% / 43%",
      value: formatEUR(r.irpef.gross),
      sign: "neg",
    },
    {
      label: "Employee work tax credit",
      hint: r.irpef.employeeDeduction.formula,
      value: `+ ${formatEUR(r.irpef.employeeDeduction.total)}`,
      sign: "pos",
    }
  );

  if (r.irpef.fiscalWedge.furtherDeduction > 0) {
    rows.push({
      label: "Additional fiscal-wedge tax credit",
      hint: r.irpef.fiscalWedge.description,
      value: `+ ${formatEUR(r.irpef.fiscalWedge.furtherDeduction)}`,
      sign: "pos",
    });
  }

  rows.push({
    label: "IRPEF net withheld",
    hint: "max(0, IRPEF gross − tax credits)",
    value: `− ${formatEUR(r.irpef.net)}`,
    sign: "neg",
    cls: "row-mid",
  });

  rows.push({
    label: "Lombardy regional IRPEF surcharge",
    hint: "Progressive rates 1.23% – 1.73%",
    value: `− ${formatEUR(r.regional.total)}`,
    sign: "neg",
  });

  rows.push({
    label: "Milan municipal IRPEF surcharge",
    hint: r.municipal.exempt
      ? `Exempt (taxable income ≤ €${CONFIG.milano.exemptionThreshold.toLocaleString("en-GB")})`
      : `${formatPct(r.municipal.rate)} on taxable income`,
    value: r.municipal.exempt
      ? formatEUR(0)
      : `− ${formatEUR(r.municipal.total)}`,
    sign: r.municipal.exempt ? "" : "neg",
  });

  if (r.irpef.fiscalWedge.bonus > 0) {
    rows.push({
      label: "Fiscal-wedge cash bonus",
      hint: r.irpef.fiscalWedge.description,
      value: `+ ${formatEUR(r.irpef.fiscalWedge.bonus)}`,
      sign: "pos",
    });
  }

  rows.push({
    label: "Net annual salary",
    value: formatEUR(s.netAnnual),
    cls: "row-total",
  });

  rows.push({
    label: `Net monthly (${r.inputs.months} pay periods)`,
    value: formatEUR(s.netMonthly),
    cls: "row-total-sub",
  });

  return rows;
}

function renderBar(s) {
  const parts = [
    {
      key: "net",
      label: "Net",
      value: s.netAnnual - s.bonus,
      color: "var(--c-net)",
    },
    { key: "inps", label: "INPS", value: s.inpsTotal, color: "var(--c-inps)" },
    {
      key: "irpef",
      label: "IRPEF",
      value: s.irpefNet,
      color: "var(--c-irpef)",
    },
    {
      key: "add",
      label: "Local surcharges",
      value: s.regionalTotal + s.municipalTotal,
      color: "var(--c-add)",
    },
  ];

  const total = s.ral;
  $("#composition-bar").innerHTML = parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const pct = total > 0 ? (p.value / total) * 100 : 0;
      return `<div class="bar-seg" style="width:${pct}%;background:${p.color}" title="${p.label}: ${formatEUR(p.value)} (${pct.toFixed(1)}%)"></div>`;
    })
    .join("");

  $("#composition-legend").innerHTML = parts
    .filter((p) => p.value > 0)
    .map(
      (p) => `
      <li>
        <span class="swatch" style="background:${p.color}"></span>
        <span>${p.label}</span>
        <strong>${formatEUR(p.value)}</strong>
      </li>`
    )
    .join("");
}
