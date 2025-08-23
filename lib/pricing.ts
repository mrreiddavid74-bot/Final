import { Settings, VinylMedia, Substrate, SingleSignInput, PriceBreakdown, Finishing, Orientation } from './types'
import { normalizeSettings } from './settings-normalize'

const mm2ToSqm = (mm2: number) => mm2 / 1_000_000
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))

// Treat master cap 0/undefined as "no cap"
export function getEffectiveWidths(media: VinylMedia, settings: Settings) {
  const masterPrint = settings.masterMaxPrintWidthMm && settings.masterMaxPrintWidthMm > 0
      ? settings.masterMaxPrintWidthMm
      : Infinity
  const masterCut = settings.masterMaxCutWidthMm && settings.masterMaxCutWidthMm > 0
      ? settings.masterMaxCutWidthMm
      : Infinity

  const printCaps = [
    masterPrint,
    media.rollPrintableWidthMm,
    media.maxPrintWidthMm ?? Infinity,
  ]
  const cutCaps = [
    masterCut,
    media.rollWidthMm,
    media.maxCutWidthMm ?? Infinity,
  ]
  return {
    effectivePrintWidthMm: Math.min(...printCaps.map(v => (typeof v === 'number' ? v : Infinity))),
    effectiveCutWidthMm: Math.min(...cutCaps.map(v => (typeof v === 'number' ? v : Infinity))),
  }
}

/** Simple packer when a rectangle fits across the roll width. */
function packAcrossWidthLm(
    pieceW: number,      // mm
    pieceH: number,      // mm
    effW: number,        // mm
    qtyPieces: number,   // total panels to print
    gutterMm: number,    // spacing between rows
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + gutterMm)))
  const rows = Math.ceil(qtyPieces / perRow)
  const totalMm = rows * pieceH + Math.max(0, rows - 1) * gutterMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

/** Tile into columns when pieceW exceeds roll width. */
function tileColumnsLm(
    pieceW: number, pieceH: number, effW: number, qtyPieces: number,
    overlapMm: number, gutterMm: number
) {
  const denom = Math.max(1, effW - overlapMm)
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
    // Choose the orientation that minimizes total length.
    const long = Math.max(W, H)
    const short = Math.min(W, H)

    // If either orientation fits across width, pack that orientation.
    if (long <= effW) {
      const p = packAcrossWidthLm(long, short, effW, qty, gutter)
      return { lm: p.totalLm, note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm` }
    }
    if (short <= effW) {
      const p = packAcrossWidthLm(short, long, effW, qty, gutter)
      return { lm: p.totalLm, note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm` }
    }

    // Neither fits: tile the cheaper (fewer columns) orientation
    const v = tileColumnsLm(W, H, effW, qty, overlap, gutter)
    const h = tileColumnsLm(H, W, effW, qty, overlap, gutter)
    const pick = v.totalMm <= h.totalMm ? v : h
    const label = pick === v ? `${Math.round(W)}×${Math.round(H)}` : `${Math.round(H)}×${Math.round(W)}`
    return { lm: pick.totalLm, note: `Auto tiled (${pick.columns} col) ${label} @ ${Math.round(effW)}mm` }
  }

  // Custom override
  const parts = Math.max(0, Math.min(6, input.vinylSplitOverride ?? 0)) || 1
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const pieceW = ori === 'Vertical' ? W / parts : W
  const pieceH = ori === 'Vertical' ? H : H / parts
  const qtyPieces = qty * parts

  if (pieceW <= effW) {
    const p = packAcrossWidthLm(pieceW, pieceH, effW, qtyPieces, gutter)
    return { lm: p.totalLm, note: `Custom ${parts}× ${ori}, ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm` }
  } else {
    const t = tileColumnsLm(pieceW, pieceH, effW, qtyPieces, overlap, gutter)
    return { lm: t.totalLm, note: `Custom ${parts}× ${ori}, tiled (${t.columns} col) @ ${Math.round(effW)}mm` }
  }
}

/** Substrate charging by fraction (¼/½/¾/full). */
export function substrateFraction(
    signW: number, signH: number, sheetW: number, sheetH: number, margin: number,
): { fraction: 0.25 | 0.5 | 0.75 | 1; usagePct: number } {
  const usableW = Math.max(0, sheetW - 2 * margin)
  const usableH = Math.max(0, sheetH - 2 * margin)
  const sheetArea = usableW * usableH
  const signArea = signW * signH
  const u = sheetArea > 0 ? signArea / sheetArea : 1
  let fraction: 0.25 | 0.5 | 0.75 | 1 = 1
  if (u <= 0.25) fraction = 0.25
  else if (u <= 0.5) fraction = 0.5
  else if (u <= 0.75) fraction = 0.75
  else fraction = 1
  return { fraction, usagePct: clamp(u * 100, 0, 100) }
}

export function deliveryFromGirth(settings: Settings, wMm: number, hMm: number, tMm = 10): { band: string; price: number } {
  const s: any = settings as any
  const girthCm = (wMm + hMm + tMm) / 10

  if (s.delivery?.bands?.length) {
    type BandNorm = { max: number; price: number; name: string }
    const pick = (b: any): BandNorm => ({
      max: typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (typeof b.maxSumCm === 'number' ? b.maxSumCm : Infinity),
      price: typeof b.price === 'number' ? b.price : (typeof b.surcharge === 'number' ? (s.delivery.baseFee || 0) + b.surcharge : (s.delivery.baseFee || 0)),
      name: b.name ?? `${Math.round((typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? 0)))} cm`,
    })
    const norm: BandNorm[] = s.delivery.bands.map(pick).sort((a: BandNorm, b: BandNorm) => a.max - b.max)
    const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  if (typeof (s as any).deliveryBase === 'number' && Array.isArray((s as any).deliveryBands)) {
    const base = (s as any).deliveryBase
    type BandNorm = { max: number; price: number; name: string }
    const norm: BandNorm[] = (s as any).deliveryBands.map((b: any) => ({
      max: b.maxGirthCm ?? b.maxSumCm ?? Infinity,
      price: base + (b.surcharge ?? 0),
      name: b.name ?? `${Math.round(b.maxGirthCm ?? b.maxSumCm ?? 0)} cm`,
    })).sort((a: BandNorm, b: BandNorm) => a.max - b.max)
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

  const areaSqm = (input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly')
      ? 0
      : mm2ToSqm(input.widthMm * input.heightMm * input.qty)

  let materials = 0
  const vinylCostItems: { media: string; lm: number; pricePerLm: number; cost: number }[] = []
  const substrateCostItems: { material: string; sheet: string; neededSheets: number; chargedSheets: number; pricePerSheet: number; cost: number }[] = []
  const inkRate = (s.inkElecPerSqm ?? s.inkCostPerSqm ?? 0)
  let ink = areaSqm * inkRate
  let setup = s.setupFee
  let cutting = s.cutPerSign * input.qty
  let finishingUplift = 0

  let vinylLm = 0
  let tiles = 0
  let sheetFraction: 0.25 | 0.5 | 0.75 | 1 | undefined
  let sheetsUsed: number | undefined
  let usagePct: number | undefined

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lm: number, pricePerLm: number, printed: boolean) => {
    const lmWithWaste = printed ? lm + s.vinylWasteLmPerJob : lm
    materials += lmWithWaste * pricePerLm
    vinylLm = lmWithWaste
  }

  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / (input.widthMm + gutter)))
    const rows = Math.ceil(input.qty / perRow)
    const lm = rows * (input.heightMm + gutter) / 1000
    addVinylCost(lm, mediaItem.pricePerLm, false)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)
    const _cps = (s as any).complexityPerSticker as Partial<Record<string, number>> | undefined
    if (input.complexity && _cps && typeof _cps[input.complexity] === 'number') cutting += (_cps[input.complexity] as number) * input.qty
    if (input.applicationTape !== false) {
      const tapeArea = mm2ToSqm((input.widthMm + s.vinylMarginMm) * (input.heightMm + s.vinylMarginMm) * input.qty)
      const tapeRate = (s.applicationTapePerSqm ?? s.appTapePerSqm ?? 0)
      materials += tapeArea * tapeRate
    }
    const fin: Finishing = input.finishing ?? 'None'
    const _uplift = (s as any).finishingUplifts?.[fin] ?? 0
    finishingUplift = _uplift * (materials + ink + cutting + setup)
  }

  if (input.mode === 'PrintedVinylOnly' || input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    // NEW: drive vinyl length from the same logic as the UI
    const v = computeVinylLength(input, mediaItem, s)
    addVinylCost(v.lm, mediaItem.pricePerLm, true)
    vinylCostItems.push({ media: mediaItem.name, lm: +v.lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(v.lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(v.note)

    // Application tape optional for Print&Cut
    if (input.mode !== 'PrintedVinylOnly' && input.applicationTape) {
      const tapeArea = mm2ToSqm((input.widthMm + s.vinylMarginMm) * (input.heightMm + s.vinylMarginMm) * input.qty)
      const tapeRate = (s.applicationTapePerSqm ?? s.appTapePerSqm ?? 0)
      materials += tapeArea * tapeRate
    }

    const fin: Finishing = input.finishing ?? 'None'
    const _uplift = (s as any).finishingUplifts?.[fin] ?? 0
    finishingUplift = _uplift * (materials + ink + cutting + setup)
  }

  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')
    const usableW = Math.max(0, substrateItem.sizeW - 2 * s.substrateMarginMm)
    const usableH = Math.max(0, substrateItem.sizeH - 2 * s.substrateMarginMm)
    const usableArea = Math.max(1, usableW * usableH)
    const signArea = (input.widthMm) * (input.heightMm)
    const neededSheetsRaw = (signArea * input.qty) / usableArea
    const chargedSheets = Math.ceil(neededSheetsRaw > 0 ? neededSheetsRaw : 0)
    sheetsUsed = chargedSheets
    const sheetCost = substrateItem.pricePerSheet
    materials += sheetCost * chargedSheets
    sheetFraction = (neededSheetsRaw <= 1
        ? (neededSheetsRaw <= 0.25 ? 0.25 : neededSheetsRaw <= 0.5 ? 0.5 : neededSheetsRaw <= 0.75 ? 0.75 : 1)
        : 1) as 0.25 | 0.5 | 0.75 | 1
    usagePct = Math.max(0, Math.min(100, (signArea / usableArea) * 100))
    substrateCostItems.push({
      material: substrateItem.name,
      sheet: substrateItem.sizeW + '×' + substrateItem.sizeH,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2)
    })
  }

  const base = setup + materials + ink + cutting
  const profit = (s.profitMultiplier ?? 1)
  const preDelivery = base * profit
  const { band, price: bandPrice } = deliveryFromGirth(s, input.widthMm, input.heightMm)
  const deliveryBase = ((s as any).delivery?.baseFee ?? (s as any).deliveryBase ?? 0)
  const delivery = deliveryBase + bandPrice
  const total = preDelivery + delivery

  return {
    // Money
    materials: +materials.toFixed(2),
    ink: +ink.toFixed(2),
    setup: +setup.toFixed(2),                    // <-- added
    cutting: +cutting.toFixed(2),
    finishingUplift: +finishingUplift.toFixed(2),// <-- added
    preDelivery: +preDelivery.toFixed(2),
    delivery: +delivery.toFixed(2),
    total: +total.toFixed(2),

    // Stats
    vinylLm: vinylLm ? +vinylLm.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLm ? +vinylLm.toFixed(3) : undefined,
    tiles,
    sheetFraction,
    sheetsUsed,
    usagePct: usagePct ? +usagePct.toFixed(1) : undefined,
    wastePct: usagePct ? +(100 - usagePct).toFixed(1) : undefined,
    deliveryBand: band,

    // Detailed cost items (optional)
    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    notes
  }

}
