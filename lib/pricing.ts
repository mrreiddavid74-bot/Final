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

// ---------------------------------------------------------
// Effective machine widths (respect master caps + media caps)
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

// ---------------------------------------------------------
// Packing helpers (LM calculations against a roll)
function packAcrossWidthLm(
    pieceW: number, pieceH: number, effW: number, qtyPieces: number, gutterMm: number
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + gutterMm)))
  const rows   = Math.ceil(qtyPieces / perRow)
  const totalMm = rows * pieceH + Math.max(0, rows - 1) * gutterMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

function tileColumnsLm(
    pieceW: number, pieceH: number, effW: number, qtyPieces: number, overlapMm: number, gutterMm: number
) {
  const denom   = Math.max(1, effW - overlapMm)
  const columns = Math.ceil((pieceW + overlapMm) / denom)
  const totalMm = columns * (pieceH + gutterMm) * qtyPieces
  return { columns, totalMm, totalLm: totalMm / 1000 }
}

/**
 * Compute the *base* vinyl length (single-sided) for the job
 * using the same logic the UI preview uses. We intentionally
 * do **not** apply double-sided here — that is applied only
 * when charging the media cost so that “extras” (app tape /
 * white backing) can remain independent of double-sided.
 */
function computeVinylLengthBase(
    input: SingleSignInput,
    mediaItem: VinylMedia,
    s: Settings,
): { lmBase: number; note: string } {
  const { effectivePrintWidthMm: effW } = getEffectiveWidths(mediaItem, s)
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const qty = input.qty || 1
  const gutter  = s.vinylMarginMm || 0
  const overlap = s.tileOverlapMm || 0

  const auto = input.vinylAuto !== false

  if (auto) {
    if (W <= effW || H <= effW) {
      // ✅ include totalLm in the type so TS knows it exists
      const cand: Array<{ perRow: number; rows: number; totalMm: number; totalLm: number; label: string }> = []
      if (W <= effW) {
        const p = packAcrossWidthLm(W, H, effW, qty, gutter)
        cand.push({ ...p, label: `${Math.round(W)}×${Math.round(H)}mm` })
      }
      if (H <= effW) {
        const p = packAcrossWidthLm(H, W, effW, qty, gutter)
        cand.push({ ...p, label: `${Math.round(H)}×${Math.round(W)}mm` })
      }
      const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      return {
        lmBase: pick.totalLm,
        note: `Auto (rotated if needed); ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }

    const v = tileColumnsLm(W, H, effW, qty, overlap, gutter)
    const h = tileColumnsLm(H, W, effW, qty, overlap, gutter)
    const pick = v.totalMm <= h.totalMm ? v : h
    return {
      lmBase: pick.totalLm,
      note: `Auto tiled (${pick.columns} col) @ ${Math.round(effW)}mm`,
    }
  }

  const parts = Math.max(0, Math.min(6, input.vinylSplitOverride ?? 0)) || 1
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const pieceW = ori === 'Vertical' ? W / parts : W
  const pieceH = ori === 'Vertical' ? H : H / parts
  const qtyPieces = qty * parts

  if (pieceW <= effW) {
    const p = packAcrossWidthLm(pieceW, pieceH, effW, qtyPieces, s.vinylMarginMm || 0)
    return {
      lmBase: p.totalLm,
      note: `Custom ${parts}× ${ori}, ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm`,
    }
  } else {
    const t = tileColumnsLm(pieceW, pieceH, effW, qtyPieces, s.tileOverlapMm || 0, s.vinylMarginMm || 0)
    return {
      lmBase: t.totalLm,
      note: `Custom ${parts}× ${ori}, tiled (${t.columns} col) @ ${Math.round(effW)}mm`,
    }
  }
}

// ---------------------------------------------------------
// Optional: simple fraction readout for substrates (¼/½/¾/full)
export function substrateFraction(
    signW: number, signH: number, sheetW: number, sheetH: number, margin: number,
): { fraction: 0.25 | 0.5 | 0.75 | 1; usagePct: number } {
  const usableW = Math.max(0, sheetW - 2 * margin)
  const usableH = Math.max(0, sheetH - 2 * margin)
  const sheetArea = usableW * usableH
  const signArea  = signW * signH
  const u = sheetArea > 0 ? signArea / sheetArea : 1
  let fraction: 0.25 | 0.5 | 0.75 | 1 = 1
  if (u <= 0.25) fraction = 0.25
  else if (u <= 0.5) fraction = 0.5
  else if (u <= 0.75) fraction = 0.75
  else fraction = 1
  return { fraction, usagePct: clamp(u * 100, 0, 100) }
}

// ---------------------------------------------------------
// Delivery from size “girth” style bands (supports legacy/new)
export function deliveryFromGirth(
    settings: Settings,
    wMm: number,
    hMm: number,
    tMm = 10,
): { band: string; price: number } {
    const s: any = settings as any;
    const girthCm = (wMm + hMm + tMm) / 10;

    type BandNorm = { max: number; price: number; name: string };

    // New-style shape: settings.delivery = { baseFee, bands:[{ maxGirthCm/maxSumCm, price|surcharge, name? }, ...] }
    if (s.delivery?.bands?.length) {
        const baseFee = s.delivery.baseFee || 0;
        const norm: BandNorm[] = s.delivery.bands
            .map((b: any): BandNorm => ({
                max:   typeof b.maxGirthCm === 'number' ? b.maxGirthCm
                    : typeof b.maxSumCm   === 'number' ? b.maxSumCm
                        : Infinity,
                price: typeof b.price      === 'number' ? b.price
                    : typeof b.surcharge  === 'number' ? baseFee + b.surcharge
                        : baseFee,
                name:  b.name ?? `${Math.round(typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? 0))} cm`,
            }))
            .sort((a: BandNorm, b: BandNorm) => a.max - b.max);

        const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) ?? norm[norm.length - 1]!;
        return { band: band.name, price: band.price };
    }

    // Legacy flat form: deliveryBase + deliveryBands:[{ maxGirthCm/maxSumCm, surcharge, name? }]
    if (typeof s.deliveryBase === 'number' && Array.isArray(s.deliveryBands)) {
        const base = s.deliveryBase as number;
        const norm: BandNorm[] = s.deliveryBands
            .map((b: any): BandNorm => ({
                max:   b.maxGirthCm ?? b.maxSumCm ?? Infinity,
                price: base + (b.surcharge ?? 0),
                name:  b.name ?? `${Math.round(b.maxGirthCm ?? b.maxSumCm ?? 0)} cm`,
            }))
            .sort((a: BandNorm, b: BandNorm) => a.max - b.max);

        const band: BandNorm = norm.find((b: BandNorm) => girthCm <= b.max) ?? norm[norm.length - 1]!;
        return { band: band.name, price: band.price };
    }

    return { band: 'N/A', price: 0 };
}

// ---------------------------------------------------------
// Main pricing
export function priceSingle(
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    settings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(settings as any)
  const notes: string[] = []

  // Printed area used for ink (double-sided does NOT change this per your rule)
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * (input.qty || 1))

  // Simple perimeter (used if you also charge per-meter cutting)
  const perimeterM = ((((input.widthMm || 0) + (input.heightMm || 0)) * 2) / 1000) * (input.qty || 1)

  // Running totals
  let materialsOnly = 0 // only things that get multiplied by profit
  let ink = areaSqm * (s.inkElecPerSqm ?? s.inkCostPerSqm ?? 0)

  // Extras added AFTER profit multiplier:
  let extraAfterMultiplier = 0

  // Detailed items
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

  // For info display
  let vinylLmBase = 0           // single-sided LM (for app tape / white backing)
  let vinylLmCharged = 0        // LM we actually bill the media for (×2 if double-sided and printed)
  let vinylLmWithWaste = 0
  let sheetsUsed: number | undefined
  let usagePct: number | undefined
  let sheetFraction: 0.25 | 0.5 | 0.75 | 1 | undefined

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylMaterial = (lmCharged: number, pricePerLm: number) => {
    const waste = s.vinylWasteLmPerJob || 0
    vinylLmCharged = lmCharged
    vinylLmWithWaste = lmCharged + waste
    const cost = vinylLmWithWaste * pricePerLm
    materialsOnly += cost
  }

  // ----------------------------
  // Mode: Solid Colour Cut Vinyl
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm || 0
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / ((input.widthMm || 0) + gutter)))
    const rows   = Math.ceil((input.qty || 1) / perRow)
    const lm     = (rows * ((input.heightMm || 0) + gutter)) / 1000

    vinylLmBase = lm
    addVinylMaterial(lm, mediaItem.pricePerLm)

    vinylCostItems.push({
      media: mediaItem.name,
      lm: +vinylLmCharged.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +(vinylLmCharged * mediaItem.pricePerLm).toFixed(2),
    })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)
  }

  // ----------------------------
  // Modes: Printed (Print&Cut / Printed on Substrate)
  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    const v = computeVinylLengthBase(input, mediaItem, s)
    vinylLmBase = v.lmBase

    const sides = input.doubleSided ? 2 : 1
    const lmCharged = vinylLmBase * sides
    addVinylMaterial(lmCharged, mediaItem.pricePerLm)

    vinylCostItems.push({
      media: mediaItem.name,
      lm: +lmCharged.toFixed(3),
      pricePerLm: mediaItem.pricePerLm,
      cost: +(lmCharged * mediaItem.pricePerLm).toFixed(2),
    })
    notes.push(v.note + (sides > 1 ? ' ×2 sides (vinyl only)' : ''))

    if (input.mode === 'PrintAndCutVinyl' && input.applicationTape) {
      const rateLm = (s as any).appTapePerLm ?? (s as any).applicationTapePerLm ?? 0
      if (rateLm) {
        const add = vinylLmBase * rateLm
        extraAfterMultiplier += add
        notes.push(`Application tape: ${vinylLmBase.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }

    if (input.backedWithWhite) {
      const rateLm = (s as any).whiteBackingPerLm ?? 0
      if (rateLm) {
        const add = vinylLmBase * rateLm
        extraAfterMultiplier += add
        notes.push(`White backing: ${vinylLmBase.toFixed(2)} lm × £${rateLm.toFixed(2)} = £${add.toFixed(2)}`)
      }
    }
  }

  // ----------------------------
  // Substrate costs (materials → multiplied by profit)
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    const margin = s.substrateMarginMm || 0
    const usableW = Math.max(0, (substrateItem.sizeW ?? 0) - 2 * margin)
    const usableH = Math.max(0, (substrateItem.sizeH ?? 0) - 2 * margin)

    // Treat panels as indivisible rectangles (no further splitting).
    const n = Math.max(1, input.panelSplits || 0) // 0 → 1 piece
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const panelW = ori === 'Vertical' ? (input.widthMm || 0) / n : (input.widthMm || 0)
    const panelH = ori === 'Vertical' ? (input.heightMm || 0) : (input.heightMm || 0) / n

    // panels per sheet (grid packing), try rotation too
    const fit = (pw: number, ph: number) => {
      const across = Math.floor(usableW / pw)
      const down   = Math.floor(usableH / ph)
      return Math.max(0, across) * Math.max(0, down)
    }
    const p1 = fit(panelW, panelH)
    const p2 = fit(panelH, panelW)
    let perSheet = Math.max(p1, p2)

    if (perSheet <= 0) perSheet = 1

    const totalPanels = (input.qty || 1) * n
    const chargedSheets = Math.ceil(totalPanels / perSheet)

    sheetsUsed = chargedSheets

    // Approximate usage %
    const panelArea = panelW * panelH
    const sheetUsableArea = usableW * usableH
    usagePct = sheetUsableArea > 0
        ? clamp(((Math.min(perSheet, totalPanels) * panelArea) / sheetUsableArea) * 100, 0, 100)
        : undefined

    // Fraction label (for 1 panel case)
    const areaRatio = sheetUsableArea > 0 ? panelArea / sheetUsableArea : 1
    sheetFraction = (areaRatio <= 0.25 ? 0.25
        : areaRatio <= 0.5 ? 0.5
            : areaRatio <= 0.75 ? 0.75 : 1) as 0.25 | 0.5 | 0.75 | 1

    const sheetCost = substrateItem.pricePerSheet || 0
    const add = sheetCost * chargedSheets
    materialsOnly += add

    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +((totalPanels / perSheet)).toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })
  }

  // ----------------------------
  // Vinyl Cut Options (all added AFTER multiplier)
  if (input.plotterCut && input.plotterCut !== 'None') {
    const perimRate = s.plotterPerimeterPerM ?? 0
    const perimAdd  = perimRate * perimeterM

    const setupMap = (s as any).plotterCutSetup ?? {}
    const perMap   = (s as any).plotterCutPerPiece ?? {}

    const setupFee = setupMap[input.plotterCut] ?? 0
    const perPiece = perMap[input.plotterCut] ?? 0

    const pieceAdd = perPiece * (input.qty || 1)
    extraAfterMultiplier += perimAdd + setupFee + pieceAdd

    const parts: string[] = []
    if (setupFee) parts.push(`setup £${setupFee.toFixed(2)}`)
    if (perimAdd) parts.push(`perimeter £${perimAdd.toFixed(2)}`)
    if (pieceAdd) parts.push(`${input.qty} × £${perPiece.toFixed(2)} = £${pieceAdd.toFixed(2)}`)
    notes.push(`Cut option: ${input.plotterCut} — ${parts.join(' + ') || 'no extra'}`)
  } else {
    const perMap = (s as any).plotterCutPerPiece ?? {}
    const nonePer = perMap['None'] ?? s.cutPerSign ?? 0
    if (nonePer) {
      const add = nonePer * (input.qty || 1)
      extraAfterMultiplier += add
      notes.push(`Cut option: None — ${input.qty} × £${nonePer.toFixed(2)} = £${add.toFixed(2)}`)
    }
  }

  // Cutting style uplift (percentage on base), added AFTER multiplier
  if (input.cuttingStyle) {
    const upliftPct = (s as any).cuttingStyleUplifts?.[input.cuttingStyle] ?? 0
    if (upliftPct) {
      const baseForUplift = materialsOnly + ink
      const add = upliftPct * baseForUplift
      extraAfterMultiplier += add
      notes.push(`Cutting style (${input.cuttingStyle}): +${Math.round(upliftPct * 100)}% of base = £${add.toFixed(2)}`)
    }
  }

  // ----------------------------
  // Totals (Materials + Ink) × Profit  + Setup + AFTER-multiplier extras
  const profit = s.profitMultiplier ?? 1
  const preDelivery = (materialsOnly + ink) * profit + (s.setupFee || 0) + extraAfterMultiplier

  const { band, price: bandPrice } = deliveryFromGirth(
      s, input.widthMm || 0, input.heightMm || 0
  )
  const deliveryBase = (s as any).delivery?.baseFee ?? (s as any).deliveryBase ?? 0
  const delivery = deliveryBase + bandPrice
  const total = preDelivery + delivery

  return {
    // Money
    materials: +materialsOnly.toFixed(2),
    ink: +ink.toFixed(2),
    setup: +(s.setupFee || 0).toFixed(2),
    cutting: +extraAfterMultiplier.toFixed(2),
    finishingUplift: 0,
    preDelivery: +preDelivery.toFixed(2),
    delivery: +delivery.toFixed(2),
    total: +total.toFixed(2),

    // Stats
    vinylLm: vinylLmCharged ? +vinylLmCharged.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLmWithWaste ? +vinylLmWithWaste.toFixed(3) : undefined,
    sheetFraction,
    sheetsUsed,
    usagePct: usagePct ? +usagePct.toFixed(1) : undefined,
    wastePct: usagePct ? +(100 - usagePct).toFixed(1) : undefined,
    deliveryBand: band,

    // Detailed cost items
    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    notes,
  }
}
