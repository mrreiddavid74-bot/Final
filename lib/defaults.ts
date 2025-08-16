import type { Settings, VinylMedia, Substrate } from './types'

// OPTION B: bypass excess-property checking by casting the object to Settings.
export const DEFAULT_SETTINGS = ({
  // Machine/global limits
  masterMaxPrintWidthMm: 1340,
  masterMaxCutWidthMm: 1340,

  // Margins & overlaps
  vinylMarginMm: 5,
  substrateMarginMm: 5,
  tileOverlapMm: 10,
  vinylWasteLmPerJob: 1,

  // Costs
  setupFee: 5.0,
  cutPerSign: 3.0,
  inkElecPerSqm: 1.75,        // was inkCostPerSqm
  appTapePerSqm: 2.0,         // was applicationTapePerSqm

  // Uplifts
  finishingUplifts: {
    None: 0,
    KissCutOnRoll: 0.05,
    CutIntoSheets: 0.08,
    IndividuallyCut: 0.12,
  },
  complexityPerSticker: { Basic: 0.2, Standard: 0.4, Complex: 0.8 },

  // Delivery (nested form)
  delivery: {
    baseFee: 9.5,
    bands: [
      { maxSumCm: 100, surcharge: 5 },
      { maxSumCm: 150, surcharge: 10 },
      { maxSumCm: 200, surcharge: 20 },
      { maxSumCm: 999999, surcharge: 30 },
    ],
  },

  vatRatePct: 20,
} as unknown) as Settings

export const DEFAULT_MEDIA: VinylMedia[] = [
  {
    id: 'md3',
    name: 'MD3 Printable',
    category: 'Printed',
    rollWidthMm: 1370,
    rollPrintableWidthMm: 1340,
    pricePerLm: 8.5,
    maxPrintWidthMm: 1340,
    maxCutWidthMm: 1340,
  },
  {
    id: 'frosted1220',
    name: 'Frosted 1220',
    category: 'Solid',
    rollWidthMm: 1220,
    rollPrintableWidthMm: 1220,
    pricePerLm: 6.2,
    maxCutWidthMm: 1220,
  },
  {
    id: 'frosted610',
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
