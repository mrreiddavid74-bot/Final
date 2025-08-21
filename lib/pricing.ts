import { Settings, VinylMedia, Substrate, SingleSignInput, PriceBreakdown, Finishing, Orientation } from './types'
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

/** Compute vinyl tiling into columns given max/effective print width. Returns columns and lm before +1m waste. */
export function tileVinylByWidth(
    pieceW: number,
    pieceH: number,
    effectivePrintW: number,
    overlapMm: number,
    gutterMm: number,
): { columns: number; lm: number; notes: string[] } {
  const denom = Math.max(1, effectivePrintW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  const lm = columns * (pieceH + gutterMm) / 1000 // stack columns sequentially down the roll
  const notes = [`Tiled into ${columns} column(s) @ ${effectivePrintW}mm max print width`]
  return { columns, lm, notes }
}

/**
 * For solid cut vinyl (no printing): pack rectangles across cut width.
 * Simple heuristic: items per row = floor(effectiveCutW / (w + gutter)), rows = ceil(qty/itemsPerRow)
 */
export function cutVinylUtilisation(
    w: number,
    h: number,
    qty: number,
    effectiveCutW: number,
    gutter: number,
): { lm: number; perRow: number; rows: number; notes: string[] } {
  const perRow = Math.max(1, Math.floor(effectiveCutW / (w + gutter)))
  const rows = Math.ceil(qty / perRow)
  const lm = rows * (h + gutter) / 1000
  const notes = [`${perRow}/row across ${effectiveCutW}mm cut width, ${rows} row(s)`]
  return { lm, perRow, rows, notes }
}

/**
 * Substrate charging by fraction (¼/½/¾/full). We approximate utilisation by area ratio and round up.
 * You can replace with a guillotine/shelf packer later for Mixed Signs.
 */
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

export function deliveryFromGirth(
    settings: Settings,
    wMm: number,
    hMm: number,
    tMm = 10
): { band: string; price: number } {
  // Simple girth L+W+H in cm. Thickness tMm default 10mm; adjust as needed.
  const s: any = settings as any
  const girthCm = (wMm + hMm + tMm) / 10

  // 1) Nested: settings.delivery = { baseFee, bands: [{ maxGirthCm|maxSumCm, price|surcharge, name? }] }
  if (s.delivery?.bands?.length) {
    const bands = s.delivery.bands
    const pick = (b: any) => ({
      max:
          typeof b.maxGirthCm === 'number'
              ? b.maxGirthCm
              : typeof b.maxSumCm === 'number'
                  ? b.maxSumCm
                  : Infinity,
      // price is absolute if present; else baseFee + surcharge; else baseFee
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
    const norm = bands
        .map(pick)
        .sort((a: any, b: any) => a.max - b.max)
    const band = norm.find((b: any) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  // 2) Flat: settings.deliveryBase + settings.deliveryBands (surcharge)
  if (typeof s.deliveryBase === 'number' && Array.isArray(s.deliveryBands)) {
    const base = s.deliveryBase
    const norm = s.deliveryBands
        .map((b: any) => ({
          max: b.maxGirthCm ?? b.maxSumCm ?? Infinity,
          price: base + (b.surcharge ?? 0), // absolute
          name: b.name ?? `${Math.round(b.maxGirthCm ?? b.maxSumCm ?? 0)} cm`,
        }))
        .sort((a: any, b: any) => a.max - b.max)
    const band = norm.find((b: any) => girthCm <= b.max) || norm.at(-1)!
    return { band: band.name, price: band.price }
  }

  // Fallback: no delivery configured
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

  // Ink area only for printed modes
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

  // report-only; folded into totals later
  let finishingUpliftPct = 0

  let vinylLmRaw = 0
  let vinylLmWithWaste = 0
  let tiles = 0
  let sheetFraction: 0.25 | 0.5 | 0.75 | 1 | undefined
  let sheetsUsed: number | undefined
  let usagePct: number | undefined

  // Common fetches
  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmTotal: number, pricePerLm: number, printed: boolean) => {
    const lmWithWaste = printed ? lmTotal + s.vinylWasteLmPerJob : lmTotal
    materials += lmWithWaste * pricePerLm
    vinylLmRaw = lmTotal
    vinylLmWithWaste = lmWithWaste
  }

  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm

    // width/height include margins for packing
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
      cost: +(lm * mediaItem.pricePerLm).toFixed(2)
    })

    // Complexity cost (per sticker) — optional map
    const _cps = (s as any).complexityPerSticker as Partial<Record<string, number>> | undefined
    if (input.complexity && _cps && typeof _cps[input.complexity] === 'number') {
      cutting += (_cps[input.complexity] as number) * input.qty
    }

    // Application tape included by default unless explicitly disabled
    if (input.applicationTape !== false) {
      const tapeArea = mm2ToSqm(
          (input.widthMm + s.vinylMarginMm) * (input.heightMm + s.vinylMarginMm) * input.qty
      )
      const tapeRate = (s.applicationTapePerSqm ?? s.appTapePerSqm ?? 0)
      materials += tapeArea * tapeRate
    }

    // Finishing uplifts (applied to base later)
    const fin: Finishing = input.finishing ?? 'None'
    finishingUpliftPct = (s as any).finishingUplifts?.[fin] ?? 0
  }

  if (
      input.mode === 'PrintedVinylOnly' ||
      input.mode === 'PrintAndCutVinyl' ||
      input.mode === 'PrintedVinylOnSubstrate'
  ) {
    if (!mediaItem) throw new Error('Select a printable media')
    const { effectivePrintWidthMm, effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)

    // Tiling for ONE sign
    const { columns, lm, notes: n } = tileVinylByWidth(
        input.widthMm + s.vinylMarginMm,
        input.heightMm + s.vinylMarginMm,
        effectivePrintWidthMm,
        s.tileOverlapMm,
        s.vinylMarginMm
    )
    notes.push(...n)
    tiles = columns

    // multiply by quantity (total LM across all copies)
    const lmTotal = lm * Math.max(1, input.qty)

    // Printed jobs include one-off job waste
    addVinylCost(lmTotal, mediaItem.pricePerLm, /* printed */ true)

    // Cost line reflects total LM
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lmTotal.toFixed(3) as unknown as number,
      pricePerLm: mediaItem.pricePerLm,
      cost: +(lmTotal * mediaItem.pricePerLm).toFixed(2)
    })

    // If contour cutting required, ensure tiles also fit cut width
    const needsCut = input.mode !== 'PrintedVinylOnly' && (input.finishing && input.finishing !== 'None')
    if (needsCut && effectiveCutWidthMm < effectivePrintWidthMm) {
      notes.push(`Cut limited to ${effectiveCutWidthMm}mm; printing at ${effectivePrintWidthMm}mm`)
    }

    // Application tape default for Print&Cut is off unless toggled
    if (input.mode !== 'PrintedVinylOnly' && input.applicationTape) {
      const tapeArea = mm2ToSqm(
          (input.widthMm + s.vinylMarginMm) * (input.heightMm + s.vinylMarginMm) * input.qty
      )
      const tapeRate = (s.applicationTapePerSqm ?? s.appTapePerSqm ?? 0)
      materials += tapeArea * tapeRate
    }

    // Finishing uplift (applied to base later)
    const fin: Finishing = input.finishing ?? 'None'
    finishingUpliftPct = (s as any).finishingUplifts?.[fin] ?? 0

    // Explain qty multiplier in notes
    notes.push(`Qty multiplier: ${input.qty} × ${lm.toFixed(2)} lm/sign = ${lmTotal.toFixed(2)} lm total`)
  }

  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    // Compute needed sheets by area (qty * sign area / usable sheet area)
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
      sheet: substrateItem.sizeW + '×' + substrateItem.sizeH,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2)
    })
  }

  // Totals
  const base = setup + materials + ink + cutting
  const upliftAmount = finishingUpliftPct > 0 ? finishingUpliftPct * base : 0
  const profit = (s.profitMultiplier ?? 1)
  const preDelivery = (base + upliftAmount) * profit

  const { band, price: bandPrice } = deliveryFromGirth(s, input.widthMm, input.heightMm)
  // bandPrice is already absolute (includes base where applicable)
  const delivery = bandPrice

  const total = preDelivery + delivery

  return {
    materials: +materials.toFixed(2),
    ink: +ink.toFixed(2),
    setup: +setup.toFixed(2),                 // ✅ included per your PriceBreakdown type
    cutting: +cutting.toFixed(2),
    finishingUplift: +upliftAmount.toFixed(2),// ✅ included per your PriceBreakdown type
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
    notes
  }
}
