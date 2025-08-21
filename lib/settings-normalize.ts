// lib/settings-normalize.ts
import { Settings, Finishing, Complexity } from './types'

/**
 * Coerce anything to a finite number, or fallback.
 */
function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Normalize finishing uplift map: ensure numbers, drop invalids, clamp >= 0.
 */
function normalizeUplifts(src: any): Partial<Record<Finishing, number>> {
  const out: Partial<Record<Finishing, number>> = {}
  if (!src || typeof src !== 'object') return out
      ;(['KissCutOnRoll', 'CutIntoSheets', 'IndividuallyCut', 'None'] as Finishing[]).forEach((key) => {
    if (key in src) {
      const v = Math.max(0, num(src[key], 0))
      if (v) out[key] = v
    }
  })
  return out
}

/**
 * Normalize complexity cost map: ensure numbers, drop invalids, clamp >= 0.
 */
function normalizeComplexity(src: any): Partial<Record<Complexity, number>> {
  const out: Partial<Record<Complexity, number>> = {}
  if (!src || typeof src !== 'object') return out
      ;(['Basic', 'Standard', 'Complex'] as Complexity[]).forEach((key) => {
    if (key in src) {
      const v = Math.max(0, num(src[key], 0))
      if (v) out[key] = v
    }
  })
  return out
}

/**
 * Normalize incoming Settings — coalesce synonyms, ensure defaults,
 * and produce shapes pricing.ts understands (nested + flat delivery).
 */
export function normalizeSettings(s: Partial<Settings> | undefined): Settings {
  const src: any = s ?? {}

  // ---- Synonyms / preferred keys
  const inkElecPerSqm   = num(src.inkElecPerSqm ?? src.inkCostPerSqm, 0)
  const appTapePerSqm   = num(src.appTapePerSqm ?? src.applicationTapePerSqm, 0)
  const profitMultiplier = (() => {
    const v = num(src.profitMultiplier, 1)
    return v > 0 ? v : 1
  })()

  // ---- Delivery: build a nested representation first
  // Accept either src.delivery (nested) or flat deliveryBase + deliveryBands
  const nestedDelivery: {
    baseFee: number
    bands: Array<{
      maxGirthCm?: number
      maxSumCm?: number
      price?: number
      surcharge?: number
      name?: string
    }>
  } = (() => {
    // If already nested with bands, normalize it
    if (src.delivery && Array.isArray(src.delivery.bands)) {
      const baseFee = num(src.delivery.baseFee, num(src.deliveryBase, 0))
      const bands = (src.delivery.bands as any[]).map((b) => ({
        maxGirthCm: typeof b?.maxGirthCm === 'number' ? b.maxGirthCm : undefined,
        maxSumCm:   typeof b?.maxSumCm   === 'number' ? b.maxSumCm   : undefined,
        price:      Number.isFinite(num(b?.price, NaN)) ? num(b?.price, NaN) : undefined,
        surcharge:  typeof b?.surcharge  === 'number' ? num(b.surcharge, 0) : undefined,
        name:       typeof b?.name === 'string' ? b.name : undefined,
      }))
      return { baseFee, bands }
    }

    // Else, synthesize nested from flat
    const baseFee = num(src.deliveryBase, 0)
    const bands = Array.isArray(src.deliveryBands)
        ? (src.deliveryBands as any[]).map((b) => ({
          // Source only guarantees maxSumCm + surcharge
          maxSumCm: typeof b?.maxSumCm === 'number' ? num(b.maxSumCm, Infinity) : undefined,
          surcharge: typeof b?.surcharge === 'number' ? num(b.surcharge, 0) : undefined,
          // Derive a stable label; price computed later by pricing if needed
          name: typeof b?.name === 'string' ? b.name : (typeof b?.maxSumCm === 'number' ? `${Math.round(b.maxSumCm)} cm` : undefined),
        }))
        : []
    return { baseFee, bands }
  })()

  // ---- Uplifts / complexity maps
  const finishingUplifts = normalizeUplifts(src.finishingUplifts)
  const complexityPerSticker = normalizeComplexity(src.complexityPerSticker)

  // ---- Required base fields (defaults)
  const masterMaxPrintWidthMm = num(src.masterMaxPrintWidthMm, 2000)
  const masterMaxCutWidthMm   = num(src.masterMaxCutWidthMm, 2000)
  const vinylMarginMm         = num(src.vinylMarginMm, 5)
  const substrateMarginMm     = num(src.substrateMarginMm, 5)
  const tileOverlapMm         = num(src.tileOverlapMm, 10)
  const vinylWasteLmPerJob    = num(src.vinylWasteLmPerJob, 1)

  const setupFee              = num(src.setupFee, 0)
  const cutPerSign            = num(src.cutPerSign, 0)

  const vatRatePct            = num(src.vatRatePct, 20)

  // ---- Also provide flat delivery for backward-compat consumers
  const deliveryBase = num(src.deliveryBase ?? nestedDelivery.baseFee, 0)
  const deliveryBands =
      Array.isArray(src.deliveryBands) && src.deliveryBands.length
          ? (src.deliveryBands as any[]).map((b) => ({
            maxSumCm: num(b?.maxSumCm, Infinity),
            surcharge: num(b?.surcharge, 0),
          }))
          : (nestedDelivery.bands ?? []).map((b) => {
            const max = num(b?.maxGirthCm ?? b?.maxSumCm, Infinity)
            const price = num(b?.price, NaN)
            // Convert absolute price → surcharge relative to base fee
            const surcharge = Number.isFinite(price) ? Math.max(0, price - deliveryBase) : num(b?.surcharge, 0)
            return { maxSumCm: max, surcharge }
          })

  // ---- Final, fully-normalized Settings object
  const out: Settings = {
    masterMaxPrintWidthMm,
    masterMaxCutWidthMm,
    vinylMarginMm,
    substrateMarginMm,
    tileOverlapMm,
    vinylWasteLmPerJob,

    setupFee,
    cutPerSign,

    // Preferred cost keys
    inkElecPerSqm,
    appTapePerSqm,
    profitMultiplier,

    // Optional maps
    finishingUplifts,
    complexityPerSticker,

    // Flat delivery (legacy/compat)
    deliveryBase,
    deliveryBands,

    // Nested delivery (new/normalized)
    delivery: {
      baseFee: deliveryBase,
      bands: (nestedDelivery.bands ?? []).map((b) => ({
        maxGirthCm: typeof b?.maxGirthCm === 'number' ? b.maxGirthCm : undefined,
        maxSumCm:   typeof b?.maxSumCm   === 'number' ? b.maxSumCm   : undefined,
        price:      Number.isFinite(num(b?.price, NaN)) ? num(b?.price, NaN) : undefined,
        surcharge:  typeof b?.surcharge  === 'number' ? num(b.surcharge, 0) : undefined,
        name:       typeof b?.name === 'string' ? b.name : undefined,
      })),
    },

    vatRatePct,
  }

  return out
}
