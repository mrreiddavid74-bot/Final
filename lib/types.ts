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

// Laminate/finish options (used by finishingUplifts)
export type Finishing = 'None' | 'Gloss' | 'Matt' | 'AntiGraffiti'

// Optional complexity (used in some solid-colour pricing rules)
export type Complexity = 'Standard' | 'Simple' | 'Complex'

// Plotter cut options (used by Vinyl Cut Options card)
export type PlotterCut =
    | 'None'
    | 'KissOnRoll'
    | 'KissOnSheets'
    | 'CutIndividually'
    | 'CutAndWeeded'

// Additional cut difficulty uplift (percentage multipliers)
export type CuttingStyle = 'Standard' | 'Intricate'

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

  // Finishing (laminate) uplifts; keys match Finishing
  finishingUplifts?: Partial<Record<Finishing, number>>

  // Application tape / white backing — linear-meter pricing
  applicationTapePerLm?: number  // from "Application Tape Cost per lm"
  whiteBackingPerLm?: number     // from "White Backed Vinyl lm"

  // (Optional compatibility if uploads use sqm)
  appTapePerSqm?: number
  applicationTapePerSqm?: number

  // Plotter cut & style uplifts
  plotterPerimeterPerM?: number
  plotterCutPerPiece?: Partial<Record<PlotterCut, number>>
  cuttingStyleUplifts?: Partial<Record<CuttingStyle, number>>

  // Hem/Eyelets per piece (qty-based)
  hemEyeletsPerPiece?: number    // from "Hem or Eyelets" / "Hem/Eyelets"

  // Delivery (flat form)
  deliveryBase?: number
  deliveryBands?: Array<{
    maxSumCm?: number
    maxGirthCm?: number
    surcharge?: number
    name?: string
  }>

  // Optional nested delivery (supported by normalizer)
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

  // VAT etc.
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

  // Substrate/visual splits
  panelSplits?: number            // 0 = none (one piece)
  panelOrientation?: Orientation  // which dimension to split along

  // Vinyl tiling options (Split Options card)
  vinylAuto?: boolean
  vinylSplitOverride?: number     // 0 or 1 = none; ≥2 = number of parts
  vinylSplitOrientation?: Orientation

  // Vinyl Cut Options
  plotterCut?: PlotterCut
  backedWithWhite?: boolean       // adds whiteBackingPerLm × lm (printed modes)
  cuttingStyle?: CuttingStyle
  applicationTape?: boolean       // adds applicationTapePerLm × lm
  hemEyelets?: boolean            // adds hemEyeletsPerPiece × qty (Print & Cut only)
}

// -----------------------------
// Pricing result
// -----------------------------

export type PriceBreakdown = {
  // Money
  materials: number
  ink: number
  setup: number
  cutting: number
  finishingUplift: number
  preDelivery: number
  delivery: number
  total: number

  // Stats / utilization
  vinylLm?: number                // linear meters (before waste)
  vinylLmWithWaste?: number       // lm including job waste
  sheetFraction?: 0.25 | 0.5 | 0.75 | 1
  sheetsUsed?: number
  usagePct?: number
  wastePct?: number
  deliveryBand?: string

  // Itemized costs (for UI display)
  costs?: {
    vinyl?: Array<{
      media: string
      lm: number
      pricePerLm: number
      cost: number
    }>
    substrate?: Array<{
      material: string
      sheet: string
      neededSheets: number
      chargedSheets: number
      pricePerSheet: number
      cost: number
    }>
  }

  // Free-form notes for audit/debug
  notes?: string[]
}
