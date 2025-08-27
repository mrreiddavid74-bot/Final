// lib/pricing.ts
import {
  Settings,
  VinylMedia,
  Substrate,
  SingleSignInput,
  PriceBreakdown,
  Finishing,
  Orientation,
} from './types'
import { normalizeSettings } from './settings-normalize'

const mm2ToSqm = (mm2: number) => mm2 / 1_000_000
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

// Treat master cap 0/undefined as "no cap"
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
  const cutCaps = [masterCut, media.rollWidthMm, media.maxCutWidthMm ?? Infinity]

  return {
    effectivePrintWidthMm: Math.min(...printCaps.map(v => (typeof v === 'number' ? v : Infinity))),
    effectiveCutWidthMm: Math.min(...cutCaps.map(v => (typeof v === 'number' ? v : Infinity))),
  }
}

/** Simple packer when a rectangle fits across the roll width. Includes edge gutters. */
function packAcrossWidthLm(
    pieceW: number, // mm
    pieceH: number, // mm
    effW: number, // mm
    qtyPieces: number, // total panels to print
    gutterMm: number, // spacing between rows, also used as edge gutter
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + gutterMm)))
  const rows = Math.ceil(qtyPieces / perRow)
  // total length down the roll = sum of piece heights + gutters between rows + top/bottom edge gutters
  const totalMm = rows * pieceH + (rows + 1) * gutterMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

/** Tile into columns when pieceW exceeds roll width. Includes per-column row gutters. */
function tileColumnsLm(
    pieceW: number,
    pieceH: number,
    effW: number,
    qtyPieces: number,
    overlapMm: number,
    gutterMm: number,
) {
  const denom = Math.max(1, effW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  // For each column we print all pieces in a stack with row gutters, plus top/bottom edge gutter
  const totalMm = columns * (qtyPieces * pieceH + (qtyPieces + 1) * gutterMm)
  return { columns, totalMm, totalLm: totalMm / 1000 }
}

/** Compute vinyl length according to auto/custom split options. */
function computeVinylLength(
    input: SingleSignInput,
    mediaItem: VinylMedia,
    s: Settings,
): { lm: number; note: string } {
  const { effectivePrintWidthMm: effW } = getEffectiveWidths(mediaItem, s)
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const qty = Math.max(1, input.qty || 1)
  const gutter = s.vinylMarginMm || 0 // "Vinyl Sign Margin mm" from CSV
  const overlap = s.tileOverlapMm || 0

  const auto = input.vinylAuto !== false
  const sides = input.doubleSided ? 2 : 1

  if (auto && (input.vinylSplitOverride ?? 0) === 0) {
    // Try both orientations if they fit across effW; pick the shorter total length
    const cand: Array<{ perRow: number; rows: number; totalMm: number; label: string }> = []
    if (W <= effW) {
      const p = packAcrossWidthLm(W, H, effW, qty, gutter)
      cand.push({ ...p, label: `${Math.round(W)}×${Math.round(H)}` })
    }
    if (H <= effW) {
      const p = packAcrossWidthLm(H, W, effW, qty, gutter)
      cand.push({ ...p, label: `${Math.round(H)}×${Math.round(W)}` })
    }
    if (cand.length) {
      const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      return {
        lm: (pick.totalMm / 1000) * sides,
        note: `Auto (rotated if needed); ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }

    // Neither fits: tile; choose cheaper orientation
    const v = tileColumnsLm(W, H, effW, qty, overlap, gutter)
    const h = tileColumnsLm(H, W, effW, qty, overlap, gutter)
    const pick = v.totalMm <= h.totalMm ? v : h
    return { lm: pick.totalLm * sides, note: `Auto tiled (${pick.columns} col) @ ${Math.round(effW)}mm` }
  }

  // --- CUSTOM override ---
  const parts = Math.max(1, input.vinylSplitOverride ?? 1)
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const baseW = ori === 'Vertical' ? W / parts : W // panel width if not rotated
  const baseH = ori === 'Vertical' ? H : H / parts // panel length if not rotated
  const pieces = qty * parts

  type Cand = { across: number; rows: number; totalMm: number; rotated: boolean }
  const candidates: Cand[] = []

  const tryIfFits = (acrossDim: number, lengthDim: number, rotated: boolean) => {
    if (acrossDim <= effW) {
      const perRow = Math.max(1, Math.floor(effW / (acrossDim + gutter)))
      const rows = Math.ceil(pieces / perRow)
      const totalMm = rows * lengthDim + (rows + 1) * gutter
      candidates.push({ across: perRow, rows, totalMm, rotated })
    }
  }

  // Try as-is and rotated if they fit across the roll
  tryIfFits(baseW, baseH, false)
  tryIfFits(baseH, baseW, true)

  if (candidates.length) {
    const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
    return {
      lm: (pick.totalMm / 1000) * sides,
      note: `Custom ${parts}× ${ori}${pick.rotated ? ' (rotated)' : ''}, ${pick.across}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
    }
  }

  // neither orientation fits across → tile columns; choose the cheaper orientation
  const denom = Math.max(1, effW - overlap)
  const colsA = Math.ceil((baseW + overlap) / denom)
  const colsB = Math.ceil((baseH + overlap) / denom)
  const useRot = colsB < colsA
  const acrossDim = useRot ? baseH : baseW
  const lengthDim = useRot ? baseW : baseH
  const cols = Math.max(1, useRot ? colsB : colsA)
  const totalMm = cols * (pieces * lengthDim + (pieces + 1) * gutter)

  return {
    lm: (totalMm / 1000) * sides,
    note: `Custom ${parts}× ${ori}${useRot ? ' (rotated)' : ''}, tiled (${cols} col) @ ${Math.round(effW)}mm`,
  }
}

/** Round a sheet requirement to the nearest 0.5 (min 0.5 if >0). */
function roundSheetsHalfStep(needed: number): number {
  if (needed <= 0) return 0
  const whole = Math.floor(needed)
  const rem = needed - whole
  if (rem === 0) return whole
  return rem <= 0.5 ? whole + 0.5 : whole + 1
}

/**
 * Pick a delivery band by the *longest edge* (in mm) of what ships.
 * Supports either {price} or {surcharge} in the band item.
 * Always adds baseFee; if deliveryMode === 'OnRoll' the band price is 0.
 */
function deliveryFromLongestEdge(
    settings: Settings,
    longestMm: number,
    deliveryMode: SingleSignInput['deliveryMode'] | undefined,
): { band: string; price: number } {
  const s: any = settings as any
  const base = s.delivery?.baseFee ?? s.deliveryBase ?? 0
  const bandsRaw = s.delivery?.bands ?? s.deliveryBands ?? []

  const longestCm = (longestMm || 0) / 10

  // normalise bands; prefer maxLengthCm, else fall back to maxGirthCm/maxSumCm
  const bands = (bandsRaw as any[])
      .map(b => {
        const max =
            (typeof b.maxLengthCm === 'number' ? b.maxLengthCm : undefined) ??
            (typeof b.maxGirthCm === 'number' ? b.maxGirthCm : undefined) ??
            (typeof b.maxSumCm === 'number' ? b.maxSumCm : Infinity)

        const price =
            typeof b.price === 'number'
                ? b.price
                : typeof b.surcharge === 'number'
                    ? b.surcharge
                    : 0

        const name =
            b.name ??
            (typeof b.maxLengthCm === 'number'
                ? `${b.maxLengthCm} cm`
                : typeof b.maxGirthCm === 'number'
                    ? `${b.maxGirthCm} cm`
                    : typeof b.maxSumCm === 'number'
                        ? `${b.maxSumCm} cm`
                        : 'N/A')

        return { max, price, name }
      })
      .sort((a, b) => a.max - b.max)

  const band = bands.find(b => longestCm <= b.max) || bands.at(-1) || { max: Infinity, price: 0, name: 'N/A' }
  // Cast deliveryMode to string to avoid union type mismatch
  const isOnRoll = String(deliveryMode || '') === 'OnRoll'
  const bandPrice = isOnRoll ? 0 : band.price
  return { band: band.name, price: base + bandPrice }
}

export function priceSingle(
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    settings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(settings as any)
  const notes: string[] = []

  // Printed area used for ink (rectangle)
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * (input.qty || 1))

  // Simple rectangle perimeter (final piece), multiplied by qty (used for plotter perimeter charging if you enable it)
  const perimeterM = ((((input.widthMm || 0) + (input.heightMm || 0)) * 2) / 1000) * (input.qty || 1)

  let materials = 0
  const vinylCostItems: {
    media: string
    lm: number
    pricePerLm: number
    cost: number
  }[] = []
  const substrateCostItems: {
    material: string
    sheet: string
    neededSheets: number
    chargedSheets: number
    pricePerSheet: number
    cost: number
  }[] = []
  const inkRate = s.inkElecPerSqm ?? (s as any).inkCostPerSqm ?? 0
  let ink = areaSqm * inkRate
  let setup = s.setupFee || 0
  let cutting = (s.cutPerSign || 0) * (input.qty || 1)
  let finishingUplift = 0

  // Track vinyl length so we can charge per-lm add-ons (app tape / white backing)
  let vinylLmRaw = 0
  let vinylLmWithWaste = 0

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmNoWaste: number, pricePerLm: number, printed: boolean) => {
    const fixedWaste = (s as any).vinylWasteLmPerJob ?? 0.5 // 0.5 m
    const waste = printed ? fixedWaste : 0
    vinylLmRaw = lmNoWaste
    vinylLmWithWaste = lmNoWaste + waste
    materials += (lmNoWaste + waste) * pricePerLm
  }

  // --- SOLID COLOUR CUT VINYL ---
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm || 0
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / ((input.widthMm || 0) + gutter)))
    const rows = Math.ceil((input.qty || 1) / perRow)
    // For solid colour we keep the simpler packing (historical behaviour)
    const lm = (rows * ((input.heightMm || 0) + gutter)) / 1000
    addVinylCost(lm, mediaItem.pricePerLm, false)
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lm.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +((lm) * mediaItem.pricePerLm).toFixed(2),
    })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

    // (Optional) application tape per LM
    const appLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
    if (input.applicationTape && appLm) {
      const add = appLm * (vinylLmWithWaste || vinylLmRaw)
      materials += add
      notes.push(`Application tape: ${(vinylLmWithWaste || vinylLmRaw).toFixed(2)} lm × £${appLm.toFixed(2)} = £${add.toFixed(2)}`)
    }

    // Finishing uplift
    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- PRINTED VINYL MODES ---
  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    // Drive vinyl length from same logic as the UI
    const v = computeVinylLength(input, mediaItem, s)
    addVinylCost(v.lm, mediaItem.pricePerLm, true)
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +v.lm.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +(v.lm * mediaItem.pricePerLm).toFixed(2),
    })
    notes.push(v.note, 'Printed vinyl waste: +0.50 lm added before multiplier')

    // Application tape — PER LM (only if ticked)
    const appLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
    if (input.applicationTape && appLm) {
      const len = vinylLmWithWaste || vinylLmRaw
      const add = appLm * len
      materials += add
      notes.push(`Application tape: ${len.toFixed(2)} lm × £${appLm.toFixed(2)} = £${add.toFixed(2)}`)
    }

    // White backing — PER LM (only if ticked)
    const whiteLm = (s as any).whiteBackingPerLm ?? (s as any).whiteBackedPerLm ?? 0
    if (input.backedWithWhite && whiteLm) {
      const len = vinylLmWithWaste || vinylLmRaw
      const add = whiteLm * len
      materials += add
      notes.push(`White backed vinyl: ${len.toFixed(2)} lm × £${whiteLm.toFixed(2)} = £${add.toFixed(2)}`)
    }

    // Finishing uplift
    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- SUBSTRATE COSTS ---
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    const usableW = Math.max(0, substrateItem.sizeW - 2 * (s.substrateMarginMm || 0))
    const usableH = Math.max(0, substrateItem.sizeH - 2 * (s.substrateMarginMm || 0))
    const usableArea = Math.max(1, usableW * usableH)

    // area-based requirement
    const signArea = (input.widthMm || 0) * (input.heightMm || 0)
    const neededSheetsRaw = (signArea * (input.qty || 1)) / usableArea

    // rounding to nearest half sheet
    const halfStepSheets = roundSheetsHalfStep(neededSheetsRaw)

    // panel-packing minimum
    const splits = (input.panelSplits ?? 0) > 0 ? (input.panelSplits as number) : 1
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const panelW = ori === 'Vertical' ? (input.widthMm || 0) / splits : (input.widthMm || 0)
    const panelH = ori === 'Vertical' ? (input.heightMm || 0) : (input.heightMm || 0) / splits
    const gw = Math.max(1, Math.floor(usableW / Math.max(1, panelW)))
    const gh = Math.max(1, Math.floor(usableH / Math.max(1, panelH)))
    const panelsPerSheet = gw * gh
    const panelsPerSign = splits
    const totalPanels = panelsPerSign * (input.qty || 1)
    const minSheetsByPack = panelsPerSheet > 0 ? Math.ceil(totalPanels / panelsPerSheet) : Infinity

    // final charge: if <= 0.5 by area, allow 0.5; else respect packing minimum
    let chargedSheets: number
    if (neededSheetsRaw <= 0.5) {
      chargedSheets = 0.5
    } else {
      chargedSheets = Math.max(halfStepSheets, minSheetsByPack)
    }

    const sheetCost = substrateItem.pricePerSheet
    materials += sheetCost * chargedSheets
    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })

    // Per-cut substrate fee (from CSV key "Cost Per Cut Substrate")
    const perCut = (s as any).costPerCutSubstrate ?? (s as any)['Cost Per Cut Substrate'] ?? 0
    if (perCut) {
      const pieces = splits * (input.qty || 1)
      const add = perCut * pieces
      cutting += add
      notes.push(`Substrate cut pieces: ${pieces} × £${perCut.toFixed(2)} = £${add.toFixed(2)}`)
    }
  }

  // VINYL CUT OPTIONS PRICING
  if (input.plotterCut && input.plotterCut !== 'None') {
    const perimRate = s.plotterPerimeterPerM ?? 0
    const perimAdd = perimRate * perimeterM
    const perPiece = (s as any).plotterCutPerPiece?.[input.plotterCut] ?? 0

    const setupMap = (s as any).plotterCutSetup ?? {}
    const setupAdd = setupMap[input.plotterCut] ?? 0

    const pieceAdd = perPiece * (input.qty || 1)
    cutting += perimAdd + setupAdd + pieceAdd

    const msg: string[] = []
    if (setupAdd) msg.push(`setup £${setupAdd.toFixed(2)}`)
    if (perimAdd) msg.push(`perimeter £${perimAdd.toFixed(2)}`)
    if (pieceAdd) msg.push(`${(input.qty || 1)} × £${perPiece.toFixed(2)} = £${pieceAdd.toFixed(2)}`)
    notes.push(`Cut option: ${input.plotterCut} — ${msg.join(' + ') || '£0.00'}`)
  } else if (s.cutPerSign) {
    notes.push(
        `Cut option: None — setup £0.00 + ${(input.qty || 1)} × £${s.cutPerSign.toFixed(2)} = £${(
            s.cutPerSign * (input.qty || 1)
        ).toFixed(2)}`,
    )
  }

  // Optional Cutting style uplift (percentage on base)
  if (input.cuttingStyle) {
    const uplift = (s as any).cuttingStyleUplifts?.[input.cuttingStyle] ?? 0
    if (uplift) {
      const baseSoFar = materials + ink + cutting + setup
      const add = uplift * baseSoFar
      finishingUplift += add
      notes.push(`Cutting style (${input.cuttingStyle}): +${Math.round(uplift * 100)}% = £${add.toFixed(2)}`)
    }
  }

  // Hem / Eyelets (qty based; only for Print & Cut)
  if (input.mode === 'PrintAndCutVinyl' && (input as any).hemEyelets) {
    const rate = (s as any).hemEyeletsPerPiece ?? 0
    const qty = input.qty || 1
    const add = rate * qty
    cutting += add
    notes.push(`Hem/Eyelets: ${qty} × £${rate.toFixed(2)} = £${add.toFixed(2)}`)
  }

  // BUILD TOTALS
  const multiplier = s.profitMultiplier ?? 1
  const preDelivery = (materials + ink) * multiplier + (setup + cutting + finishingUplift)

  // Delivery by longest shipping edge, respecting "On a Roll"
  let longestShipMm = Math.max(input.widthMm || 0, input.heightMm || 0)
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    const splits = (input.panelSplits ?? 0) > 0 ? (input.panelSplits as number) : 1
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const panelW = ori === 'Vertical' ? (input.widthMm || 0) / splits : (input.widthMm || 0)
    const panelH = ori === 'Vertical' ? (input.heightMm || 0) : (input.heightMm || 0) / splits
    longestShipMm = Math.max(panelW, panelH)
  }
  const { band, price: delivery } = deliveryFromLongestEdge(s, longestShipMm, (input as any).deliveryMode)
  const total = preDelivery + delivery
  notes.push(`Delivery by longest edge ${Math.round(longestShipMm / 10)} cm → ${band}`)

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
