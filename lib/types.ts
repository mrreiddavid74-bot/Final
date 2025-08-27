// lib/types.ts

// -----------------------------
// Core enums / unions
// -----------------------------

export type Mode =
    | 'SolidColourCutVinyl'
    | 'PrintAndCutVinyl'
    | 'PrintedVinylOnSubstrate'
    | 'SubstrateOnly'

export type Orientation = 'Vertical' | 'Horizontal'

// Kept simple; you can extend if you later model laminate types, etc.
export type Finishing = 'None' | 'Gloss' | 'Matt' | 'AntiGraffiti'

// Optional complexity (used in some solid-colour pricing rules)
export type Complexity = 'Standard' | 'Simple' | 'Complex'

// Plotter cut options as used by the UI and pricing
export type PlotterCut =
    | 'None'
    | 'KissOnRoll'
    | 'KissOnSheets'
    | 'CutIndividually'
    | 'CutAndWeeded'

// Additional cut difficulty uplift (percentage multipliers)
export type CuttingStyle = 'Standard' | 'Intricate'

// Delivery mode (shared everywhere)
export type DeliveryMode = 'Boxed' | 'OnRoll'

// -----------------------------
// Inventory models
// -----------------------------

export type VinylMedia = {
  id: string
  name: string
  category?: string // e.g. "Printed", "Solid"
  rollWidthMm: number
  rollPrintableWidthMm: number
  pricePerLm: number
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

// -----------------------------
// Settings (normalized)
// -----------------------------

export type Settings = {
  // Machine/global limits
  masterMaxPrintWidthMm?: number
  masterMaxCutWidthMm?: number

  // Margins & overlaps
  vinylMarginMm?: number
  substrateMarginMm?: number
  tileOverlapMm?: number
  vinylWasteLmPerJob?: number

  // Core costs
  setupFee?: number
  cutPerSign?: number
  inkElecPerSqm?: number         // normalized from "Ink Cost sqm"
  inkCostPerSqm?: number         // alias accepted by normalizer
  profitMultiplier?: number      // normalized from "Sell Multiplier"

  // Finishing (optional % uplifts applied on base); keys match Finishing
  finishingUplifts?: Partial<Record<Finishing, number>>

  // Application tape / white backing — linear-meter pricing
  applicationTapePerLm?: number  // from "Application Tape Cost per lm"
  whiteBackingPerLm?: number     // from "White Backed Vinyl lm"

  // (Kept for compatibility with any older area-based rules; unused in current pricing)
  appTapePerSqm?: number
  applicationTapePerSqm?: number

  // Plotter cut & style uplifts
  plotterPerimeterPerM?: number
  plotterCutPerPiece?: Partial<Record<PlotterCut, number>>
  cuttingStyleUplifts?: Partial<Record<CuttingStyle, number>>

  // Hem/Eyelets per piece (qty-based)
  hemEyeletsPerPiece?: number    // from "Hem or Eyelets" / "Hem/Eyelets"

  // Delivery (flat form or nested)
  deliveryBase?: number
  deliveryBands?: Array<{
    maxSumCm?: number
    maxGirthCm?: number
    surcharge?: number
    name?: string
  }>
  delivery?: {
    baseFee?: number
    bands?: Array<{
      maxSumCm?: number
      maxGirthCm?: number
      price?: number
      surcharge?: number
      name?: string
    }>
  }

  // VAT etc. if you use it elsewhere
  vatRatePct?: number
}

// -----------------------------
// Pricing input from UI
// -----------------------------

export type SingleSignInput = {
  mode: Mode
  widthMm: number
  heightMm: number
  qty: number

  // Material selections
  vinylId?: string
  substrateId?: string

  // Printing / finishing toggles
  doubleSided?: boolean           // doubles vinyl lm for printed modes
  finishing?: Finishing
  complexity?: Complexity

  // Substrate/visual splits (also reused to display "Vinyl splits" text)
  panelSplits?: number            // 0 = none (one piece)
  panelOrientation?: Orientation  // which dimension to split along

  // Vinyl tiling options (Split Options card)
  vinylAuto?: boolean
  vinylSplitOverride?: number     // 0 or 1 = none; ≥2 = number of parts
  vinylSplitOrientation?: Orientation

  // Vinyl Cut Options
  plotterCut?: PlotterCut
  backedWithWhite?: boolean       // adds whiteBackingPerLm × lm
  cuttingStyle?: CuttingStyle
  applicationTape?: boolean       // adds applicationTapePerLm × lm
  hemEyelets?: boolean            // adds hemEyeletsPerPiece × qty (Print & Cut only)

  // Delivery rule
  deliveryMode?: DeliveryMode     // 'Boxed' (default) | 'OnRoll'
}

// -----------------------------
// Pricing result
// -----------------------------

export type PriceBreakdown = {
  materials: number
  ink: number
  setup: number
  cutting: number
  finishingUplift: number
  preDelivery: number
  delivery: number
  total: number

  vinylLm?: number
  vinylLmWithWaste?: number
  sheetFraction?: 0.25 | 0.5 | 0.75 | 1
  sheetsUsed?: number
  usagePct?: number
  wastePct?: number
  deliveryBand?: string

  costs?: {
    vinyl?: Array<{ media: string; lm: number; pricePerLm: number; cost: number }>
    substrate?: Array<{
      material: string
      sheet: string
      neededSheets: number
      chargedSheets: number
      pricePerSheet: number
      cost: number
    }>
  }

  notes?: string[]
}
