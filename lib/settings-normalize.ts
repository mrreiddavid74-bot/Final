import { Settings, Finishing, Complexity } from './types'

/**
 * Normalize incoming Settings — coalesce synonyms, ensure defaults,
 * and produce shapes pricing.ts expects (nested delivery with baseFee & bands).
 */
export function normalizeSettings(s: Partial<Settings> | undefined): Settings {
  const src: any = s ?? {}

  // Costs & synonyms
  const inkElecPerSqm = src.inkElecPerSqm ?? src.inkCostPerSqm ?? 0
  const appTapePerSqm = src.appTapePerSqm ?? src.applicationTapePerSqm ?? 0
  const profitMultiplier = src.profitMultiplier ?? 1

  // Delivery: build nested form if missing
  const nested = src.delivery && Array.isArray(src.delivery.bands)
    ? src.delivery
    : (src.deliveryBase != null || Array.isArray(src.deliveryBands))
      ? {
          baseFee: src.deliveryBase ?? 0,
          bands: (src.deliveryBands ?? []).map((b: any) => ({
            maxGirthCm: b?.maxGirthCm ?? b?.maxSumCm,
            price: typeof b?.price === 'number'
              ? b.price
              : (typeof b?.surcharge === 'number' ? (src.deliveryBase ?? 0) + b.surcharge : 0),
            name: b?.name ?? `${Math.round(b?.maxGirthCm ?? b?.maxSumCm ?? 0)} cm`,
          })),
        }
      : { baseFee: 0, bands: [] }

  // Uplifts
  const finishingUplifts: Partial<Record<Finishing, number>> = src.finishingUplifts ?? {}
  const complexityPerSticker: Partial<Record<Complexity, number>> = src.complexityPerSticker ?? {}

  // Required base fields — keep original values, fill with sensible defaults if absent
  const masterMaxPrintWidthMm = src.masterMaxPrintWidthMm ?? 2000
  const masterMaxCutWidthMm   = src.masterMaxCutWidthMm ?? 2000
  const vinylMarginMm         = src.vinylMarginMm ?? 5
  const substrateMarginMm     = src.substrateMarginMm ?? 5
  const tileOverlapMm         = src.tileOverlapMm ?? 10
  const vinylWasteLmPerJob    = src.vinylWasteLmPerJob ?? 1

  const setupFee              = src.setupFee ?? 0
  const cutPerSign            = src.cutPerSign ?? 0

  const vatRatePct            = src.vatRatePct ?? 20

  // Return object conforming to Settings with safe values everywhere
  const out: Settings = {
    masterMaxPrintWidthMm,
    masterMaxCutWidthMm,
    vinylMarginMm,
    substrateMarginMm,
    tileOverlapMm,
    vinylWasteLmPerJob,
    setupFee,
    cutPerSign,
    inkElecPerSqm,
    appTapePerSqm,
    profitMultiplier,
    finishingUplifts,
    complexityPerSticker,
    delivery: {
      baseFee: nested.baseFee ?? 0,
      bands: (nested.bands ?? []).map((b: any) => ({
        maxGirthCm: typeof b?.maxGirthCm === 'number' ? b.maxGirthCm : (typeof b?.maxSumCm === 'number' ? b.maxSumCm : undefined),
        price: typeof b?.price === 'number' ? b.price : undefined,
        surcharge: typeof b?.surcharge === 'number' ? b.surcharge : undefined,
        name: b?.name,
      }))
    },
    vatRatePct,
  }

  return out
}
