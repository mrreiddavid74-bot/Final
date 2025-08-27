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
  const cutCaps   = [masterCut,   media.rollWidthMm,         media.maxCutWidthMm   ?? Infinity]

  return {
    effectivePrintWidthMm: Math.min(...printCaps.map(v => (typeof v === 'number' ? v : Infinity))),
    effectiveCutWidthMm:   Math.min(...cutCaps.map(v   => (typeof v === 'number' ? v : Infinity))),
  }
}

/** Simple packer when a rectangle fits across the roll width. */
function packAcrossWidthLm(
    pieceW: number,
    pieceH: number,
    effW: number,
    qtyPieces: number,
    marginMm: number,
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + marginMm)))
  const rows   = Math.ceil(qtyPieces / perRow)
  const totalMm = rows * pieceH + (rows + 1) * marginMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

/** Tile into columns when pieceW exceeds roll width. */
function tileColumnsLm(
    pieceW: number,
    pieceH: number,
    effW: number,
    qtyPieces: number,
    overlapMm: number,
    marginMm: number,
) {
  const denom   = Math.max(1, effW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  const totalMm = columns * (qtyPieces * pieceH + (qtyPieces + 1) * marginMm)
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
  const qty = input.qty || 1
  const margin = s.vinylMarginMm || 0
  const overlap = s.tileOverlapMm || 0
  const auto = input.vinylAuto !== false

  if (auto && ((input.vinylSplitOverride ?? 0) === 0)) {
    const long  = Math.max(W, H)
    const short = Math.min(W, H)

    if (long <= effW) {
      const p = packAcrossWidthLm(long, short, effW, qty, margin)
      return { lm: p.totalLm, note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm` }
    }
    if (short <= effW) {
      const p = packAcrossWidthLm(short, long, effW, qty, margin)
      return { lm: p.totalLm, note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm` }
    }

    const v = tileColumnsLm(W, H, effW, qty, overlap, margin)
    const h = tileColumnsLm(H, W, effW, qty, overlap, margin)
    const pick = v.totalMm <= h.totalMm ? v : h
    const label = pick === v ? `${Math.round(W)}×${Math.round(H)}` : `${Math.round(H)}×${Math.round(W)}`
    return { lm: pick.totalLm, note: `Auto tiled (${pick.columns} col) ${label} @ ${Math.round(effW)}mm` }
  }

  // --- CUSTOM override ---
  const parts = Math.max(0, Math.min(6, input.vinylSplitOverride ?? 0)) || 1
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const baseW = ori === 'Vertical' ? W / parts : W
  const baseH = ori === 'Vertical' ? H : H / parts
  const pieces = qty * parts

  type Cand = { across: number; rows: number; totalMm: number; rotated: boolean }
  const candidates: Cand[] = []

  const tryIfFits = (acrossDim: number, lengthDim: number, rotated: boolean) => {
    if (acrossDim <= effW) {
      const perRow = Math.max(1, Math.floor(effW / (acrossDim + margin)))
      const rows = Math.ceil(pieces / perRow)
      const totalMm = rows * lengthDim + (rows + 1) * margin
      candidates.push({ across: perRow, rows, totalMm, rotated })
    }
  }

  tryIfFits(baseW, baseH, false)
  tryIfFits(baseH, baseW, true)

  if (candidates.length) {
    const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
    return { lm: pick.totalMm / 1000, note: `Custom ${parts}× ${ori}${pick.rotated ? ' (rotated)' : ''}, ${pick.across}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm` }
  }

  const denom = Math.max(1, effW - (s.tileOverlapMm || 0))
  const colsA = Math.ceil((baseW + (s.tileOverlapMm || 0)) / denom)
  const colsB = Math.ceil((baseH + (s.tileOverlapMm || 0)) / denom)
  const useRot = colsB < colsA
  const acrossDim = useRot ? baseH : baseW
  const lengthDim = useRot ? baseW : baseH
  const cols = Math.max(1, Math.min(6, useRot ? colsB : colsA))
  const totalMm = cols * (lengthDim + (s.vinylMarginMm || 0)) * pieces

  return { lm: totalMm / 1000, note: `Custom ${parts}× ${ori}${useRot ? ' (rotated)' : ''}, tiled (${cols} col) @ ${Math.round(effW)}mm` }
}

/** Delivery band selection (supports new + legacy schemas). */
export function deliveryFromGirth(
    settings: Settings,
    wMm: number,
    hMm: number,
    tMm = 10,
): { band: string; price: number } {
  const s: any = settings as any
  const girthCm = (wMm + hMm + tMm) / 10

  if (s.delivery?.bands?.length) {
    type BandNorm = { max: number; price: number; name: string }
    const pick = (b: any): BandNorm => ({
      max:   typeof b.maxGirthCm === 'number' ? b.maxGirthCm : typeof b.maxSumCm === 'number' ? b.maxSumCm : Infinity,
      price: typeof b.price === 'number' ? b.price : typeof b.surcharge === 'number' ? (s.delivery.baseFee || 0) + b.surcharge : s.delivery.baseFee || 0,
      name:  b.name ?? `${Math.round(typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? 0))} cm`,
    })
    const norm: BandNorm[] = s.delivery.bands.map(pick).sort((a: BandNorm, b: BandNorm) => a.max - b.max)
    const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  if (typeof (s as any).deliveryBase === 'number' && Array.isArray((s as any).deliveryBands)) {
    const base = (s as any).deliveryBase
    type BandNorm = { max: number; price: number; name: string }
    const norm: BandNorm[] = (s as any).deliveryBands
        .map((b: any) => ({
          max:   b.maxGirthCm ?? b.maxSumCm ?? Infinity,
          price: base + (b.surcharge ?? 0),
          name:  b.name ?? `${Math.round((b.maxGirthCm ?? b.maxSumCm ?? 0) as number)} cm`,
        }))
        .sort((a: BandNorm, b: BandNorm) => a.max - b.max)
    const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  return { band: 'N/A', price: 0 }
}

export function priceSingle(
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    settings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(settings as any)
  const notes: string[] = []

  const areaSqm =
      input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate'
          ? mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * (input.qty || 1))
          : 0

  const perimeterM = ((((input.widthMm || 0) + (input.heightMm || 0)) * 2) / 1000) * (input.qty || 1)

  let materials = 0
  const vinylCostItems: { media: string; lm: number; pricePerLm: number; cost: number }[] = []
  const substrateCostItems: {
    material: string
    sheet: string
    neededSheets: number
    chargedSheets: number
    pricePerSheet: number
    cost: number
  }[] = []
  const inkRate = (s as any).inkElecPerSqm ?? (s as any).inkCostPerSqm ?? 0
  let ink = areaSqm * inkRate
  let setup = (s as any).setupFee || 0
  let cutting = ((s as any).cutPerSign || 0) * (input.qty || 1)
  let finishingUplift = 0

  let vinylLmRaw = 0
  let vinylLmWithWaste = 0

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmNoWaste: number, pricePerLm: number, printed: boolean) => {
    const waste = printed ? ((s as any).vinylWasteLmPerJob ?? 0.5) : 0
    vinylLmRaw = lmNoWaste
    vinylLmWithWaste = lmNoWaste + waste
    materials += (lmNoWaste + waste) * pricePerLm
  }

  // --- SOLID COLOUR CUT VINYL ---
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const margin = (s as any).vinylMarginMm || 0
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / ((input.widthMm || 0) + margin)))
    const rows = Math.ceil((input.qty || 1) / perRow)
    const lm = (rows * ((input.heightMm || 0) + margin) + margin) / 1000
    addVinylCost(lm, mediaItem.pricePerLm, false)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +((lm) * mediaItem.pricePerLm).toFixed(2) })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

    if (input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`Application tape: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- PRINTED VINYL MODES ---
  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    const v = computeVinylLength(input, mediaItem, s)
    const lm = input.doubleSided ? v.lm * 2 : v.lm

    addVinylCost(lm, mediaItem.pricePerLm, true)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(v.note + (input.doubleSided ? ' (double sided)' : ''))

    if (input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`Application tape: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    if (input.backedWithWhite) {
      const rateLm = (s as any).whiteBackingPerLm ?? (s as any).whiteBackedPerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`White backed vinyl: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- SUBSTRATE COSTS (updated to pack panels per sheet) ---
  let sheetsUsed: number | undefined
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    const margin = (s as any).substrateMarginMm || 0
    const usableW = Math.max(0, substrateItem.sizeW - 2 * margin)
    const usableH = Math.max(0, substrateItem.sizeH - 2 * margin)

    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const splits = input.panelSplits ?? 0
    const N = splits === 0 ? 1 : splits
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const panelW = ori === 'Vertical' ? W / N : W
    const panelH = ori === 'Vertical' ? H     : H / N
    const totalPanels = (input.qty || 1) * N

    // capacity (as-is)
    const capA =
        Math.max(0, Math.floor(usableW / Math.max(1, panelW)) *
            Math.floor(usableH / Math.max(1, panelH)))
    // capacity (rotated)
    const capB =
        Math.max(0, Math.floor(usableW / Math.max(1, panelH)) *
            Math.floor(usableH / Math.max(1, panelW)))
    const panelsPerSheet = Math.max(capA, capB, 1)

    // Base integer sheet count from packing
    let chargedSheets = Math.ceil(totalPanels / panelsPerSheet)

    // Half-sheet rule only for tiny single jobs
    const sheetUsableArea = Math.max(1, usableW * usableH)
    const signArea = W * H
    const neededSheetsRaw = (signArea * (input.qty || 1)) / sheetUsableArea
    if (totalPanels === 1 && neededSheetsRaw <= 0.5) {
      chargedSheets = 0.5
    }

    sheetsUsed = typeof chargedSheets === 'number' ? chargedSheets : undefined

    const sheetCost = substrateItem.pricePerSheet
    materials += sheetCost * chargedSheets
    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets: typeof chargedSheets === 'number' ? +chargedSheets : (chargedSheets as any),
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })

    // Per-substrate-piece cut charge (qty × panels)
    const rate = (s as any).costPerCutSubstrate ?? (s as any)['Cost Per Cut Substrate'] ?? 0
    if (rate) {
      const pieces = totalPanels
      const add = rate * pieces
      cutting += add
      notes.push(`Substrate cut charge: ${pieces} × £${rate.toFixed(2)} = £${add.toFixed(2)}`)
    }

    // Optional: note how many panels per sheet the packer found
    if (panelsPerSheet > 0) {
      notes.push(`Substrate split: ${N} × ${ori} → panel ${Math.round(panelW)}×${Math.round(panelH)}mm; ${panelsPerSheet} per sheet`)
    }
  }

  // =========================
  // VINYL CUT OPTIONS PRICING
  // =========================
  if (input.plotterCut && input.plotterCut !== 'None') {
    const perimRate = (s as any).plotterPerimeterPerM ?? 0
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
  } else if ((s as any).cutPerSign) {
    notes.push(`Cut option: None — setup £0.00 + ${(input.qty || 1)} × £${(s as any).cutPerSign.toFixed(2)} = £${(((s as any).cutPerSign || 0) * (input.qty || 1)).toFixed(2)}`)
  }

  if (input.cuttingStyle) {
    const uplift = (s as any).cuttingStyleUplifts?.[input.cuttingStyle] ?? 0
    if (uplift) {
      const baseSoFar = materials + ink + cutting + setup
      const add = uplift * baseSoFar
      finishingUplift += add
      notes.push(`Cutting style (${input.cuttingStyle}): +${Math.round(uplift * 100)}% = £${add.toFixed(2)}`)
    }
  }

  // Totals
  const multiplier = (s as any).profitMultiplier ?? 1
  const preDelivery = (materials + ink) * multiplier + (setup + cutting + finishingUplift)

  const { band, price: bandPrice } = deliveryFromGirth(s, input.widthMm || 0, input.heightMm || 0)
  const baseFee = (s as any).delivery?.baseFee ?? (s as any).deliveryBase ?? 0
  const bandComponent = input.deliveryMode === 'OnARoll' ? 0 : bandPrice
  const delivery = baseFee + bandComponent
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

    // expose to UI so Substrate Splits can show the same value
    sheetsUsed,

    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    deliveryBand: band,
    notes,
  }
}
