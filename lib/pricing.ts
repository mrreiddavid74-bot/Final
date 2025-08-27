// lib/pricing.ts
import {
  Settings,
  VinylMedia,
  Substrate,
  SingleSignInput,
  PriceBreakdown,
  Finishing,
} from './types'
import { normalizeSettings } from './settings-normalize'

const mm2ToSqm = (mm2: number) => mm2 / 1_000_000
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

// Treat master caps 0/undefined as "no cap"
export function getEffectiveWidths(media: VinylMedia, settings: Settings) {
  const masterPrint =
      settings.masterMaxPrintWidthMm && settings.masterMaxPrintWidthMm > 0
          ? settings.masterMaxPrintWidthMm
          : Infinity
  const masterCut =
      settings.masterMaxCutWidthMm && settings.masterMaxCutWidthMm > 0
          ? settings.masterMaxCutWidthMm
          : Infinity

  const printCaps = [masterPrint, media.rollPrintableWidthMm, media.maxPrintWidthMm ?? Infinity]
  const cutCaps   = [masterCut,   media.rollWidthMm,         media.maxCutWidthMm   ?? Infinity]

  return {
    effectivePrintWidthMm: Math.min(...printCaps.map(v => (typeof v === 'number' ? v : Infinity))),
    effectiveCutWidthMm:   Math.min(...cutCaps.map(v   => (typeof v === 'number' ? v : Infinity))),
  }
}

/** --- Helpers for vinyl packing/tiling that include margins (edge + gaps) --- */
function packAcrossWidthLm(
    pieceW: number, // mm across the roll
    pieceH: number, // mm along the roll
    effW: number,   // mm effective printable width
    qtyPieces: number,
    marginMm: number, // “Vinyl Sign Margin mm” used as gaps + edge gutters
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + marginMm)))
  const rows   = Math.ceil(qtyPieces / perRow)
  // total length down the roll = rows * height + edge gutters (top+bottom) + gaps between rows
  const totalMm = rows * pieceH + (rows + 1) * marginMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

function tileColumnsLm(
    pieceW: number, pieceH: number, effW: number,
    qtyPieces: number, overlapMm: number, marginMm: number,
) {
  const denom   = Math.max(1, effW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  // For each column we stack all pieces with margins between and edges once
  const totalMm = columns * (qtyPieces * pieceH + (qtyPieces + 1) * marginMm)
  return { columns, totalMm, totalLm: totalMm / 1000 }
}

/** Compute printed vinyl length according to auto/custom split settings. Includes margins. */
function computePrintedVinylLm(
    input: SingleSignInput,
    mediaItem: VinylMedia,
    s: Settings,
): { lm: number; note: string } {
  const { effectivePrintWidthMm: effW } = getEffectiveWidths(mediaItem, s)
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const qty = Math.max(1, input.qty || 1)
  const margin = s.vinylMarginMm || 0
  const overlap = s.tileOverlapMm || 0

  const auto = input.vinylAuto !== false

  if (auto && (input.vinylSplitOverride ?? 0) === 0) {
    // Try both orientations that fit across the roll; pick the shorter
    const cand: Array<{ perRow: number; rows: number; totalMm: number; totalLm: number }> = []
    if (W <= effW) cand.push(packAcrossWidthLm(W, H, effW, qty, margin))
    if (H <= effW) cand.push(packAcrossWidthLm(H, W, effW, qty, margin))
    if (cand.length) {
      const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      return {
        lm: pick.totalLm,
        note: `Auto (rotated if needed); ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }
    // Neither fits → tile by columns; pick cheaper orientation
    const v = tileColumnsLm(W, H, effW, qty, overlap, margin)
    const h = tileColumnsLm(H, W, effW, qty, overlap, margin)
    const pick = v.totalMm <= h.totalMm ? v : h
    return { lm: pick.totalLm, note: `Auto tiled (${pick.columns} col) @ ${Math.round(effW)}mm` }
  }

  // Custom override
  const parts = Math.max(1, input.vinylSplitOverride ?? 1)
  const ori   = input.vinylSplitOrientation ?? 'Vertical'
  const baseW = ori === 'Vertical' ? W / parts : W
  const baseH = ori === 'Vertical' ? H        : H / parts
  const pieces = qty * parts

  // Try as-is and rotated if either fits across the roll width
  const candidates: Array<{ perRow: number; rows: number; totalMm: number; totalLm: number }> = []
  if (baseW <= effW) candidates.push(packAcrossWidthLm(baseW, baseH, effW, pieces, margin))
  if (baseH <= effW) candidates.push(packAcrossWidthLm(baseH, baseW, effW, pieces, margin))

  if (candidates.length) {
    const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
    return {
      lm: pick.totalLm,
      note: `Custom ${parts}× ${ori}, ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
    }
  }

  // Neither fits → tile
  const t = tileColumnsLm(baseW, baseH, effW, pieces, overlap, margin)
  return { lm: t.totalLm, note: `Custom ${parts}× ${ori}, tiled (${t.columns} col) @ ${Math.round(effW)}mm` }
}

/** Panel geometry for substrate splits. */
function substratePanels(
    input: SingleSignInput,
): { panelW: number; panelH: number; panelsPerSign: number } {
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const splits = Math.max(0, input.panelSplits ?? 0)
  const N = splits === 0 ? 1 : splits
  const ori = input.panelOrientation ?? 'Vertical'
  const panelW = ori === 'Vertical' ? W / N : W
  const panelH = ori === 'Vertical' ? H       : H / N
  return { panelW, panelH, panelsPerSign: N }
}

/** How many such panels fit on a sheet (edges reduced by substrateMarginMm; no interior gap). */
function panelsPerSheet(
    panelW: number, panelH: number,
    sheetW: number, sheetH: number,
    substrateMarginMm: number,
) {
  const usableW = Math.max(0, sheetW - 2 * (substrateMarginMm || 0))
  const usableH = Math.max(0, sheetH - 2 * (substrateMarginMm || 0))
  const across = Math.max(0, Math.floor(usableW / Math.max(1, panelW)))
  const down   = Math.max(0, Math.floor(usableH / Math.max(1, panelH)))
  return Math.max(0, across * down)
}

/** Delivery bands using the longest shipped piece.
 * - Longest side in cm (per panel if substrate product)
 * - Adds base once
 * - If deliveryMode is OnARoll/OnRoll, waives the band but keeps base
 */
export function deliveryFromLongest(
    settings: Settings,
    input: SingleSignInput,
    maybePanelW?: number,
    maybePanelH?: number,
): { band: string; price: number } {
  const s: any = settings as any
  const base = (s.delivery?.baseFee ?? s.deliveryBase ?? 0) as number

  // Longest side of what ships
  const isSubProduct =
      input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'
  const longestCm = isSubProduct
      ? Math.max(maybePanelW || 0, maybePanelH || 0) / 10
      : Math.max(input.widthMm || 0, input.heightMm || 0) / 10

  type Band = { max: number; charge: number; name: string }

  // Preferred (nested) structure: treat `price` as the band charge, or fall back to `surcharge`
  const fromDelivery: Band[] = Array.isArray(s.delivery?.bands)
      ? (s.delivery.bands as any[]).map(b => ({
        max:
            typeof b.maxGirthCm === 'number'
                ? b.maxGirthCm
                : typeof b.maxSumCm === 'number'
                    ? b.maxSumCm
                    : Infinity,
        charge:
            typeof b.price === 'number'
                ? b.price
                : typeof b.surcharge === 'number'
                    ? b.surcharge
                    : 0,
        name:
            b.name ??
            `${Math.round(
                typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? 0)
            )} cm`,
      }))
      : []

  // Legacy flat structure: `surcharge` only; do NOT include base here
  const fromLegacy: Band[] =
      !fromDelivery.length && Array.isArray(s.deliveryBands)
          ? (s.deliveryBands as any[]).map(b => ({
            max:
                typeof b.maxGirthCm === 'number'
                    ? b.maxGirthCm
                    : typeof b.maxSumCm === 'number'
                        ? b.maxSumCm
                        : Infinity,
            charge: typeof b.surcharge === 'number' ? b.surcharge : 0,
            name:
                b.name ??
                `${Math.round(
                    typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? 0)
                )} cm`,
          }))
          : []

  const bands = (fromDelivery.length ? fromDelivery : fromLegacy).sort(
      (a, b) => a.max - b.max
  )

  const pick =
      bands.find(b => longestCm <= b.max) ??
      bands.at(-1) ?? { max: Infinity, charge: 0, name: 'N/A' }

  const dm = (input as any).deliveryMode as
      | 'Boxed'
      | 'OnARoll'
      | 'OnRoll'
      | undefined
  const onRoll = dm === 'OnARoll' || dm === 'OnRoll'

  // Price = base + (band charge unless On a Roll)
  const price = base + (onRoll ? 0 : pick.charge)
  return { band: pick.name, price }
}


export function priceSingle(
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    settings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(settings as any)
  const notes: string[] = []

  // Printed area used for ink (rectangle). No ink for Solid Colour Cut or Substrate Only.
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * (input.qty || 1))

  // Rectangle perimeter (for optional plotter-perimeter charging)
  const perimeterM = ((((input.widthMm || 0) + (input.heightMm || 0)) * 2) / 1000) * (input.qty || 1)

  let materials = 0
  const vinylCostItems: { media: string; lm: number; pricePerLm: number; cost: number }[] = []
  const substrateCostItems: {
    material: string; sheet: string; neededSheets: number; chargedSheets: number; pricePerSheet: number; cost: number
  }[] = []

  const inkRate = (s.inkElecPerSqm ?? s.inkCostPerSqm ?? 0)
  let ink = areaSqm * inkRate
  let setup = s.setupFee || 0
  let cutting = (s.cutPerSign || 0) * (input.qty || 1)
  let finishingUplift = 0

  // Track vinyl length so we can charge per-lm add-ons
  let vinylLmRaw = 0
  let vinylLmWithWaste = 0

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lm: number, pricePerLm: number, printed: boolean) => {
    const printedWaste = (s as any).vinylWasteLmPerJob ?? 0.5 // default to 0.50 lm
    const waste = printed ? printedWaste : 0
    vinylLmRaw = lm
    vinylLmWithWaste = lm + waste
    materials += (lm + waste) * pricePerLm
    if (printed && waste) notes.push(`Printed vinyl waste: +${waste.toFixed(2)} lm added before multiplier`)
  }

  // --- SOLID COLOUR CUT VINYL ---
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const margin = s.vinylMarginMm || 0
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / ((input.widthMm || 0) + margin)))
    const rows = Math.ceil((input.qty || 1) / perRow)
    const lm = (rows * ((input.heightMm || 0)) + (rows + 1) * margin) / 1000
    addVinylCost(lm, mediaItem.pricePerLm, false)
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lm.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +(((lm) * mediaItem.pricePerLm)).toFixed(2),
    })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

    // Optional complexity uplift per sticker
    const cps = (s as any).complexityPerSticker as Partial<Record<string, number>> | undefined
    if (input.complexity && cps && typeof cps[input.complexity] === 'number') {
      cutting += (cps[input.complexity] as number) * (input.qty || 1)
    }

    // Application tape — per LM
    if (input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`Application tape: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    // Finishing uplift (laminate style etc.)
    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- PRINTED VINYL MODES ---
  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    const v = computePrintedVinylLm(input, mediaItem, s)
    let lm = v.lm
    if (input.doubleSided) lm *= 2

    addVinylCost(lm, mediaItem.pricePerLm, true)
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lm.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +(lm * mediaItem.pricePerLm).toFixed(2),
    })
    notes.push(v.note)

    // Application tape — PER LM (if ticked)
    if (input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`Application tape: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    // White backing — PER LM (if ticked)
    if (input.backedWithWhite) {
      const rateLm = (s as any).whiteBackingPerLm ?? (s as any).whiteBackedPerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`White backed vinyl: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    // Finishing uplift
    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- HEM / EYELETS (Print & Cut only, qty-based) ---
  if (input.mode === 'PrintAndCutVinyl' && ((input as any).hemEyelets === true || (input as any).hemEyelets === 'Yes')) {
    const rate = (s as any).hemEyeletsPerPiece ?? 0
    if (rate) {
      const qty = input.qty || 1
      const add = rate * qty
      cutting += add
      notes.push(`Hem/Eyelets: ${qty} × £${rate.toFixed(2)} = £${add.toFixed(2)}`)
    }
  }

  // --- SUBSTRATE COSTS ---
  let deliveredPanelW = input.widthMm || 0
  let deliveredPanelH = input.heightMm || 0

  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined
    if (!substrateItem) throw new Error('Select a substrate')

    const { panelW, panelH, panelsPerSign } = substratePanels(input)
    deliveredPanelW = panelW
    deliveredPanelH = panelH

    const pps = panelsPerSheet(panelW, panelH, substrateItem.sizeW, substrateItem.sizeH, s.substrateMarginMm || 0)
    const totalPanels = (input.qty || 1) * panelsPerSign
    const neededSheetsRaw = pps > 0 ? totalPanels / pps : Infinity

    // Charge 0.5 sheet if total need ≤ 0.5; otherwise round up to full sheets
    const chargedSheets = neededSheetsRaw <= 0.5 ? 0.5 : Math.ceil(neededSheetsRaw)

    const sheetCost = substrateItem.pricePerSheet
    materials += sheetCost * chargedSheets

    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets: typeof chargedSheets === 'number' ? chargedSheets : 0,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })

    // Per-cut substrate charge (qty × number of panels)
    const perCut = (s as any).costPerCutSubstrate ?? 0
    if (perCut) {
      const pieces = totalPanels
      const add = perCut * pieces
      cutting += add
      notes.push(`Substrate split: ${panelsPerSign} × per sign → ${pieces} cuts × £${perCut.toFixed(2)} = £${add.toFixed(2)}`)
    }
  }

  // --- VINYL CUT OPTIONS PRICING ---
  if (input.plotterCut && input.plotterCut !== 'None') {
    const perimRate = s.plotterPerimeterPerM ?? 0
    const perimAdd  = perimRate * perimeterM
    const perPiece  = (s as any).plotterCutPerPiece?.[input.plotterCut] ?? 0

    const setupMap = (s as any).plotterCutSetup ?? {}
    const setupAdd = setupMap[input.plotterCut] ?? 0

    const pieceAdd = perPiece * (input.qty || 1)
    cutting += perimAdd + setupAdd + pieceAdd

    const msg: string[] = []
    if (setupAdd)  msg.push(`setup £${setupAdd.toFixed(2)}`)
    if (perimAdd)  msg.push(`perimeter £${perimAdd.toFixed(2)}`)
    if (pieceAdd)  msg.push(`${(input.qty || 1)} × £${perPiece.toFixed(2)} = £${pieceAdd.toFixed(2)}`)
    notes.push(`Cut option: ${input.plotterCut} — ${msg.join(' + ') || '£0.00'}`)
  } else if (s.cutPerSign) {
    notes.push(`Cut option: None — setup £0.00 + ${(input.qty || 1)} × £${s.cutPerSign.toFixed(2)} = £${(s.cutPerSign * (input.qty || 1)).toFixed(2)}`)
  }

  // Optional cutting style uplift (%)
  if ((s as any).cuttingStyleUplifts && input.cuttingStyle) {
    const uplift = (s as any).cuttingStyleUplifts?.[input.cuttingStyle] ?? 0
    if (uplift) {
      const baseSoFar = materials + ink + cutting + setup
      const add = uplift * baseSoFar
      finishingUplift += add
      notes.push(`Cutting style (${input.cuttingStyle}): +${Math.round(uplift * 100)}% = £${add.toFixed(2)}`)
    }
  }

  // --- TOTALS ---
  const multiplier = s.profitMultiplier ?? 1
  const preDelivery = (materials + ink) * multiplier + (setup + cutting + finishingUplift)

  const { band, price: delivery } = deliveryFromLongest(
      s,
      input,
      deliveredPanelW,
      deliveredPanelH,
  )

  const total = preDelivery + delivery

  return {
    // Money
    materials: +materials.toFixed(2),
    ink: +ink.toFixed(2),
    setup: +setup.toFixed(2),
    cutting: +cutting.toFixed(2),
    finishingUplift: +finishingUplift.toFixed(2),
    preDelivery: +preDelivery.toFixed(2),
    delivery: +delivery.toFixed(2),
    total: +total.toFixed(2),

    // Stats
    vinylLm: vinylLmRaw ? +vinylLmRaw.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLmWithWaste ? +vinylLmWithWaste.toFixed(3) : undefined,

    // Detailed cost items
    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    deliveryBand: band,

    notes,
  }
}
