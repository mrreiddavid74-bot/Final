// lib/defaults.ts
import type { Settings, VinylMedia, Substrate } from './types'

export const DEFAULT_SETTINGS: Settings = {
  // Machine/global limits
  masterMaxPrintWidthMm: 0,
  masterMaxCutWidthMm: 0,

  // Margins & overlaps
  vinylMarginMm: 5,
  substrateMarginMm: 5,
  tileOverlapMm: 10,
  vinylWasteLmPerJob: 1,

  // Costs (base fallbacks; overridden by uploaded costs.json)
  setupFee: 5.0,
  cutPerSign: 0.25,
  appTapePerSqm: 2.0,       // alias supported as applicationTapePerSqm
  inkElecPerSqm: 4.0,       // alias supported as inkCostPerSqm
  profitMultiplier: 1.8,

  // Optional finishing uplifts (percentage multipliers on base)
  // These keys should match your Finishing union type.
  finishingUplifts: {
    IndividuallyCut: 0.10,
    CutIntoSheets: 0.05,
    KissCutOnRoll: 0.00,
    None: 0.00,
  },

  // ✅ VINYL CUT OPTIONS (plotter) — defaults (CSV/JSON upload will override)
  plotterPerimeterPerM: 0,
  // Keys must match PlotterCut: 'None' | 'KissOnRoll' | 'KissOnSheets' | 'CutIndividually' | 'CutAndWeeded'
  plotterCutPerPiece: {
    None: 0,
    KissOnRoll: 0,
    KissOnSheets: 0,
    CutIndividually: 0,
    CutAndWeeded: 0,
  },
  // Cutting style uplift multipliers
  cuttingStyleUplifts: { Standard: 0, Intricate: 0 },

  // White backing rate (your normalize step can map "White Backed Vinyl lm" to a per-lm or per-sqm field as needed)
  whiteBackingPerSqm: 0,

  // Delivery (legacy flat-form; normalize() also supports new structured delivery)
  deliveryBase: 5,
  deliveryBands: [
    { maxSumCm: 100, surcharge: 0 },
    { maxSumCm: 200, surcharge: 3 },
    { maxSumCm: 300, surcharge: 5 },
    { maxSumCm: 400, surcharge: 8 },
  ],

  // VAT (if used elsewhere)
  vatRatePct: 20,
}

export const DEFAULT_MEDIA: VinylMedia[] = [
  {
    id: 'mono-print-1370',
    name: 'Monomeric Print 1370',
    category: 'Printed',
    rollWidthMm: 1370,
    rollPrintableWidthMm: 1340,
    pricePerLm: 3.5,
    maxPrintWidthMm: 1340,
    maxCutWidthMm: 1340,
  },
  {
    id: 'poly-print-1370',
    name: 'Polymeric Print 1370',
    category: 'Printed',
    rollWidthMm: 1370,
    rollPrintableWidthMm: 1340,
    pricePerLm: 5.2,
    maxPrintWidthMm: 1340,
    maxCutWidthMm: 1340,
  },
  {
    id: 'clear-gloss-1370',
    name: 'Clear Gloss 1370',
    category: 'Printed',
    rollWidthMm: 1370,
    rollPrintableWidthMm: 1340,
    pricePerLm: 4.2,
    maxPrintWidthMm: 1340,
    maxCutWidthMm: 1340,
  },
  {
    id: 'black-matt-610',
    name: 'Black Matt 610',
    category: 'Solid',
    rollWidthMm: 610,
    rollPrintableWidthMm: 610,
    pricePerLm: 3.2,
    maxCutWidthMm: 610,
  },
  {
    id: 'frosted-610',
    name: 'Frosted 610',
    category: 'Solid',
    rollWidthMm: 610,
    rollPrintableWidthMm: 610,
    pricePerLm: 4.1,
    maxCutWidthMm: 610,
  },
]

export const DEFAULT_SUBSTRATES: Substrate[] = [
  { id: 'foamex-2440x1220-3', name: 'Foamex 3mm 2440x1220', thicknessMm: 3, sizeW: 2440, sizeH: 1220, pricePerSheet: 18 },
  { id: 'foamex-3050x1560-3', name: 'Foamex 3mm 3050x1560', thicknessMm: 3, sizeW: 3050, sizeH: 1560, pricePerSheet: 32 },
  { id: 'acm-3050x2030-3',    name: 'ACM 3mm 3050x2030',    thicknessMm: 3, sizeW: 3050, sizeH: 2030, pricePerSheet: 58 },
]
