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
    effectiveCutWidthMm:   Math.min(...cutCaps.map(v => (typeof v === 'number' ? v : Infinity))),
  }
}

/** Simple packer when a rectangle fits across the roll width. */
function packAcrossWidthLm(
    pieceW: number, // mm
    pieceH: number, // mm
    effW: number,   // mm
    qtyPieces: number, // total panels to print
    gutterMm: number,  // spacing between rows
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + gutterMm)))
  const rows   = Math.ceil(qtyPieces / perRow)
  // total length down the roll = sum of piece heights + gutters between rows
  const totalMm = rows * pieceH + Math.max(0, rows - 1) * gutterMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

/** Tile into columns when pieceW exceeds roll width. */
function tileColumnsLm(
    pieceW: number,
    pieceH: number,
    effW: number,
    qtyPieces: number,
    overlapMm: number,
    gutterMm: number,
) {
  const denom   = Math.max(1, effW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  const totalMm = columns * (pieceH + gutterMm) * qtyPieces
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
  const gutter = s.vinylMarginMm || 0
  const overlap = s.tileOverlapMm || 0

  // Default: auto unless explicitly set to false
  const auto = input.vinylAuto !== false

  if (auto) {
    const long  = Math.max(W, H)
    const short = Math.min(W, H)

    // If either orientation fits across width, pack that orientation.
    if (long <= effW) {
      const p = packAcrossWidthLm(long, short, effW, qty, gutter)
      return {
        lm: p.totalLm,
        note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }
    if (short <= effW) {
      const p = packAcrossWidthLm(short, long, effW, qty, gutter)
      return {
        lm: p.totalLm,
        note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }

    // Neither fits: tile the cheaper (fewer columns) orientation
    const v = tileColumnsLm(W, H, effW, qty, overlap, gutter)
    const h = tileColumnsLm(H, W, effW, qty, overlap, gutter)
    const pick = v.totalMm <= h.totalMm ? v : h
    const label = pick === v ? `${Math.round(W)}×${Math.round(H)}` : `${Math.round(H)}×${Math.round(W)}`
    return { lm: pick.totalLm, note: `Auto tiled (${pick.columns} col) ${label} @ ${Math.round(effW)}mm` }
  }

// --- CUSTOM override (try both orientations, pick the shorter) ---
  const parts = Math.max(0, Math.min(6, input.vinylSplitOverride ?? 0)) || 1;
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical';
  const baseW = ori === 'Vertical' ? W / parts : W;   // panel width if not rotated
  const baseH = ori === 'Vertical' ? H : H / parts;   // panel length if not rotated
  const pieces = qty * parts;

  type Cand = { across: number; rows: number; totalMm: number; rotated: boolean };
  const candidates: Cand[] = [];

  const tryIfFits = (acrossDim: number, lengthDim: number, rotated: boolean) => {
    if (acrossDim <= effW) {
      const perRow = Math.max(1, Math.floor(effW / (acrossDim + gutter)));
      const rows = Math.ceil(pieces / perRow);
      const totalMm = rows * lengthDim + Math.max(0, rows - 1) * gutter;
      candidates.push({ across: perRow, rows, totalMm, rotated });
    }
  };

// try as-is and rotated if they fit across the roll
  tryIfFits(baseW, baseH, false);
  tryIfFits(baseH, baseW, true);

  if (candidates.length) {
    const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b));
    return {
      lm: pick.totalMm / 1000,
      note: `Custom ${parts}× ${ori}${pick.rotated ? ' (rotated)' : ''}, ${pick.across}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
    };
  }

// neither orientation fits across → tile columns; choose the cheaper orientation
  const denom = Math.max(1, effW - overlap);
  const colsA = Math.ceil((baseW + overlap) / denom);
  const colsB = Math.ceil((baseH + overlap) / denom);
  const useRot = colsB < colsA;
  const acrossDim = useRot ? baseH : baseW;
  const lengthDim = useRot ? baseW : baseH;
  const cols = Math.max(1, Math.min(6, useRot ? colsB : colsA));
  const totalMm = cols * (lengthDim + gutter) * pieces;

  return {
    lm: totalMm / 1000,
    note: `Custom ${parts}× ${ori}${useRot ? ' (rotated)' : ''}, tiled (${cols} col) @ ${Math.round(effW)}mm`,
  };

}

/** Substrate charging by fraction (¼/½/¾/full). */
export function substrateFraction(
    signW: number,
    signH: number,
    sheetW: number,
    sheetH: number,
    margin: number,
): { fraction: 0.25 | 0.5 | 0.75 | 1; usagePct: number } {
  const usableW = Math.max(0, sheetW - 2 * margin)
  const usableH = Math.max(0, sheetH - 2 * margin)
  const sheetArea = usableW * usableH
  const signArea = signW * signH
  const u = sheetArea > 0 ? signArea / sheetArea : 1
  let fraction: 0.25 | 0.5 | 0.75 | 1 = 1
  if (u <= 0.25)      fraction = 0.25
  else if (u <= 0.5)  fraction = 0.5
  else if (u <= 0.75) fraction = 0.75
  else                fraction = 1
  return { fraction, usagePct: clamp(u * 100, 0, 100) }
}

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

  // Legacy fallback
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
  const inkRate = s.inkElecPerSqm ?? s.inkCostPerSqm ?? 0
  let ink = areaSqm * inkRate
  let setup = s.setupFee || 0
  let cutting = (s.cutPerSign || 0) * (input.qty || 1)
  let finishingUplift = 0

  // Track vinyl length so we can charge per-lm add-ons (app tape / white backing)
  let vinylLmRaw = 0
  let vinylLmWithWaste = 0

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lm: number, pricePerLm: number, printed: boolean) => {
    const waste = printed ? (s.vinylWasteLmPerJob || 0) : 0
    vinylLmRaw = lm
    vinylLmWithWaste = lm + waste
    materials += (lm + waste) * pricePerLm
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
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lm.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +(((lm) * mediaItem.pricePerLm)).toFixed(2),
    })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

    // (Optional) complexity add-on per sticker
    const cps = (s as any).complexityPerSticker as Partial<Record<string, number>> | undefined
    if (input.complexity && cps && typeof cps[input.complexity] === 'number') {
      cutting += (cps[input.complexity] as number) * (input.qty || 1)
    }

    // Application tape — PER LM of vinyl used (no waste is added for solid colour in addVinylCost)
    if (input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`Application tape: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    // Finishing uplift
    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    if (upliftPct) finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // --- PRINTED VINYL MODES (no 'PrintedVinylOnly') ---
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
    notes.push(v.note)

    // Application tape — PER LM (only if ticked)
    if (input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const len = vinylLmWithWaste || vinylLmRaw
        const add = rateLm * len
        materials += add
        notes.push(`Application tape: ${len.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    // White backing — PER LM (only if ticked)
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

  // --- SUBSTRATE COSTS ---
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

    // (Optional) report stats
    // const { fraction, usagePct } = substrateFraction(...)
    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })
  }

  // =========================
  // VINYL CUT OPTIONS PRICING
  // =========================

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
    notes.push(`Cut option: ${input.plotterCut} — ${msg.join(' + ')}`)
  }

  // C) Optional Cutting style uplift (percentage on base)
  if (input.cuttingStyle) {
    const uplift = (s as any).cuttingStyleUplifts?.[input.cuttingStyle] ?? 0
    if (uplift) {
      const baseSoFar = materials + ink + cutting + setup
      const add = uplift * baseSoFar
      finishingUplift += add
      notes.push(`Cutting style (${input.cuttingStyle}): +${Math.round(uplift * 100)}% = £${add.toFixed(2)}`)
    }
  }

  // =========================
  // BUILD TOTALS (your requested formula)
  // preDelivery = (materials + ink) * multiplier + (setup + cutting + finishingUplift)
  // =========================
  const multiplier = s.profitMultiplier ?? 1
  const preDelivery = (materials + ink) * multiplier + (setup + cutting + finishingUplift)

  const { band, price: bandPrice } = deliveryFromGirth(
      s,
      input.widthMm || 0,
      input.heightMm || 0,
  )
  const deliveryBase = (s as any).delivery?.baseFee ?? (s as any).deliveryBase ?? 0
  const delivery = deliveryBase + bandPrice
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
    // (sheet metrics left out here for brevity, keep your earlier fields if you need them)

    // Detailed cost items (optional)
    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    deliveryBand: band,
    notes,
  }
}
