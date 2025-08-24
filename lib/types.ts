export type Mode =
    | 'SolidColourCutVinyl'
    | 'PrintAndCutVinyl'
    | 'PrintedVinylOnSubstrate'
    | 'SubstrateOnly'

export type Finishing = 'KissCutOnRoll' | 'CutIntoSheets' | 'IndividuallyCut' | 'None'
export type Complexity = 'Basic' | 'Standard' | 'Complex'
export type Orientation = 'Vertical' | 'Horizontal'

export type PlotterCut =
    | 'None'
    | 'KissOnRoll'
    | 'KissOnSheets'
    | 'CutIndividually'
    | 'CutAndWeeded'

export type CuttingStyle = 'Standard' | 'Reverse'

export type Settings = {
  // Machine/global limits
  masterMaxPrintWidthMm: number
  masterMaxCutWidthMm: number

  // Margins & overlaps
  vinylMarginMm: number
  substrateMarginMm: number
  tileOverlapMm: number
  vinylWasteLmPerJob: number // metres per printed job

  // Costs (preferred names)
  setupFee: number
  cutPerSign: number
  appTapePerSqm?: number
  inkElecPerSqm?: number
  profitMultiplier?: number

  // Legacy/synonym fields (compat)
  applicationTapePerSqm?: number
  inkCostPerSqm?: number

  // Optional finishing uplifts
  finishingUplifts?: Partial<Record<Finishing, number>>

  // ✅ NEW (Vinyl Cut Options) — all optional, default 0
  costPerCutVinylOnly?: number // if provided, overrides cutPerSign
  kissOnRollSetupFee?: number
  kissOnRollPerItem?: number
  kissOnSheetsSetupFee?: number
  kissOnSheetsPerItem?: number
  cutIndividuallySetupFee?: number
  cutIndividuallyPerItem?: number
  cutWeededSetupFee?: number
  cutWeededPerItem?: number
  appTapePerLm?: number
  whiteBackedVinylPerLm?: number

  // ✅ NEW per-sticker complexity surcharges
  complexityPerSticker?: Partial<Record<Complexity, number>>

  // Delivery (flat / legacy)
  deliveryBase?: number
  deliveryBands?: { maxSumCm: number; surcharge: number }[]

  // ✅ NEW nested delivery
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
  rollPrintableWidthMm: number
  pricePerLm: number
  category?: 'Solid' | 'Printed' | string
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

  // Existing
  applicationTape?: boolean
  panelSplits?: number
  panelOrientation?: Orientation
  settings?: Settings

  // Vinyl Split (tiling) options
  vinylAuto?: boolean
  vinylSplitOverride?: number
  vinylSplitOrientation?: Orientation

  // ✅ Vinyl Cut Options
  plotterCut?: PlotterCut
  backedWithWhite?: boolean
  cuttingStyle?: CuttingStyle
}

export type VinylCostItem = {
  media: string
  lm: number
  pricePerLm: number
  cost: number
}

export type SubstrateCostItem = {
  material: string
  sheet: string
  neededSheets: number
  chargedSheets: number
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
