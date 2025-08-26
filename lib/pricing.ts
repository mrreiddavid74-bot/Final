// lib/pricing.ts
import {
  Settings, VinylMedia, Substrate, SingleSignInput, PriceBreakdown, Finishing,
} from './types'
import { normalizeSettings } from './settings-normalize'

const mm2ToSqm = (mm2: number) => mm2 / 1_000_000

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

function packAcrossWidth(acrossMm: number, lengthMm: number, effW: number, pieces: number, gutter: number) {
  const perRow = Math.max(1, Math.floor(effW / (acrossMm + gutter)))
  const rows = Math.ceil(pieces / perRow)
  const totalMm = rows * lengthDim(lengthMm) + Math.max(0, rows - 1) * gutter
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }

  function lengthDim(mm: number) { return mm }
}

function tileColumns(acrossMm: number, lengthMm: number, effW: number, pieces: number, overlap: number, gutter: number) {
  const denom = Math.max(1, effW - overlap)
  const cols = Math.ceil((acrossMm + overlap) / denom)
  const totalMm = cols * (lengthMm + gutter) * pieces
  return { cols, totalMm, totalLm: totalMm / 1000 }
}

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
    const v = tileColumns(W, H, effW, qty, overlap, gutter)
    const h = tileColumns(H, W, effW, qty, overlap, gutter)
    const t = v.totalMm <= h.totalMm ? v : h
    return { lmBase: t.totalLm, note: `Auto tiled (${t.cols} col) @ ${Math.round(effW)}mm` }
  }

  const n = Math.max(1, input.vinylSplitOverride ?? 1)
  const pieceAcross = input.vinylSplitOrientation === 'Horizontal' ? H / n : W / n
  const pieceLength = input.vinylSplitOrientation === 'Horizontal' ? W : H
  const pieces = qty * n

  if (pieceAcross <= effW) {
    const p = packAcrossWidth(pieceAcross, pieceLength, effW, pieces, gutter)
    return { lmBase: p.totalLm, note: `Custom ${n}× ${input.vinylSplitOrientation}, ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm` }
  }
  const t = tileColumns(pieceAcross, pieceLength, effW, pieces, overlap, gutter)
  return { lmBase: t.totalLm, note: `Custom ${n}× ${input.vinylSplitOrientation}, tiled (${t.cols} col) @ ${Math.round(effW)}mm` }
}

export function deliveryFromGirth(settings: Settings, wMm: number, hMm: number, tMm = 10) {
  const girthCm = (wMm + hMm + tMm) / 10
  const base = (settings as any).deliveryBase ?? (settings as any).delivery?.baseFee ?? 0

  let bands: Array<{ max: number; surcharge: number; name?: string }> = []
  if (Array.isArray((settings as any).deliveryBands)) {
    bands = (settings as any).deliveryBands.map((b: any) => ({
      max: typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? Infinity),
      surcharge: b.surcharge ?? 0,
      name: b.name,
    }))
  } else if (Array.isArray((settings as any).delivery?.bands)) {
    bands = (settings as any).delivery.bands.map((b: any) => ({
      max: typeof b.maxGirthCm === 'number' ? b.maxGirthCm : (b.maxSumCm ?? Infinity),
      surcharge: typeof b.surcharge === 'number' ? b.surcharge : (typeof b.price === 'number' ? b.price : 0),
      name: b.name,
    }))
  } else {
    bands = [{ max: Infinity, surcharge: 0 }]
  }

  bands.sort((a: { max: number }, b: { max: number }) => a.max - b.max)
  const hit = bands.find((band: { max: number }) => girthCm <= band.max) || bands[bands.length - 1]
  const price = base + (hit?.surcharge ?? 0)
  const label = hit?.name ? hit.name : `${hit?.max ?? '∞'} cm`
  return { band: label, price }
}

export function priceSingle(
    input: SingleSignInput, media: VinylMedia[], substrates: Substrate[], rawSettings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(rawSettings as any)
  const notes: string[] = []

  const qty = Math.max(1, input.qty || 1)
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * qty)

  const perimeterM = ((((input.widthMm || 0) + (input.heightMm || 0)) * 2) / 1000) * qty

  let materials = 0
  const vinylCostItems: { media: string; lm: number; pricePerLm: number; cost: number }[] = []
  const substrateCostItems: {
    material: string; sheet: string; neededSheets: number; chargedSheets: number; pricePerSheet: number; cost: number
  }[] = []

  const inkRate = s.inkElecPerSqm ?? 0
  let ink = areaSqm * inkRate

  // Default numeric settings to avoid undefined/NaN
  let setup = s.setupFee ?? 0
  let cutting = (s.cutPerSign ?? 0) * qty
  let finishingUplift = 0

  let vinylLmRaw = 0
  let vinylLmWithWaste = 0
  let sheetFraction: 0.25 | 0.5 | 0.75 | 1 | undefined
  let sheetsUsed: number | undefined
  let usagePct: number | undefined

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmRaw: number, pricePerLm: number, printed: boolean) => {
    const waste = printed ? (s.vinylWasteLmPerJob || 0) : 0
    vinylLmRaw = lmRaw
    vinylLmWithWaste = lmRaw + waste
    materials += vinylLmWithWaste * pricePerLm
  }

  // A) SOLID COLOUR CUT
  if (input.mode === 'SolidColourCutVinyl') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const { effectiveCutWidthMm } = getEffectiveWidths(mediaItem, s)
    const gutter = s.vinylMarginMm || 0
    const perRow = Math.max(1, Math.floor(effectiveCutWidthMm / ((input.widthMm || 0) + gutter)))
    const rows = Math.ceil(qty / perRow)
    const lm = (rows * ((input.heightMm || 0) + gutter)) / 1000
    addVinylCost(lm, mediaItem.pricePerLm, false)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

    if (input.applicationTape && s.applicationTapePerLm) {
      materials += lm * s.applicationTapePerLm
      notes.push(`Application tape: ${lm.toFixed(2)} lm × £${s.applicationTapePerLm.toFixed(2)}`)
    }

    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // B) PRINTED VINYL
  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate') {
    if (!mediaItem) throw new Error('Select a printable media')

    const v = computeVinylLm(input, mediaItem, s)
    let lm = v.lmBase
    if (input.doubleSided) lm *= 2

    addVinylCost(lm, mediaItem.pricePerLm, true)
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(v.note)

    if (input.applicationTape && s.applicationTapePerLm) {
      materials += lm * s.applicationTapePerLm
      notes.push(`Application tape: ${lm.toFixed(2)} lm × £${s.applicationTapePerLm.toFixed(2)}`)
    }
    if (input.backedWithWhite && s.whiteBackingPerLm) {
      materials += lm * s.whiteBackingPerLm
      notes.push(`White backing: ${lm.toFixed(2)} lm × £${s.whiteBackingPerLm.toFixed(2)}`)
    }

    const fin: Finishing = input.finishing ?? 'None'
    const upliftPct = (s as any).finishingUplifts?.[fin] ?? 0
    finishingUplift += upliftPct * (materials + ink + cutting + setup)
  }

  // C) SUBSTRATE — discrete packing per sheet (respects substrate splits)
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    const usableW = Math.max(0, substrateItem.sizeW - 2 * (s.substrateMarginMm || 0))
    const usableH = Math.max(0, substrateItem.sizeH - 2 * (s.substrateMarginMm || 0))

    // split panel geometry
    const splits = Math.max(0, input.panelSplits ?? 0)
    const N = splits === 0 ? 1 : splits
    const ori = (input.panelOrientation ?? 'Vertical') as 'Vertical' | 'Horizontal'

    const pieceW = ori === 'Vertical' ? (input.widthMm  || 0) / N : (input.widthMm  || 0)
    const pieceH = ori === 'Vertical' ? (input.heightMm || 0)     : (input.heightMm || 0) / N

    const qtyPanels = qty * N

    const fit = (sw: number, sh: number, pw: number, ph: number) =>
        Math.max(0, Math.floor(sw / pw)) * Math.max(0, Math.floor(sh / ph))

    const perSheet = Math.max(
        fit(usableW, usableH, pieceW, pieceH),
        fit(usableW, usableH, pieceH, pieceW),
    )

    const effectivePerSheet = perSheet > 0 ? perSheet : 1
    if (perSheet === 0) {
      notes.push('⚠️ Substrate panel does not fit usable sheet area; charging 1 sheet per panel.')
    }

    const neededSheetsRaw = qtyPanels / effectivePerSheet
    const chargedSheets   = Math.ceil(neededSheetsRaw)
    const sheetCost       = substrateItem.pricePerSheet

    materials += sheetCost * chargedSheets
    sheetsUsed = chargedSheets

    // utilization (single panel vs usable area)
    const usableArea = Math.max(1, usableW * usableH)
    const pieceArea  = pieceW * pieceH
    usagePct = Math.min(100, (pieceArea / usableArea) * 100)

    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })

    // optional note for audit
    if (splits > 0) {
      notes.push(`Substrate split: ${N} × ${ori} → panel ${Math.round(pieceW)}×${Math.round(pieceH)}mm; ${effectivePerSheet} per sheet`)
    }
  }

  // D) CUT OPTIONS
  if (input.plotterCut && input.plotterCut !== 'None') {
    const perimAdd = (s.plotterPerimeterPerM ?? 0) * perimeterM
    const perPiece = s.plotterCutPerPiece?.[input.plotterCut] ?? 0
    const pieceAdd = perPiece * qty
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
    if (pieceAdd) parts.push(`${qty} × £${perPiece.toFixed(2)} = £${pieceAdd.toFixed(2)}`)
    if (perimAdd) parts.push(`perimeter £${perimAdd.toFixed(2)}`)
    notes.push(`Cut option: ${input.plotterCut} — ${parts.join(' + ') || '£0.00'}`)
  } else if (s.cutPerSign) {
    notes.push(`Cut option: None — setup £0.00 + ${qty} × £${(s.cutPerSign ?? 0).toFixed(2)} = £${((s.cutPerSign ?? 0) * qty).toFixed(2)}`)
  }

  // E) Hem / Eyelets
  if (input.mode === 'PrintAndCutVinyl' && (input.hemEyelets === true || (input as any).hemEyelets === 'Yes')) {
    const rate = (s as any).hemEyeletsPerPiece ?? 0
    const add  = rate * qty
    cutting += add
    notes.push(`Hem/Eyelets: ${qty} × £${rate.toFixed(2)} = £${add.toFixed(2)}`)
  }

  // F) Totals
  const profit = s.profitMultiplier ?? 1
  const preDelivery = (materials + ink) * profit + (setup + cutting + finishingUplift)

  const { band, price: deliveryPrice } = deliveryFromGirth(s, input.widthMm || 0, input.heightMm || 0)
  const delivery = deliveryPrice
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
    sheetFraction,
    sheetsUsed,
    usagePct: usagePct ? +usagePct.toFixed(1) : undefined,
    wastePct: usagePct ? +(100 - usagePct).toFixed(1) : undefined,
    deliveryBand: band,

    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    notes,
  }
}
