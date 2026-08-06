# Assumptions & calculation model

**Scope:** Project annual and monthly **net salary** from **RAL** (gross annual salary) for a simple Italian employment case.

**Tax year:** 2026  
**UI language:** English (official Italian acronyms retained)

---

## Fixed scenario (per brief)

| Assumption | Choice |
|---|---|
| Contract | Permanent full-time office employee |
| Residence | Milan → **Lombardy** region, **Milan** municipality |
| Special reliefs | None |
| Dependents | None |
| Income mix | Employment income only |
| Work period | Full calendar year |
| Sector | Private-sector employee, standard INPS IVS |

Optional UI control: **12 / 13 / 14 pay periods** — divides annual net only; does not change tax computation.

---

## Pipeline

```
RAL
  −  employee INPS
  =  taxable income (imponibile)
       → IRPEF gross (progressive)
       − employee tax credit (art. 13 TUIR)
       − additional fiscal-wedge credit (if 20–40k)
       = IRPEF net (≥ 0)
       + Lombardy regional surcharge
       + Milan municipal surcharge
  +  cash bonus if taxable ≤ 20k
  =  Net annual
  ÷  pay periods
  =  Net monthly
```

Code: [`src/calc.js`](../src/calc.js).

---

## 1. Employee INPS (social security)

| Parameter | Value |
|---|---|
| Base rate | **9.19%** |
| Additional rate | **+1%** on pay above **€56,224** |
| Ceiling | **€122,295** (2026 massimale, post-1995 careers) |

```
base  = min(RAL, 122_295) × 9.19%
extra = max(0, min(RAL, 122_295) − 56_224) × 1%
INPS  = base + extra
```

**Out of employee net:** employer INPS, INAIL, TFR (company cost).

**Sources:** INPS 2026 circular values (ceiling / +1% threshold); standard private-sector employee rate.

---

## 2. Taxable income

```
taxable = RAL − employee INPS
```

No other deductible charges in this prototype.

---

## 3. IRPEF (national income tax) — 2026

| Bracket | Rate |
|---|---|
| €0 – €28,000 | **23%** |
| €28,000 – €50,000 | **33%** (reduced from 35% in 2026 budget) |
| Over €50,000 | **43%** |

Progressive: each slice taxed at its own rate.

---

## 4. Employee tax credit (art. 13 TUIR)

Applied to taxable income (proxy for *reddito complessivo* under “employment only”).

| Taxable income (TI) | Formula |
|---|---|
| TI ≤ €15,000 | **€1,955** |
| €15,000 < TI ≤ €28,000 | €1,910 + €1,190 × (28,000 − TI) / 13,000 |
| €28,000 < TI ≤ €50,000 | €1,910 × (50,000 − TI) / 22,000 |
| TI > €50,000 | **€0** |

**Extra €65** if €25,000 < TI ≤ €35,000.

---

## 5. Fiscal wedge (L. 207/2024)

### A) Cash bonus if TI ≤ €20,000 (increases net cash)

| Employment income | Rate |
|---|---|
| ≤ €8,500 | 7.1% |
| €8,501 – €15,000 | 5.3% |
| €15,001 – €20,000 | 4.8% |

### B) Additional tax credit if €20,000 < TI ≤ €40,000

| TI | Amount |
|---|---|
| €20,001 – €32,000 | **€1,000** flat |
| €32,001 – €40,000 | €1,000 × (40,000 − TI) / 8,000 |
| > €40,000 | €0 |

---

## 6. Lombardy regional surcharge

Progressive on taxable income:

| Band | Rate |
|---|---|
| €0 – €15,000 | **1.23%** |
| €15,000 – €28,000 | **1.58%** |
| €28,000 – €50,000 | **1.72%** |
| Over €50,000 | **1.73%** |

**Source:** MEF / Regione Lombardia published rates.

---

## 7. Milan municipal surcharge

| Rule | Value |
|---|---|
| Exemption | Full if taxable **≤ €23,000** |
| Above threshold | **0.80%** on entire taxable income (no franchise) |

**Source:** Comune di Milano / MEF (confirmed 0.8%; exemption €23,000).

---

## 8. Net figures

```
total_taxes       = IRPEF_net + regional + municipal
total_withholdings = INPS + total_taxes
net_annual        = RAL − total_withholdings + cash_bonus
net_monthly       = net_annual / pay_periods
```

IRPEF net floored at **0**.

---

## Worked example — RAL €35,000 (13 periods)

| Step | Amount |
|---|---|
| RAL | €35,000.00 |
| INPS 9.19% | − €3,216.50 |
| Taxable | €31,783.50 |
| IRPEF gross | €7,688.56 |
| Employee credit (incl. €65) | − €1,646.52 |
| Fiscal-wedge credit | − €1,000.00 |
| IRPEF net | €5,042.04 |
| Lombardy surcharge | €454.98 |
| Milan surcharge 0.8% | €254.27 |
| **Net annual** | **€26,032.21** |
| **Net monthly (÷13)** | **€2,002.48** |
| Take-home | **74.38%** |

---

## Explicit non-goals

1. TFR / pension fund choice  
2. Employer cost (employer INPS, INAIL, welfare)  
3. Family credits, *assegno unico*  
4. Part-time / fixed-term credit floors  
5. CCNL 14th month, overtime, benefits in kind  
6. Monthly cash timing of regional/municipal advances  
7. Other municipalities / regions  
8. Pre-1996 contributory-ceiling edge cases  
9. Sector-specific rates (e.g. executives)  
10. Commercial payroll rounding schemes  

---

## Sources (research)

| Topic | Source type |
|---|---|
| IRPEF 2026 brackets | Budget law 2026 commentary; Agenzia structure |
| Art. 13 credits | TUIR + Budget 2025/2026 summaries |
| Fiscal wedge | L. 207/2024; Agenzia circular 4/2025 |
| INPS rates / ceiling | INPS circulars 2026 |
| Lombardy surcharge | MEF local tax tables / Regione Lombardia |
| Milan surcharge | Comune di Milano + MEF |
| Domain framing | Jet HR public “net from RAL” explainer |

**Not tax advice.** Educational prototype only.
