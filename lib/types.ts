// lib/types.ts

export type Mode =
    | 'SolidColourCutVinyl'
    | 'PrintAndCutVinyl'
    | 'PrintedVinylOnSubstrate'
    | 'SubstrateOnly'

export type Finishing = 'KissCutOnRoll' | 'CutIntoSheets' | 'IndividuallyCut' | 'None'
export type Complexity = 'Basic' | 'Standard' | 'Complex'
export type Orientation = 'Vertical' | 'Horizontal'


// lib/types.ts
export type PlotterCut =
    | 'None'
    | 'KissOnRoll'
    | 'KissOnSheets'
    | 'CutIndividually'
    | 'CutAndWeeded'


export type CuttingStyle = 'Standard' | 'Intricate'

export type Settings = {
  // Master machine limits (global caps)
  masterMaxPrintWidthMm: number
  masterMaxCutWidthMm: number

  // Global margins & overlaps
  vinylMarginMm: number
  substrateMarginMm: number
  tileOverlapMm: number
  vinylWasteLmPerJob: number // metres per printed job

  // Costs (preferred names)
  setupFee: number
  cutPerSign: number
  appTapePerSqm?: number            // alias of applicationTapePerSqm
  inkElecPerSqm?: number            // alias of inkCostPerSqm
  profitMultiplier?: number

  // Legacy/synonym fields (kept optional for compatibility)
  applicationTapePerSqm?: number    // alias for appTapePerSqm
  inkCostPerSqm?: number            // alias for inkElecPerSqm

  // Optional finishing uplifts
  finishingUplifts?: Partial<Record<Finishing, number>>

  // ✅ NEW: per-sticker complexity surcharges
  complexityPerSticker?: Partial<Record<Complexity, number>>

  // ✅ NEW: Vinyl Cut Options pricing (all optional; defaults to 0 if missing)
  plotterPerimeterPerM?: number                         // e.g. £/m cut path
  plotterCutPerPiece?: Partial<Record<PlotterCut, number>> // fixed £/piece for selected option
  cuttingStyleUplifts?: Partial<Record<CuttingStyle, number>> // e.g. { Intricate: 0.2 }
  whiteBackingPerSqm?: number                           // e.g. 4.0 (£/m²)

  // Delivery (flat / legacy)
  deliveryBase?: number
  deliveryBands?: { maxSumCm: number; surcharge: number }[]

  // ✅ NEW: nested delivery (what normalizeSettings returns)
  delivery?: {
    baseFee: number
    bands: Array<{
      maxGirthCm?: number
      maxSumCm?: number
      price?: number
      surcharge?: number
      name?: string
    }>
  }

  // VAT (optional)
  vatRatePct?: number
}

export type VinylMedia = {
  id: string
  name: string
  rollWidthMm: number
  rollPrintableWidthMm: number // usable/print width
  pricePerLm: number
  // optional categorisation
  category?: 'Solid' | 'Printed' | string
  // Optional per-media limits
  maxPrintWidthMm?: number
  maxCutWidthMm?: number
}

export type Substrate = {
  id: string
  name: string
  sizeW: number
  sizeH: number
  pricePerSheet: number
  thicknessMm?: number
}

export type SingleSignInput = {
  mode: Mode
  widthMm: number
  heightMm: number
  qty: number
  vinylId?: string
  substrateId?: string
  doubleSided?: boolean
  finishing?: Finishing
  complexity?: Complexity
  applicationTape?: boolean

  // Substrate/vinyl tiling on sheet
  panelSplits?: number // 0..6
  panelOrientation?: Orientation

  // Vinyl Split Options (roll tiling)
  vinylAuto?: boolean
  vinylSplitOverride?: number
  vinylSplitOrientation?: Orientation

  // Vinyl Cut Options
  plotterCut?: PlotterCut
  backedWithWhite?: boolean
  cuttingStyle?: CuttingStyle

  settings?: Settings
}

export type VinylCostItem = {
  media: string
  lm: number
  pricePerLm: number
  cost: number
}

export type SubstrateCostItem = {
  material: string
  sheet: string // e.g., "2440×1220"
  neededSheets: number // fractional
  chargedSheets: number // integer
  pricePerSheet: number
  cost: number
}

export type PriceBreakdown = {
  // Money
  materials: number
  ink: number
  setup: number
  finishingUplift: number
  cutting: number
  preDelivery: number
  delivery: number
  total: number

  // Stats
  vinylLm?: number
  vinylLmWithWaste?: number
  tiles?: number
  sheetFraction?: 0.25 | 0.5 | 0.75 | 1
  sheetsUsed?: number
  usagePct?: number
  wastePct?: number
  deliveryBand?: string
  notes?: string[]

  // Detailed cost items (optional)
  costs?: {
    vinyl: VinylCostItem[]
    substrate: SubstrateCostItem[]
  }
}
