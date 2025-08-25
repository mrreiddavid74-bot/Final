// lib/settings-normalize.ts
import type { Settings } from './types'

const num = (v: unknown, d = 0): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : d
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : d
}

const has = (o: any, k: string) => o && Object.prototype.hasOwnProperty.call(o, k)

/**
 * Accepts your uploaded costs JSON (flattened keys like
 * "Sell Multiplier", "Ink Cost sqm", "Kiss Cut On Roll", etc.)
 * and maps them onto our Settings shape. Unknown keys are ignored.
 *
 * We keep everything flexible and use `as any` for CSV-only fields so
 * you don't need to change your TS types to try this out.
 */
export function normalizeSettings(raw: Partial<Settings> & Record<string, any>): Settings & Record<string, any> {
  // Start with whatever the app passed as "settings"
  const out: any = { ...(raw || {}) }

  // ---- Core rates / multipliers ----
  if (has(raw, 'Sell Multiplier')) out.profitMultiplier = num(raw['Sell Multiplier'])
  if (has(raw, 'Ink Cost sqm'))    out.inkElecPerSqm    = num(raw['Ink Cost sqm'])

  // (Legacy aliases still respected)
  if (has(raw, 'inkCostPerSqm')) out.inkElecPerSqm = num(raw['inkCostPerSqm'])

  // ---- Cut-per-sign (vinyl only) ----
  if (has(raw, 'Cost Per Cut Vinyl Only')) out.cutPerSign = num(raw['Cost Per Cut Vinyl Only'])

  // ---- Application tape & white backing (PER LINEAR METRE) ----
  if (has(raw, 'Application Tape Cost per lm')) out.appTapePerLm = num(raw['Application Tape Cost per lm'])
  if (has(raw, 'White Backed Vinyl lm'))       out.whiteBackingPerLm = num(raw['White Backed Vinyl lm'])

  // Leave sqm versions in place if user provides those in the future
  if (has(raw, 'Application Tape Cost per sqm')) out.appTapePerSqm = num(raw['Application Tape Cost per sqm'])
  if (has(raw, 'White Backed Vinyl sqm'))       out.whiteBackingPerSqm = num(raw['White Backed Vinyl sqm'])

  // ---- Margins on signs ----
  if (has(raw, 'Vinyl Sign Margin mm'))     out.vinylMarginMm     = num(raw['Vinyl Sign Margin mm'])
  if (has(raw, 'Substrate Sign Margin mm')) out.substrateMarginMm = num(raw['Substrate Sign Margin mm'])

  // ---- Delivery bands (using your flat ranges) ----
  // We support either new structured delivery or the legacy "base + bands".
  if (!out.delivery) out.delivery = {}
  if (has(raw, 'Delivery Base')) out.delivery.baseFee = num(raw['Delivery Base'])

  const bands: Array<{ maxGirthCm: number; price: number; name: string }> = []
  if (has(raw, 'Postage ≤ 100 cm')) bands.push({ maxGirthCm: 100, price: num(raw['Postage ≤ 100 cm']), name: '≤ 100 cm' })
  if (has(raw, 'Postage ≤ 150 cm')) bands.push({ maxGirthCm: 150, price: num(raw['Postage ≤ 150 cm']), name: '≤ 150 cm' })
  if (has(raw, 'Postage ≤ 200 cm')) bands.push({ maxGirthCm: 200, price: num(raw['Postage ≤ 200 cm']), name: '≤ 200 cm' })
  if (has(raw, 'Postage > 200 cm')) bands.push({ maxGirthCm: Infinity, price: num(raw['Postage > 200 cm']), name: '> 200 cm' })
  if (bands.length) out.delivery.bands = bands

  // ---- Plotter cut setup + per-piece maps (from your CSV labels) ----
  // UI values: None | KissOnRoll | KissOnSheets | CutIndividually | CutAndWeeded
  out.plotterCutSetup = {
    KissOnRoll:      num(raw['Kiss Cut On Roll Setup Fee']),
    KissOnSheets:    num(raw['Kiss Cut On Sheets Setup Fee']),
    CutIndividually: num(raw['Cut Individually Setup Fee']),
    CutAndWeeded:    num(raw['Cut & Weeded Setup Fee']),
  }
  out.plotterCutPerPiece = {
    None:            0,
    KissOnRoll:      num(raw['Kiss Cut On Roll']),
    KissOnSheets:    num(raw['Kiss Cut On Sheets']),
    CutIndividually: num(raw['Cut Individually']),
    CutAndWeeded:    num(raw['Cut & Weeded']),
  }

  // ---- Optional: cutting style uplifts (keep defaults 0 if not provided) ----
  // Standard / Intricate
  if (!out.cuttingStyleUplifts) out.cuttingStyleUplifts = {}
  if (has(raw, 'Cutting Style Standard %'))  out.cuttingStyleUplifts.Standard  = num(raw['Cutting Style Standard %'])  / 100
  if (has(raw, 'Cutting Style Intricate %')) out.cuttingStyleUplifts.Intricate = num(raw['Cutting Style Intricate %']) / 100

  return out as Settings & Record<string, any>
}
