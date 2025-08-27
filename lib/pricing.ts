// lib/pricing.ts
import {
  Settings, VinylMedia, Substrate, SingleSignInput, PriceBreakdown, Finishing, Orientation,
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
  const cutCaps   = [masterCut,   media.rollWidthMm,         media.maxCutWidthMm   ?? Infinity]

  return {
    effectivePrintWidthMm: Math.min(...printCaps.map(v => (typeof v === 'number' ? v : Infinity))),
    effectiveCutWidthMm:   Math.min(...cutCaps.map(v   => (typeof v === 'number' ? v : Infinity))),
  }
}

/** Simple packer when a rectangle fits across the roll width. */
function packAcrossWidth(
    acrossMm: number,     // piece width across the roll
    lengthMm: number,     // piece length down the roll
    effW: number,         // effective roll width
    pieces: number,       // total panels to print
    gutter: number,       // spacing between rows
) {
  const perRow = Math.max(1, Math.floor(effW / (acrossMm + gutter)))
  const rows   = Math.ceil(pieces / perRow)
  const totalMm = rows * lengthMm + Math.max(0, rows - 1) * gutter
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

/** Tile into columns when across dimension exceeds roll width. */
function tileColumns(
    acrossMm: number,
    lengthMm: number,
    effW: number,
    pieces: number,
    overlap: number,
    gutter: number,
) {
  const denom  = Math.max(1, effW - overlap)
  const cols   = Math.ceil((acrossMm + overlap) / denom)
  const totalMm = cols * (lengthMm + gutter) * pieces
  return { cols, totalMm, totalLm: totalMm / 1000 }
}

/**
 * Compute vinyl linear meters for printed modes using the SAME logic as the UI:
 * - Auto: rotate to avoid tiling if possible; otherwise tile with fewer columns.
 * - Custom: try both orientations (as-is and rotated); pick the shorter. If neither fits, tile both and pick the cheaper.
 */
function computeVinylLm(
    input: SingleSignInput, mediaItem: VinylMedia, s: Settings,
): { lmBase: number; note: string } {
  const { effectivePrintWidthMm: effW } = getEffectiveWidths(mediaItem, s)
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const qty = Math.max(1, input.qty || 1)
  const gutter = s.vinylMarginMm || 0
  const overlap = s.tileOverlapMm || 0

  const auto = input.vinylAuto !== false

  // ---------- AUTO ----------
  if (auto && (input.vinylSplitOverride ?? 0) === 0) {
    const cand: Array<{ perRow: number; rows: number; totalMm: number }> = []
    if (W <= effW) cand.push(packAcrossWidth(W, H, effW, qty, gutter))
    if (H <= effW) cand.push(packAcrossWidth(H, W, effW, qty, gutter))
    if (cand.length) {
      const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      return {
        lmBase: pick.totalMm / 1000,
        note: `Auto (rotated if needed); ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }
    // Neither fits → tile the cheaper orientation
    const v = tileColumns(W, H, effW, qty, overlap, gutter)
    const h = tileColumns(H, W, effW, qty, overlap, gutter)
    const pick = v.totalMm <= h.totalMm ? v : h
    return { lmBase: pick.totalLm, note: `Auto tiled (${pick.cols} col) @ ${Math.round(effW)}mm` }
  }

  // ---------- CUSTOM ----------
  const parts = Math.max(1, input.vinylSplitOverride ?? 1)
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const baseW = ori === 'Vertical' ? W / parts : W
  const baseH = ori === 'Vertical' ? H : H / parts
  const pieces = qty * parts

  type Fit = { totalMm: number; totalLm: number; perRow: number; rows: number; rotated: boolean }
  const candidates: Fit[] = []

  // Try as-is
  if (baseW <= effW) {
    const p = packAcrossWidth(baseW, baseH, effW, pieces, gutter)
    candidates.push({ ...p, rotated: false })
  }
  // Try rotated
  if (baseH <= effW) {
    const p = packAcrossWidth(baseH, baseW, effW, pieces, gutter)
    candidates.push({ ...p, rotated: true })
  }

  if (candidates.length) {
    const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
    return {
      lmBase: pick.totalLm,
      note: `Custom ${parts}× ${ori}${pick.rotated ? ' (rotated)' : ''}, ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
    }
  }

  // Neither orientation fits across → tile both ways; choose cheaper
  const ta = tileColumns(baseW, baseH, effW, pieces, overlap, gutter)
  const tb = tileColumns(baseH, baseW, effW, pieces, overlap, gutter)
  const useRot = tb.totalMm < ta.totalMm
  const pick   = useRot ? tb : ta
  return {
    lmBase: pick.totalLm,
    note: `Custom ${parts}× ${ori}${useRot ? ' (rotated)' : ''}, tiled (${pick.cols} col) @ ${Math.round(effW)}mm`,
  }
}

export function deliveryFromGirth(settings: Settings, wMm: number, hMm: number, tMm = 10) {
  const girthCm = (wMm + hMm + tMm) / 10
  const base = (settings as any).deliveryBase ?? (settings as any).delivery?.baseFee ?? 0
  const bands = Array.isArray((settings as any).deliveryBands)
      ? (settings as any).deliveryBands.map((b: any) => ({
        max: typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? Infinity),
        price: base + (b.surcharge ?? 0),
      }))
      : Array.isArray((settings as any).delivery?.bands)
          ? (settings as any).delivery.bands.map((b: any) => ({
            max: typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? Infinity),
            price: (settings as any).delivery.baseFee + (b.surcharge ?? 0),
          }))
          : [{ max: Infinity, price: 0 }]

  bands.sort((a: { max: number }, b: { max: number }) => a.max - b.max)
  const band = bands.find((b: { max: number }) => girthCm <= b.max) || bands[bands.length - 1]
  return { band: `${band.max} cm`, price: band.price }
}

export function priceSingle(
    input: SingleSignInput, media: VinylMedia[], substrates: Substrate[], rawSettings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(rawSettings as any)
  const notes: string[] = []

  // Printed area used for ink (rectangle).
  // No ink for Solid Colour Cut Vinyl or Substrate Only (as requested).
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * (input.qty || 1))

  // Rectangle perimeter (for optional perimeter charging)
  const perimeterM = ((((input.widthMm || 0) + (input.heightMm || 0)) * 2) / 1000) * (input.qty || 1)

  let materials = 0
  const vinylCostItems: { media: string; lm: number; pricePerLm: number; cost: number }[] = []
  const substrateCostItems: {
    material: string; sheet: string; neededSheets: number; chargedSheets: number; pricePerSheet: number; cost: number
  }[] = []
  const inkRate = s.inkElecPerSqm ?? 0
  let ink = areaSqm * inkRate
  let setup = s.setupFee || 0
  let cutting = (s.cutPerSign || 0) * (input.qty || 1)
  let finishingUplift = 0

  // Track vinyl length so we can charge per-lm add-ons (and add waste)
  let vinylLmRaw = 0
  let vinylLmWithWaste = 0

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmRaw: number, pricePerLm: number, printed: boolean) => {
    const waste = printed ? (s.vinylWasteLmPerJob || 0) : 0   // +1.00 lm (or whatever is configured)
    vinylLmRaw = lmRaw
    vinylLmWithWaste = lmRaw + waste
    materials += vinylLmWithWaste * pricePerLm
  }

  // --- SOLID COLOUR CUT VINYL ---
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm || 0
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / ((input.widthMm || 0) + gutter)))
    const rows = Math.ceil((input.qty || 1) / perRow)
    const lm = (rows * ((input.heightMm || 0) + gutter)) / 1000
    addVinylCost(lm, mediaItem.pricePerLm, false)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

    // Per-lm application tape (if enabled)
    if (input.applicationTape && s.applicationTapePerLm) {
      materials += lm * s.applicationTapePerLm
      notes.push(`Application tape: ${lm.toFixed(2)} lm × £${s.applicationTapePerLm.toFixed(2)}`)
    }

    const fin: Finishing = input.finishing ?? 'None'
    const _uplift = (s as any).finishingUplifts?.[fin] ?? 0
    if (_uplift) finishingUplift += _uplift * (materials + ink + cutting + setup)
  }

  // --- PRINTED VINYL MODES ---
  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    const v = computeVinylLm(input, mediaItem, s)
    let lm = v.lmBase
    if (input.doubleSided) lm *= 2

    addVinylCost(lm, mediaItem.pricePerLm, true)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(v.note)

    // Per-lm application tape
    if (input.applicationTape && s.applicationTapePerLm) {
      materials += lm * s.applicationTapePerLm
      notes.push(`Application tape: ${lm.toFixed(2)} lm × £${s.applicationTapePerLm.toFixed(2)}`)
    }
    // Per-lm white backing
    if (input.backedWithWhite && s.whiteBackingPerLm) {
      materials += lm * s.whiteBackingPerLm
      notes.push(`White backing: ${lm.toFixed(2)} lm × £${s.whiteBackingPerLm.toFixed(2)}`)
    }

    const fin: Finishing = input.finishing ?? 'None'
    const _uplift = (s as any).finishingUplifts?.[fin] ?? 0
    if (_uplift) finishingUplift += _uplift * (materials + ink + cutting + setup)
  }

  // --- SUBSTRATE ---
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')
    const usableW = Math.max(0, substrateItem.sizeW - 2 * (s.substrateMarginMm || 0))
    const usableH = Math.max(0, substrateItem.sizeH - 2 * (s.substrateMarginMm || 0))
    const usableArea = Math.max(1, usableW * usableH)
    const signArea = (input.widthMm || 0) * (input.heightMm || 0)
    const neededSheetsRaw = (signArea * (input.qty || 1)) / usableArea
    const chargedSheets = Math.ceil(neededSheetsRaw > 0 ? neededSheetsRaw : 0)
    const sheetCost = substrateItem.pricePerSheet
    materials += sheetCost * chargedSheets

    // (Optional) stats/line item
    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })
  }

  // -------- CUT OPTIONS --------
  if (input.plotterCut && input.plotterCut !== 'None') {
    const perimAdd = (s.plotterPerimeterPerM ?? 0) * perimeterM
    const perPiece = s.plotterCutPerPiece?.[input.plotterCut] ?? 0
    const pieceAdd = perPiece * (input.qty || 1)
    const setupMap: Record<string, number> = {
      KissOnRoll: (s as any).plotterCutSetup?.KissOnRoll ?? 0,
      KissOnSheets: (s as any).plotterCutSetup?.KissOnSheets ?? 0,
      CutIndividually: (s as any).plotterCutSetup?.CutIndividually ?? 0,
      CutAndWeeded: (s as any).plotterCutSetup?.CutAndWeeded ?? 0,
    }
    const setupAdd = setupMap[input.plotterCut] ?? 0
    cutting += perimAdd + pieceAdd + setupAdd
    const parts: string[] = []
    if (setupAdd) parts.push(`setup £${setupAdd.toFixed(2)}`)
    if (pieceAdd) parts.push(`${input.qty} × £${perPiece.toFixed(2)} = £${pieceAdd.toFixed(2)}`)
    if (perimAdd) parts.push(`perimeter £${perimAdd.toFixed(2)}`)
    notes.push(`Cut option: ${input.plotterCut} — ${parts.join(' + ') || '£0.00'}`)
  } else if (s.cutPerSign) {
    notes.push(`Cut option: None — setup £0.00 + ${input.qty} × £${s.cutPerSign.toFixed(2)} = £${(s.cutPerSign * (input.qty || 1)).toFixed(2)}`)
  }

  // -------- BUILD TOTALS --------
  const profit = s.profitMultiplier ?? 1
  const preDelivery = (materials + ink) * profit + (setup + cutting + finishingUplift)

  const { band, price: bandPrice } = deliveryFromGirth(s, input.widthMm || 0, input.heightMm || 0)
  const deliveryBase = (s as any).deliveryBase ?? (s as any).delivery?.baseFee ?? 0
  const delivery = deliveryBase + bandPrice
  const total = preDelivery + delivery

  return {
    materials: +materials.toFixed(2),
    ink: +ink.toFixed(2),
    setup: +setup.toFixed(2),
    cutting: +cutting.toFixed(2),
    finishingUplift: +finishingUplift.toFixed(2),
    preDelivery: +preDelivery.toFixed(2),
    delivery: +delivery.toFixed(2),
    total: +total.toFixed(2),

    vinylLm: vinylLmRaw ? +vinylLmRaw.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLmWithWaste ? +vinylLmWithWaste.toFixed(3) : undefined,

    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    deliveryBand: band,
    notes,
  }
}
