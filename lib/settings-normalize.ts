// lib/settings-normalize.ts
import { DEFAULT_SETTINGS } from './defaults'
import type { Settings } from './types'

const toNum = (v: unknown, d = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[^\d.+-eE]/g, ''))
    return Number.isFinite(n) ? n : d
  }
  return d
}

// strip BOM + trim keys, drop empty keys/values
const cleanFlatObject = (o: Record<string, unknown> | undefined | null): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  if (!o || typeof o !== 'object') return out
  for (const [rawK, v] of Object.entries(o)) {
    const k = (rawK || '').replace(/^\uFEFF/, '').trim()
    if (!k) continue
    if (v === '' || v == null) continue
    out[k] = v
  }
  return out
}

// very light “flatten”: if caller sticks costs under different props, we merge them
const buildFlatCosts = (s: Record<string, unknown>): Record<string, unknown> => {
  // Accept any of these shapes:
  // - settings.costs (your uploaded JSON parked here by API)
  // - settings.flatCosts (already-flat map)
  // - settings (keys directly on the object)
  const merged: Record<string, unknown> = {
    ...cleanFlatObject(s as any),
    ...cleanFlatObject((s as any).costs),
    ...cleanFlatObject((s as any).flatCosts),
  }
  return merged
}

const getNum = (flat: Record<string, unknown>, key: string, d = 0): number =>
    Object.prototype.hasOwnProperty.call(flat, key) ? toNum(flat[key], d) : d

export function normalizeSettings(input: Partial<Settings> & Record<string, unknown>): Settings {
  // Start from defaults, then overlay whatever the caller passed
  const s: Settings & Record<string, unknown> = {
    ...DEFAULT_SETTINGS,
    ...(input as any),
  }

  // Build cleaned flat cost map
  const flat = buildFlatCosts(input as any)

  // --- Map well-known CSV fields to Settings ---
  // Core rates
  s.profitMultiplier = getNum(flat, 'Sell Multiplier', s.profitMultiplier ?? 1.8)
  s.inkElecPerSqm    = getNum(flat, 'Ink Cost sqm',   s.inkElecPerSqm    ?? s.inkCostPerSqm ?? 0)

  // Margins
  s.vinylMarginMm     = getNum(flat, 'Vinyl Sign Margin mm',     s.vinylMarginMm ?? 5)
  s.substrateMarginMm = getNum(flat, 'Substrate Sign Margin mm', s.substrateMarginMm ?? 5)

  // Application tape & white backing (linear)
  ;(s as any).applicationTapePerLm = getNum(flat, 'Application Tape Cost per lm', (s as any).applicationTapePerLm ?? 0)
  ;(s as any).whiteBackingPerLm    = getNum(flat, 'White Backed Vinyl lm',       (s as any).whiteBackingPerLm ?? 0)

  // Plotter cut tables
  ;(s as any).plotterCutSetup = {
    KissOnRoll:      getNum(flat, 'Kiss Cut On Roll Setup Fee',     0),
    KissOnSheets:    getNum(flat, 'Kiss Cut On Sheets Setup Fee',   0),
    CutIndividually: getNum(flat, 'Cut Individually Setup Fee',     0),
    CutAndWeeded:    getNum(flat, 'Cut & Weeded Setup Fee',         0),
  }
  s.plotterCutPerPiece = {
    None:            getNum(flat, 'Cost Per Cut Vinyl Only',        s.cutPerSign ?? 0),
    KissOnRoll:      getNum(flat, 'Kiss Cut On Roll',               0),
    KissOnSheets:    getNum(flat, 'Kiss Cut On Sheets',             0),
    CutIndividually: getNum(flat, 'Cut Individually',               0),
    CutAndWeeded:    getNum(flat, 'Cut & Weeded',                   0),
  }

  // ---- ✅ Hem / Eyelets (qty-based) ----

  ;(s as any).hemEyeletsPerPiece = getNum(flat, 'Hem or Eyelets', 0)

  // Delivery
  const baseFromCsv = getNum(flat, 'Delivery Base', Number((s as any).deliveryBase) || 0)
  ;(s as any).deliveryBase = baseFromCsv

  // map postage bands (≤ 100/150/200, >200)
  const p100 = getNum(flat, 'Postage ≤ 100 cm', 0)
  const p150 = getNum(flat, 'Postage ≤ 150 cm', 0)
  const p200 = getNum(flat, 'Postage ≤ 200 cm', 0)
  const p200p = getNum(flat, 'Postage > 200 cm', 0)
  if (p100 || p150 || p200 || p200p) {
    ;(s as any).deliveryBands = [
      { maxSumCm: 100, surcharge: p100 },
      { maxSumCm: 150, surcharge: p150 },
      { maxSumCm: 200, surcharge: p200 },
      { maxSumCm: Infinity, surcharge: p200p },
    ]
  }

  return s
}
