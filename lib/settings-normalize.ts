// lib/settings-normalize.ts
import type { Settings } from './types'

const num = (v: any, d = 0) => (typeof v === 'number' ? v : Number(v)) || d

/**
 * Accepts either the raw JSON you uploaded (flat CSV-style keys)
 * or a partially-structured Settings object, and returns a
 * normalized Settings with the fields pricing.ts expects.
 */
export function normalizeSettings(raw: any): Settings {
  const s: any = { ...(raw || {}) }

  // ---------- Margins / master caps (keep existing if already present) ----------
  s.vinylMarginMm = num(raw['Vinyl Sign Margin mm'], s.vinylMarginMm)
  s.substrateMarginMm = num(raw['Substrate Sign Margin mm'], s.substrateMarginMm)

  // Optional master caps (0/undefined means "no cap"; handled in pricing.ts)
  if (s.masterMaxPrintWidthMm == null) s.masterMaxPrintWidthMm = num(raw.masterMaxPrintWidthMm)
  if (s.masterMaxCutWidthMm == null) s.masterMaxCutWidthMm = num(raw.masterMaxCutWidthMm)

  // ---------- Ink / multipliers ----------
  s.inkCostPerSqm = num(raw['Ink Cost sqm'], s.inkCostPerSqm)
  s.profitMultiplier = num(raw['Sell Multiplier'], s.profitMultiplier || 1)

  // ---------- Delivery base + postage bands ----------
  const baseFee = num(raw['Delivery Base'], s.delivery?.baseFee)
  const bands: any[] = []

  const p100 = raw['Postage ≤ 100 cm']
  const p150 = raw['Postage ≤ 150 cm']
  const p200 = raw['Postage ≤ 200 cm']
  const p200p = raw['Postage > 200 cm']

  // Use "surcharge" style (base + surcharge) — this matches pricing.ts logic
  if ([p100, p150, p200, p200p].some(v => v != null && v !== '')) {
    bands.push(
        { name: '≤ 100 cm', maxGirthCm: 100, surcharge: num(p100) },
        { name: '≤ 150 cm', maxGirthCm: 150, surcharge: num(p150) },
        { name: '≤ 200 cm', maxGirthCm: 200, surcharge: num(p200) },
        { name: '> 200 cm', maxGirthCm: Infinity, surcharge: num(p200p) },
    )
  }

  s.delivery = s.delivery || {}
  s.delivery.baseFee = baseFee
  if (bands.length) s.delivery.bands = bands

  // ---------- (optional) waste/overlap defaults ----------
  if (s.tileOverlapMm == null) s.tileOverlapMm = num(raw.tileOverlapMm, 0)
  if (s.vinylWasteLmPerJob == null) s.vinylWasteLmPerJob = num(raw.vinylWasteLmPerJob, 0)

  // ---------- Application/white-backing (LM-based) ----------
  s.applicationTapePerLm = num(raw['Application Tape Cost per lm'], s.applicationTapePerLm)
  s.whiteBackingPerLm = num(raw['White Backed Vinyl lm'], s.whiteBackingPerLm)

  // Back-compat if you still use sqm-based charges anywhere
  s.applicationTapePerSqm = num(raw.applicationTapePerSqm, s.applicationTapePerSqm)
  s.whiteBackingPerSqm = num(raw.whiteBackingPerSqm, s.whiteBackingPerSqm)

  // ---------- Plotter cut fees (MATCH select values in the UI) ----------
  s.plotterCutSetup = {
    None: 0,
    KissOnRoll: num(raw['Kiss Cut On Roll Setup Fee']),
    KissOnSheets: num(raw['Kiss Cut On Sheets Setup Fee']),
    CutIndividually: num(raw['Cut Individually Setup Fee']),
    CutAndWeeded: num(raw['Cut & Weeded Setup Fee']),
  }

  // Per-piece fees (qty-based)
  s.plotterCutPerPiece = {
    // When "None", treat as the "Cost Per Cut Vinyl Only"
    None: num(raw['Cost Per Cut Vinyl Only']),
    KissOnRoll: num(raw['Kiss Cut On Roll']),
    KissOnSheets: num(raw['Kiss Cut On Sheets']),
    CutIndividually: num(raw['Cut Individually']),
    CutAndWeeded: num(raw['Cut & Weeded']),
  }

  // ---------- Other optional knobs (kept for compatibility) ----------
  s.setupFee = num(raw.setupFee, s.setupFee || 0)
  s.cutPerSign = num(raw.cutPerSign, s.cutPerSign || 0)

  return s as Settings
}
