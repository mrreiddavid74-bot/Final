export type Mode =
  | 'SolidColourCutVinyl'
  | 'PrintAndCutVinyl'
  | 'PrintedVinylOnly'
  | 'PrintedVinylOnSubstrate'
  | 'SubstrateOnly'

export type Finishing = 'KissCutOnRoll' | 'CutIntoSheets' | 'IndividuallyCut' | 'None'
export type Complexity = 'Basic' | 'Standard' | 'Complex'
export type Orientation = 'Vertical' | 'Horizontal'

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
  appTapePerSqm?: number            // preferred (alias of applicationTapePerSqm)
  inkElecPerSqm?: number            // preferred (alias of inkCostPerSqm)
  profitMultiplier?: number

  // Legacy/synonym fields (kept optional for compatibility)
  applicationTapePerSqm?: number    // alias for appTapePerSqm
  inkCostPerSqm?: number            // alias for inkElecPerSqm

  // Optional finishing uplifts (by finishing key, e.g., 0.05 = +5%)
  finishingUplifts?: Partial<Record<Finishing, number>>

  // Delivery bands
  deliveryBase?: number
  deliveryBands?: { maxSumCm: number; surcharge: number }[]

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
  // Optional per-media limits (compat with defaults.ts)
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
  doubleSided?: boolean // for PrintedVinylOnSubstrate/SubstrateOnly
  finishing?: Finishing
  complexity?: Complexity
  applicationTape?: boolean
  panelSplits?: number // 0..6
  panelOrientation?: Orientation
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
