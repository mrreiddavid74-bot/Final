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

export function getEffectiveWidths(media: VinylMedia, settings: Settings) {
  const printCaps = [
    settings.masterMaxPrintWidthMm,
    media.rollPrintableWidthMm,
    media.maxPrintWidthMm ?? Infinity,
  ]
  const cutCaps = [
    settings.masterMaxCutWidthMm,
    media.rollWidthMm,
    media.maxCutWidthMm ?? Infinity,
  ]
  return {
    effectivePrintWidthMm: Math.min(...printCaps),
    effectiveCutWidthMm: Math.min(...cutCaps),
  }
}

/** Auto-tiling a single sign across print width; returns columns and LM for one copy. */
export function tileVinylByWidth(
    pieceW: number,
    pieceH: number,
    effectivePrintW: number,
    overlapMm: number,
    gutterMm: number,
): { columns: number; lm: number; notes: string[] } {
  const denom = Math.max(1, effectivePrintW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  const lm = (columns * (pieceH + gutterMm)) / 1000 // stack columns down the roll
  const notes = [`Tiled into ${columns} column(s) @ ${effectivePrintW}mm max print width`]
  return { columns, lm, notes }
}

/** Solid cut vinyl packing across cut width (no printing). */
export function cutVinylUtilisation(
    w: number,
    h: number,
    qty: number,
    effectiveCutW: number,
    gutter: number,
): { lm: number; perRow: number; rows: number; notes: string[] } {
  const perRow = Math.max(1, Math.floor(effectiveCutW / (w + gutter)))
  const rows = Math.ceil(qty / perRow)
  const lm = (rows * (h + gutter)) / 1000
  const notes = [`${perRow}/row across ${effectiveCutW}mm cut width, ${rows} row(s)`]
  return { lm, perRow, rows, notes }
}

/** Sheet substrate fraction helper (¼/½/¾/full) by area ratio. */
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
  if (u <= 0.25) fraction = 0.25
  else if (u <= 0.5) fraction = 0.5
  else if (u <= 0.75) fraction = 0.75
  else fraction = 1
  return { fraction, usagePct: clamp(u * 100, 0, 100) }
}

/** Delivery pricing (nested or flat config) by simple girth (L+W+H) in cm. */
export function deliveryFromGirth(
    settings: Settings,
    wMm: number,
    hMm: number,
    tMm = 10
): { band: string; price: number } {
  const s: any = settings as any
  const girthCm = (wMm + hMm + tMm) / 10

  type BandNorm = { max: number; price: number; name: string }

  // 1) Nested: delivery.baseFee + bands[]
  if (s.delivery?.bands?.length) {
    const pick = (b: any): BandNorm => ({
      max:
          typeof b.maxGirthCm === 'number'
              ? b.maxGirthCm
              : typeof b.maxSumCm === 'number'
                  ? b.maxSumCm
                  : Infinity,
      price:
          typeof b.price === 'number'
              ? b.price
              : typeof b.surcharge === 'number'
                  ? (s.delivery.baseFee ?? 0) + b.surcharge
                  : s.delivery.baseFee ?? 0,
      name:
          b.name ??
          `${Math.round(
              typeof b.maxGirthCm === 'number' ? b.maxGirthCm : b.maxSumCm ?? 0
          )} cm`,
    })

    const norm: BandNorm[] = (s.delivery.bands as any[])
        .map(pick)
        .sort((a: BandNorm, b: BandNorm) => a.max - b.max)

    const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  // 2) Flat: deliveryBase + deliveryBands[] (surcharge)
  if (typeof s.deliveryBase === 'number' && Array.isArray(s.deliveryBands)) {
    const base = s.deliveryBase

    const norm: BandNorm[] = (s.deliveryBands as any[])
        .map((b: any): BandNorm => ({
          max: b.maxGirthCm ?? b.maxSumCm ?? Infinity,
          price: base + (b.surcharge ?? 0),
          name: b.name ?? `${Math.round(b.maxGirthCm ?? b.maxSumCm ?? 0)} cm`,
        }))
        .sort((a: BandNorm, b: BandNorm) => a.max - b.max)

    const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  return { band: 'N/A', price: 0 }
}

/** Step & repeat identical signs across roll width (printed jobs). */
function repeatAcrossWidth(
    pieceW: number,  // sign width incl. margin
    pieceH: number,  // sign height incl. margin
    qty: number,
    effectivePrintW: number,
    gutterMm: number
): { perRow: number; rows: number; lmTotal: number; notes: string[] } {
  const notes: string[] = []
  const perRow = Math.max(1, Math.floor(effectivePrintW / (pieceW + gutterMm)))
  const rows = Math.max(1, Math.ceil(qty / perRow))
  const lmTotal = (rows * (pieceH + gutterMm)) / 1000 // length advanced down the roll
  notes.push(`${perRow}/row across ${effectivePrintW}mm print width, ${rows} row(s)`)
  return { perRow, rows, lmTotal, notes }
}

/** Optional: panelisation helper (respect user-forced panel count). */
function tileWithPanels(
    pieceW: number,
    pieceH: number,
    effectivePrintW: number,
    overlapMm: number,
    gutterMm: number,
    panelCount: number,
    orientation: Orientation | undefined
): { tiles: number; lmPerSign: number; notes: string[] } {
  const notes: string[] = []
  if (!panelCount || panelCount <= 0) {
    const { columns, lm, notes: n } = tileVinylByWidth(
        pieceW, pieceH, effectivePrintW, overlapMm, gutterMm
    )
    notes.push(...n)
    return { tiles: columns, lmPerSign: lm, notes }
  }

  // Vertical: split width into N drops
  if (orientation !== 'Horizontal') {
    const requiredPanelW = (pieceW + overlapMm * (panelCount - 1)) / panelCount
    if (requiredPanelW <= effectivePrintW) {
      const columns = panelCount
      const lm = (columns * (pieceH + gutterMm)) / 1000
      notes.push(`Forced ${columns} vertical panel(s)`)
      return { tiles: columns, lmPerSign: lm, notes }
    } else {
      notes.push(
          `Requested ${panelCount} vertical panel(s) exceed ${effectivePrintW}mm; auto-tiling used`
      )
      const { columns, lm, notes: n } = tileVinylByWidth(
          pieceW, pieceH, effectivePrintW, overlapMm, gutterMm
      )
      notes.push(...n)
      return { tiles: columns, lmPerSign: lm, notes }
    }
  }

  // Horizontal: split height into N strips (width must fit across roll)
  if (pieceW <= effectivePrintW) {
    const rows = panelCount
    const lm = (rows * (pieceW + gutterMm)) / 1000
    notes.push(`Forced ${rows} horizontal panel(s)`)
    return { tiles: rows, lmPerSign: lm, notes }
  } else {
    notes.push(
        `Requested horizontal panels but width ${pieceW}mm exceeds ${effectivePrintW}mm; auto-tiling used`
    )
    const { columns, lm, notes: n } = tileVinylByWidth(
        pieceW, pieceH, effectivePrintW, overlapMm, gutterMm
    )
    notes.push(...n)
    return { tiles: columns, lmPerSign: lm, notes }
  }
}

export function priceSingle(
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    settings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(settings as any)
  const notes: string[] = []

  // Ink area (printed modes only)
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm(input.widthMm * input.heightMm * input.qty)

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

  const inkRate = (s.inkCostPerSqm ?? s.inkElecPerSqm ?? 0)
  let ink = areaSqm * inkRate
  const setup = s.setupFee
  let cutting = s.cutPerSign * input.qty

  // report-only fields (we include uplift value in the return)
  let finishingUpliftPct = 0

  // stats
  let vinylLmRaw = 0
  let vinylLmWithWaste = 0
  let tiles = 0
  let sheetFraction: 0.25 | 0.5 | 0.75 | 1 | undefined
  let sheetsUsed: number | undefined
  let usagePct: number | undefined

  // lookups
  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmTotal: number, pricePerLm: number, printed: boolean) => {
    const lmWithWaste = printed ? lmTotal + s.vinylWasteLmPerJob : lmTotal
    materials += lmWithWaste * pricePerLm
    vinylLmRaw = lmTotal
    vinylLmWithWaste = lmWithWaste
  }

  // --- Solid cut vinyl ---
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm

    const { lm, perRow, rows, notes: n } = cutVinylUtilisation(
        input.widthMm + s.vinylMarginMm,
        input.heightMm + s.vinylMarginMm,
        input.qty,
        effectiveCutWidthMm,
        gutter
    )
    notes.push(...n)
    addVinylCost(lm, mediaItem.pricePerLm, /* printed */ false)
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lm.toFixed(3) as unknown as number,
      pricePerLm: mediaItem.pricePerLm,
      cost: +(lm * mediaItem.pricePerLm).toFixed(2),
    })

    const _cps = (s as any).complexityPerSticker as Partial<Record<string, number>> | undefined
    if (input.complexity && _cps && typeof _cps[input.complexity] === 'number') {
      cutting += (_cps[input.complexity] as number) * input.qty
    }

    if (input.applicationTape !== false) {
      const tapeArea = mm2ToSqm(
          (input.widthMm + s.vinylMarginMm) * (input.heightMm + s.vinylMarginMm) * input.qty
      )
      const tapeRate = (s.applicationTapePerSqm ?? s.appTapePerSqm ?? 0)
      materials += tapeArea * tapeRate
    }

    const fin: Finishing = input.finishing ?? 'None'
    finishingUpliftPct = (s as any).finishingUplifts?.[fin] ?? 0
  }

  // --- Printed vinyl (with/without cut; with/without substrate) ---
  if (
      input.mode === 'PrintedVinylOnly' ||
      input.mode === 'PrintAndCutVinyl' ||
      input.mode === 'PrintedVinylOnSubstrate'
  ) {
    if (!mediaItem) throw new Error('Select a printable media')
    const { effectivePrintWidthMm, effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)

    const pieceW = input.widthMm + s.vinylMarginMm
    const pieceH = input.heightMm + s.vinylMarginMm
    const forcedPanels = Math.max(0, input.panelSplits ?? 0)

    let lmTotal = 0
    let tilesLocal = 0
    const localNotes: string[] = []

    if (forcedPanels > 0) {
      const { tiles: t, lmPerSign, notes: pn } = tileWithPanels(
          pieceW,
          pieceH,
          effectivePrintWidthMm,
          s.tileOverlapMm,
          s.vinylMarginMm,
          forcedPanels,
          input.panelOrientation
      )
      tilesLocal = t
      lmTotal = lmPerSign * Math.max(1, input.qty)
      localNotes.push(...pn, `Forced panels × qty → ${lmTotal.toFixed(2)} lm`)
    } else if (input.qty > 1) {
      const rep = repeatAcrossWidth(
          pieceW,
          pieceH,
          input.qty,
          effectivePrintWidthMm,
          s.vinylMarginMm
      )
      lmTotal = rep.lmTotal
      tilesLocal = rep.perRow
      localNotes.push('Step & repeat across width', ...rep.notes)
    } else {
      const { columns, lm, notes: n } = tileVinylByWidth(
          pieceW,
          pieceH,
          effectivePrintWidthMm,
          s.tileOverlapMm,
          s.vinylMarginMm
      )
      tilesLocal = columns
      lmTotal = lm
      localNotes.push(...n)
    }

    notes.push(...localNotes)
    tiles = tilesLocal

    addVinylCost(lmTotal, mediaItem.pricePerLm, /* printed */ true)

    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lmTotal.toFixed(3) as unknown as number,
      pricePerLm: mediaItem.pricePerLm,
      cost: +(lmTotal * mediaItem.pricePerLm).toFixed(2),
    })

    const needsCut = input.mode !== 'PrintedVinylOnly' && (input.finishing && input.finishing !== 'None')
    if (needsCut && effectiveCutWidthMm < effectivePrintWidthMm) {
      notes.push(`Cut limited to ${effectiveCutWidthMm}mm; printing at ${effectivePrintWidthMm}mm`)
    }

    if (input.mode !== 'PrintedVinylOnly' && input.applicationTape) {
      const tapeArea = mm2ToSqm(
          (input.widthMm + s.vinylMarginMm) * (input.heightMm + s.vinylMarginMm) * input.qty
      )
      const tapeRate = (s.applicationTapePerSqm ?? s.appTapePerSqm ?? 0)
      materials += tapeArea * tapeRate
    }

    const fin: Finishing = input.finishing ?? 'None'
    finishingUpliftPct = (s as any).finishingUplifts?.[fin] ?? 0
  }

  // --- Substrate costs ---
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    const usableW = Math.max(0, substrateItem.sizeW - 2 * s.substrateMarginMm)
    const usableH = Math.max(0, substrateItem.sizeH - 2 * s.substrateMarginMm)
    const usableArea = Math.max(1, usableW * usableH)
    const signArea = input.widthMm * input.heightMm

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
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })
  }

  // --- Totals ---
  const base = setup + materials + ink + cutting
  const upliftAmount = finishingUpliftPct > 0 ? finishingUpliftPct * base : 0
  const profit = s.profitMultiplier ?? 1
  const preDelivery = (base + upliftAmount) * profit

  const { band, price: bandPrice } = deliveryFromGirth(s, input.widthMm, input.heightMm)
  const delivery = bandPrice
  const total = preDelivery + delivery

  return {
    materials: +materials.toFixed(2),
    ink: +ink.toFixed(2),
    setup: +setup.toFixed(2),
    cutting: +cutting.toFixed(2),
    finishingUplift: +upliftAmount.toFixed(2),
    preDelivery: +preDelivery.toFixed(2),
    delivery: +delivery.toFixed(2),
    total: +total.toFixed(2),

    vinylLm: vinylLmRaw ? +vinylLmRaw.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLmWithWaste ? +vinylLmWithWaste.toFixed(3) : undefined,
    tiles,
    sheetFraction,
    sheetsUsed,
    usagePct: usagePct ? +usagePct.toFixed(1) : undefined,
    wastePct: usagePct ? +(100 - usagePct).toFixed(1) : undefined,
    deliveryBand: band,
    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    notes,
  }
}
