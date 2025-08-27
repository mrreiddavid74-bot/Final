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

/** Pack when a rectangle fits across the roll width, including edge gutters. */
function packAcrossWidth(
    acrossMm: number,
    lengthMm: number,
    effW: number,
    pieces: number,
    margin: number,
) {
  const perRow = Math.max(1, Math.floor(effW / (acrossMm + margin)))
  const rows   = Math.ceil(pieces / perRow)
  const totalMm = rows * lengthMm + (rows + 1) * margin // top & bottom gutters
  return { perRow, rows, totalMm, totalLm: totalMm / 1000 }
}

/** Tile into columns when across-dimension exceeds roll width, with edge gutters per column. */
function tileColumns(
    acrossMm: number,
    lengthMm: number,
    effW: number,
    pieces: number,
    overlap: number,
    margin: number,
) {
  const denom  = Math.max(1, effW - overlap)
  const cols   = Math.ceil((acrossMm + overlap) / denom)
  const totalMm = cols * (pieces * lengthMm + (pieces + 1) * margin) // gutters top+bottom per column
  return { cols, totalMm, totalLm: totalMm / 1000 }
}

/** Compute vinyl linear meters for printed modes; includes edge gutters & respects custom tiling. */
function computeVinylLm(
    input: SingleSignInput, mediaItem: VinylMedia, s: Settings,
): { lmBase: number; note: string } {
  const { effectivePrintWidthMm: effW } = getEffectiveWidths(mediaItem, s)
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const qty = Math.max(1, input.qty || 1)
  const margin = s.vinylMarginMm || 0
  const overlap = s.tileOverlapMm || 0

  const auto = input.vinylAuto !== false

  if (auto && (input.vinylSplitOverride ?? 0) === 0) {
    const cand: Array<{ perRow: number; rows: number; totalMm: number }> = []
    if (W <= effW) cand.push(packAcrossWidth(W, H, effW, qty, margin))
    if (H <= effW) cand.push(packAcrossWidth(H, W, effW, qty, margin))
    if (cand.length) {
      const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      return {
        lmBase: pick.totalMm / 1000,
        note: `Auto (rotated if needed); ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
      }
    }
    const v = tileColumns(W, H, effW, qty, overlap, margin)
    const h = tileColumns(H, W, effW, qty, overlap, margin)
    const pick = v.totalMm <= h.totalMm ? v : h
    return { lmBase: pick.totalLm, note: `Auto tiled (${pick.cols} col) @ ${Math.round(effW)}mm` }
  }

  // Custom override
  const parts = Math.max(1, input.vinylSplitOverride ?? 1)
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const baseW = ori === 'Vertical' ? W / parts : W
  const baseH = ori === 'Vertical' ? H : H / parts
  const pieces = qty * parts

  type Fit = { totalMm: number; totalLm: number; perRow: number; rows: number; rotated: boolean }
  const candidates: Fit[] = []

  if (baseW <= effW) {
    const p = packAcrossWidth(baseW, baseH, effW, pieces, margin)
    candidates.push({ ...p, rotated: false })
  }
  if (baseH <= effW) {
    const p = packAcrossWidth(baseH, baseW, effW, pieces, margin)
    candidates.push({ ...p, rotated: true })
  }

  if (candidates.length) {
    const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
    return {
      lmBase: pick.totalLm,
      note: `Custom ${parts}× ${ori}${pick.rotated ? ' (rotated)' : ''}, ${pick.perRow}/row, ${pick.rows} row(s) @ ${Math.round(effW)}mm`,
    }
  }

  const ta = tileColumns(baseW, baseH, effW, pieces, overlap, margin)
  const tb = tileColumns(baseH, baseW, effW, pieces, overlap, margin)
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
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    rawSettings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(rawSettings as any)
  const notes: string[] = []

  // No ink for Solid Colour Cut Vinyl or Substrate Only
  const areaSqm =
      input.mode === 'SolidColourCutVinyl' || input.mode === 'SubstrateOnly'
          ? 0
          : mm2ToSqm((input.widthMm || 0) * (input.heightMm || 0) * (input.qty || 1))

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

  let vinylLmRaw = 0
  let vinylLmWithWaste = 0
  let sheetsUsedPhys: number | undefined // ▼ expose packed full sheets

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const substrateItem = input.substrateId ? substrates.find(su => su.id === input.substrateId) : undefined

  const addVinylCost = (lmRaw: number, pricePerLm: number, printed: boolean) => {
    // DEFAULT waste is 0.5 lm (overridable via CSV)
    const waste = printed ? (s.vinylWasteLmPerJob || 0) : 0
    vinylLmRaw = lmRaw
    vinylLmWithWaste = lmRaw + waste
    materials += vinylLmWithWaste * pricePerLm
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
    vinylCostItems.push({ media: mediaItem.name, lm: +lm.toFixed(3), pricePerLm: mediaItem.pricePerLm, cost: +(lm * mediaItem.pricePerLm).toFixed(2) })
    notes.push(`${perRow}/row across ${effectiveCutWidthMm}mm cut width, ${rows} row(s)`)

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

    if (input.applicationTape && s.applicationTapePerLm) {
      materials += lm * s.applicationTapePerLm
      notes.push(`Application tape: ${lm.toFixed(2)} lm × £${s.applicationTapePerLm.toFixed(2)}`)
    }
    if (input.backedWithWhite && s.whiteBackingPerLm) {
      materials += lm * s.whiteBackingPerLm
      notes.push(`White backing: ${lm.toFixed(2)} lm × £${s.whiteBackingPerLm.toFixed(2)}`)
    }

    const fin: Finishing = input.finishing ?? 'None'
    const _uplift = (s as any).finishingUplifts?.[fin] ?? 0
    if (_uplift) finishingUplift += _uplift * (materials + ink + cutting + setup)
  }

  // --- SUBSTRATE (panel-based packing) ---
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!substrateItem) throw new Error('Select a substrate')

    // Usable sheet (edge margin only)
    const usableW = Math.max(0, substrateItem.sizeW - 2 * (s.substrateMarginMm || 0))
    const usableH = Math.max(0, substrateItem.sizeH - 2 * (s.substrateMarginMm || 0))

    // Panels from Substrate Splits
    const qty = Math.max(1, input.qty || 1)
    const parts = Math.max(1, (input.panelSplits ?? 0) || 1)
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const panelW = ori === 'Vertical' ? (input.widthMm || 0) / parts : (input.widthMm || 0)
    const panelH = ori === 'Vertical' ? (input.heightMm || 0)      : (input.heightMm || 0) / parts
    const totalPanels = qty * parts

    // How many panels fit per sheet (try both orientations)
    const fitA = Math.floor(usableW / panelW) * Math.floor(usableH / panelH)
    const fitB = Math.floor(usableW / panelH) * Math.floor(usableH / panelW)
    const perSheetCapacity = Math.max(fitA, fitB, 1)

    // Physical full sheets required to place all panels:
    const fullSheetsNeeded = Math.ceil(totalPanels / perSheetCapacity)
    sheetsUsedPhys = fullSheetsNeeded

    // Charging rule for the last (partial) sheet:
    // use ≤ 0.5 → charge 0.5; slightly over → charge 1
    const fullWholeSheets = Math.floor(totalPanels / perSheetCapacity)
    const remainderPanels = totalPanels % perSheetCapacity

    const sheetArea = usableW * usableH
    const panelArea = panelW * panelH
    let chargedSheets = fullWholeSheets
    if (remainderPanels > 0) {
      const remainderArea = remainderPanels * panelArea
      const ratio = sheetArea > 0 ? remainderArea / sheetArea : 1
      chargedSheets += ratio <= 0.5 ? 0.5 : 1
    }

    const sheetCost = substrateItem.pricePerSheet
    materials += sheetCost * chargedSheets

    // (Optional) quick usage stat for notes
    const usagePct =
        sheetArea > 0
            ? clamp((totalPanels * panelArea) / (fullSheetsNeeded * sheetArea) * 100, 0, 100)
            : undefined

    substrateCostItems.push({
      material: substrateItem.name,
      sheet: `${substrateItem.sizeW}×${substrateItem.sizeH}`,
      neededSheets: +(totalPanels / perSheetCapacity).toFixed(2),
      chargedSheets,
      pricePerSheet: +sheetCost.toFixed(2),
      cost: +(chargedSheets * sheetCost).toFixed(2),
    })

    notes.push(
        `Substrate split: ${parts} × ${ori} → panel ${Math.round(panelW)}×${Math.round(panelH)}mm; ` +
        `${perSheetCapacity} per sheet`
    )
    if (usagePct !== undefined) notes.push(`Sheet usage ≈ ${usagePct.toFixed(1)}%`)
  }

  // --- CUT OPTIONS ---
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

  // --- TOTALS ---
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

    // Vinyl stats
    vinylLm: vinylLmRaw ? +vinylLmRaw.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLmWithWaste ? +vinylLmWithWaste.toFixed(3) : undefined,

    // Substrate packing stat for UI
    sheetsUsed: sheetsUsedPhys,

    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    deliveryBand: band,
    notes,
  }
}
