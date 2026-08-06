# Net Salary Calculator (RAL → Net)

Estimate **annual and monthly net pay** from **gross annual salary (RAL)** for a standard Italian employment case, with a full breakdown of employee-side withholdings.

| | |
|---|---|
| **Live** | https://dsp0205.github.io/jet-hr-salary-calculator/ |
| **Tax year** | 2026 |
| **UI** | English (domain acronyms: RAL, INPS, IRPEF) |

---

## What it does

**Input:** RAL (€), optional pay periods (12 / 13 / 14)

**Output:**
- Net annual and net monthly salary  
- Total withholdings and take-home rate  
- Line items: INPS, IRPEF, tax credits, Lombardy regional surcharge, Milan municipal surcharge  
- IRPEF and regional bracket detail  

**Fixed scenario:**
- Permanent full-time office employee  
- Tax residence: Milan (Lombardy)  
- No special reliefs or dependents  
- Employment income only  

---

## How it calculates

```
RAL (gross annual)
  −  employee INPS (social security)
  ─────────────────────────────────
  =  taxable income
       → IRPEF gross (23% / 33% / 43%)
       − employee tax credit + fiscal-wedge credit
       = IRPEF net
       + Lombardy regional surcharge
       + Milan municipal surcharge
  ─────────────────────────────────
  (+ cash bonus if taxable ≤ €20k)
  = Net annual  ÷  pay periods  =  Net monthly
```

| Component | Rate / rule (2026) |
|-----------|---------------------|
| Employee INPS | 9.19%; +1% above €56,224; ceiling €122,295 |
| IRPEF | Progressive 23% / 33% / 43% |
| Employee tax credit | Art. 13 TUIR formulas |
| Fiscal wedge | Cash bonus ≤€20k, or extra credit €20k–€40k |
| Lombardy surcharge | Progressive 1.23% – 1.73% |
| Milan surcharge | 0.80%; exempt if taxable ≤ €23,000 |

Full formulas and sources: **[docs/ASSUMPTIONS.md](./docs/ASSUMPTIONS.md)**.

---

## Project structure

```
├── index.html          # UI
├── styles.css
├── src/
│   ├── calc.js         # Calculation engine
│   └── app.js          # UI wiring
├── docs/
│   └── ASSUMPTIONS.md  # Rates, formulas, sources, scope
└── test/
    └── verify.mjs      # Automated checks
```

---

## Run locally

```bash
npx --yes serve -l 5173
# open http://localhost:5173

node test/verify.mjs
```

Static site (ES modules). Do not open `index.html` via `file://`.

### Deploy (Vercel)

| Setting | Value |
|---------|--------|
| Framework | Other |
| Root Directory | `./` |
| Build / Install / Output | empty |
| Env vars | none |

### Deploy (GitHub Pages)

Workflow: [`.github/workflows/pages.yml`](./.github/workflows/pages.yml) deploys `main` to Pages.

---

## Sample results (13 pay periods, Milan)

| RAL | Net annual | Net monthly | Take-home |
|-----|------------|-------------|-----------|
| €25,000 | €20,569.65 | €1,582.28 | 82.3% |
| €30,000 | €23,425.52 | €1,801.96 | 78.1% |
| €35,000 | €26,032.21 | €2,002.48 | 74.4% |
| €50,000 | €32,567.77 | €2,505.21 | 65.1% |
| €80,000 | €47,338.56 | €3,641.43 | 59.2% |

---

## Out of scope

- Severance (TFR), benefits, overtime  
- Dependent / family tax credits  
- Under-30, impatriate, or other special reliefs  
- Employer cost (employer INPS, INAIL)  
- Other regions/municipalities  
- Certified payroll parity  

Not tax advice.
