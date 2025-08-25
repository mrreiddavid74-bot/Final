// lib/pricing.ts
import {
  Settings,
  VinylMedia,
  Substrate,
  SingleSignInput,
  Orientation,
  PriceBreakdown,
} from './types'
import { normalizeSettings } from './settings-normalize'

const mm2ToSqm = (mm2: number) => mm2 / 1_000_000

// ---------- settings helpers ----------
function readNumber(obj: any, ...keys: string[]): number {
  for (const k of keys) {
    const v =
        obj?.[k] ??
        obj?.costs?.[k] ??
        obj?.delivery?.[k] ??
        obj?.vinyl?.[k] ??
        obj?.substrate?.[k]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return 0
}

// ---------- effective widths ----------
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

// ---------- packing / tiling ----------
function packAcrossWidthLm(
    pieceW: number, // mm (across roll)
    pieceH: number, // mm (feed)
    effW: number,   // mm
    qtyPieces: number,
    gutterMm: number,
) {
  const perRow = Math.max(1, Math.floor(effW / (pieceW + gutterMm)))
  const rows = Math.ceil(qtyPieces / perRow)
  // include trailing gutter per row to match your 3020 mm expectation
  const totalMm = rows * (pieceH + gutterMm)
  const perSignMm = pieceH + gutterMm
  return { perRow, rows, totalMm, totalLm: totalMm / 1000, perSignMm }
}

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
  const totalMm = columns * (pieceH + gutterMm) * qtyPieces
  const perSignMm = columns * (pieceH + gutterMm)
  return { columns, totalMm, totalLm: totalMm / 1000, perSignMm }
}

type VinylLenResult = { lm: number; note: string; perSignMm: number }

function computeVinylLength(
    input: SingleSignInput,
    mediaItem: VinylMedia,
    s: Settings,
): VinylLenResult {
  const { effectivePrintWidthMm: effW } = getEffectiveWidths(mediaItem, s)
  const W = input.widthMm || 0
  const H = input.heightMm || 0
  const Q = input.qty || 1
  const gutter = (s as any).vinylMarginMm ?? 0
  const overlap = (s as any).tileOverlapMm ?? 0

  const auto = input.vinylAuto !== false

  if (auto) {
    const long = Math.max(W, H)
    const short = Math.min(W, H)

    if (long <= effW) {
      const p = packAcrossWidthLm(long, short, effW, Q, gutter)
      return {
        lm: p.totalLm,
        note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm`,
        perSignMm: p.perSignMm,
      }
    }
    if (short <= effW) {
      const p = packAcrossWidthLm(short, long, effW, Q, gutter)
      return {
        lm: p.totalLm,
        note: `Auto (rotated if needed); ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm`,
        perSignMm: p.perSignMm,
      }
    }

    const v = tileColumnsLm(W, H, effW, Q, overlap, gutter)
    const h = tileColumnsLm(H, W, effW, Q, overlap, gutter)
    const pick = v.totalMm <= h.totalMm ? v : h
    const label = pick === v ? `${Math.round(W)}×${Math.round(H)}` : `${Math.round(H)}×${Math.round(W)}`
    return {
      lm: pick.totalLm,
      note: `Auto tiled (${pick.columns} col) ${label} @ ${Math.round(effW)}mm`,
      perSignMm: pick.perSignMm,
    }
  }

  // custom override (force splits)
  const parts = Math.max(0, Math.min(6, input.vinylSplitOverride ?? 0)) || 1
  const ori: Orientation = input.vinylSplitOrientation ?? 'Vertical'
  const pieceW = ori === 'Vertical' ? W / parts : W
  const pieceH = ori === 'Vertical' ? H : H / parts
  const qtyPieces = Q * parts

  if (pieceW <= effW) {
    const p = packAcrossWidthLm(pieceW, pieceH, effW, qtyPieces, gutter)
    return {
      lm: p.totalLm,
      note: `Custom ${parts}× ${ori}, ${p.perRow}/row, ${p.rows} row(s) @ ${Math.round(effW)}mm`,
      perSignMm: p.perSignMm,
    }
  } else {
    const t = tileColumnsLm(pieceW, pieceH, effW, qtyPieces, overlap, gutter)
    return {
      lm: t.totalLm,
      note: `Custom ${parts}× ${ori}, tiled (${t.columns} col) @ ${Math.round(effW)}mm`,
      perSignMm: t.perSignMm,
    }
  }
}

// ---------- postage by "longest size" ----------
function postageByLongestMm(settings: any, longestMm: number): { label: string; price: number } {
  const Lcm = Math.max(0, longestMm / 10)

  const band100 = readNumber(settings, 'Postage ≤ 100 cm', 'Postage <= 100 cm', 'postage_le_100')
  const band150 = readNumber(settings, 'Postage ≤ 150 cm', 'Postage <= 150 cm', 'postage_le_150')
  const band200 = readNumber(settings, 'Postage ≤ 200 cm', 'Postage <= 200 cm', 'postage_le_200')
  const band200p = readNumber(settings, 'Postage > 200 cm', 'postage_gt_200')

  if (band100 || band150 || band200 || band200p) {
    if (Lcm <= 100) return { label: '≤100 cm', price: band100 }
    if (Lcm <= 150) return { label: '≤150 cm', price: band150 }
    if (Lcm <= 200) return { label: '≤200 cm', price: band200 }
    return { label: '>200 cm', price: band200p }
  }

  // fallback to legacy delivery bands if postage bands not present
  const base = readNumber(settings, 'deliveryBase', 'Delivery Base', 'baseFee')
  const bands = settings?.deliveryBands || settings?.delivery?.bands
  if (Array.isArray(bands) && bands.length) {
    const sum = Lcm
    const sorted = [...bands]
        .map((b: any) => ({
          max: b.maxSumCm ?? b.maxGirthCm ?? Infinity,
          price: (b.surcharge ?? 0) + base,
          name: b.name ?? `${b.maxSumCm ?? b.maxGirthCm ?? ''} cm`,
        }))
        .sort((a, b) => a.max - b.max)
    const pick = sorted.find(b => sum <= b.max) || sorted.at(-1)!
    return { label: pick.name, price: pick.price }
  }

  return { label: 'N/A', price: 0 }
}

// ---------- main pricing ----------
export function priceSingle(
    input: SingleSignInput,
    media: VinylMedia[],
    substrates: Substrate[],
    settings: Settings,
): PriceBreakdown {
  const s = normalizeSettings(settings as any) as any
  const notes: string[] = []

  let materials = 0
  let ink = 0

  const Q = input.qty || 1
  const W = input.widthMm || 0
  const H = input.heightMm || 0

  const mediaItem = input.vinylId ? media.find(m => m.id === input.vinylId) : undefined
  const subItem = input.substrateId ? substrates.find(z => z.id === input.substrateId) : undefined

  const vinylCostItems: { media: string; lm: number; pricePerLm: number; cost: number }[] = []
  const substrateCostItems: {
    material: string; sheet: string; neededSheets: number; chargedSheets: number; pricePerSheet: number; cost: number
  }[] = []

  const isPrinted = input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate'
  if (isPrinted) {
    const areaSqm = mm2ToSqm(W * H * Q)
    const inkRate = readNumber(s, 'inkElecPerSqm', 'inkCostPerSqm', 'Ink Cost sqm')
    ink = areaSqm * inkRate
  }

  // Vinyl
  let vinylLmRaw = 0
  let vinylLmWithWaste = 0
  let longestForPostageMm = Math.max(W, H)

  if (input.mode !== 'SubstrateOnly') {
    if (!mediaItem) throw new Error('Select a vinyl media')
    const v = computeVinylLength(input, mediaItem, s)
    vinylLmRaw = v.lm
    const waste = readNumber(s, 'vinylWasteLmPerJob')
    vinylLmWithWaste = v.lm + (isPrinted ? waste : 0)
    const pricePerLm = mediaItem.pricePerLm || 0
    materials += vinylLmWithWaste * pricePerLm
    vinylCostItems.push({
      media: mediaItem.name,
      lm: +v.lm.toFixed(3),
      pricePerLm,
      cost: +(v.lm * pricePerLm).toFixed(2),
    })
    notes.push(v.note)
    longestForPostageMm = Math.max(longestForPostageMm, v.perSignMm)
  }

  // Application tape (per lm)
  if ((input.mode === 'PrintAndCutVinyl' || input.mode === 'SolidColourCutVinyl') && input.applicationTape) {
    const rate = readNumber(s, 'applicationTapePerLm', 'Application Tape Cost per lm')
    const add = rate * (vinylLmRaw || 0)
    if (add) {
      materials += add
      notes.push(`Application tape: ${vinylLmRaw.toFixed(2)} lm × £${rate.toFixed(2)} = £${add.toFixed(2)}`)
    }
  }

  // White backing (per lm)
  if (isPrinted && input.backedWithWhite) {
    const rate = readNumber(s, 'whiteBackedVinylLm', 'White Backed Vinyl lm')
    const add = rate * (vinylLmRaw || 0)
    if (add) {
      materials += add
      notes.push(`White backing: ${vinylLmRaw.toFixed(2)} lm × £${rate.toFixed(2)} = £${add.toFixed(2)}`)
    }
  }

  // Substrate sheets
  let sheetsUsed: number | undefined
  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    if (!subItem) throw new Error('Select a substrate')
    const margin = readNumber(s, 'substrateMarginMm', 'Substrate Sign Margin mm')
    const usableW = Math.max(0, (subItem.sizeW ?? 0) - 2 * margin)
    const usableH = Math.max(0, (subItem.sizeH ?? 0) - 2 * margin)
    const usableArea = Math.max(1, usableW * usableH)
    const signArea = W * H
    const neededSheetsRaw = (signArea * Q) / usableArea
    const chargedSheets = Math.ceil(neededSheetsRaw > 0 ? neededSheetsRaw : 0)
    sheetsUsed = chargedSheets
    const perSheet = subItem.pricePerSheet || 0
    materials += perSheet * chargedSheets
    substrateCostItems.push({
      material: subItem.name,
      sheet: `${subItem.sizeW}×${subItem.sizeH}`,
      neededSheets: +neededSheetsRaw.toFixed(2),
      chargedSheets,
      pricePerSheet: +perSheet.toFixed(2),
      cost: +(chargedSheets * perSheet).toFixed(2),
    })

    // longest split edge for postage
    const splits = Math.max(0, Math.min(6, input.panelSplits ?? 0))
    const N = splits === 0 ? 1 : splits
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const panelW = ori === 'Vertical' ? W / N : W
    const panelH = ori === 'Vertical' ? H : H / N
    longestForPostageMm = Math.max(longestForPostageMm, panelW, panelH)
  }

  // (Materials + Ink) × Profit
  const profitMult = readNumber(s, 'profitMultiplier', 'Sell Multiplier') || 1
  const sellBase = (materials + ink) * profitMult

  // + Cut Vinyl Options  OR  + Cost/ Cut Substrate
  let extrasAfterMultiplier = 0

  if (input.mode === 'PrintAndCutVinyl' || input.mode === 'SolidColourCutVinyl') {
    // base per-piece fee even when "None"
    const basePerPiece = readNumber(s, 'Cost Per Cut Vinyl Only', 'costPerCutVinylOnly')
    if (basePerPiece) extrasAfterMultiplier += basePerPiece * Q

    // normalise plotter cut value to a plain string and accept synonyms
    const cut = String(input.plotterCut ?? 'None')
    const isCut = (...names: string[]) => names.includes(cut)

    const addSetup = (k: string) => readNumber(s, k, `${k} Fee`, `${k} Setup Fee`)
    const addPer   = (k: string) => readNumber(s, k)

    if (isCut('KissCutOnRoll', 'kissCutOnRoll', 'Kiss Cut On Roll')) {
      extrasAfterMultiplier += addSetup('Kiss Cut On Roll Setup Fee') + addPer('Kiss On Roll') * Q
    } else if (isCut('KissCutOnSheets', 'CutIntoSheets', 'kissCutOnSheets', 'Kiss Cut On Sheets')) {
      extrasAfterMultiplier += addSetup('Kiss Cut On Sheets Setup Fee') + addPer('Kiss Cut On Sheets') * Q
    } else if (isCut('CutIndividually', 'IndividuallyCut', 'Cut Individually')) {
      extrasAfterMultiplier += addSetup('Cut Individually Setup Fee') + addPer('Cut Individually') * Q
    } else if (isCut('CutAndWeeded', 'Cut & Weeded')) {
      extrasAfterMultiplier += addSetup('Cut & Weeded Setup Fee') + addPer('Cut & Weeded') * Q
    }
  }

  if (input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly') {
    const cps = readNumber(s, 'Cost Per Cut Substrate', 'costPerCutSubstrate')
    if (cps) {
      const splits = Math.max(0, Math.min(6, input.panelSplits ?? 0))
      const piecesPerSign = splits === 0 ? 1 : splits
      extrasAfterMultiplier += cps * (Q * piecesPerSign)
    }
  }

  const preDelivery = sellBase + extrasAfterMultiplier

  // delivery: postage by longest + base
  const { label: postageBand, price: postagePrice } = postageByLongestMm(s, longestForPostageMm)
  const deliveryBase = readNumber(s, 'deliveryBase', 'Delivery Base', 'baseFee')
  const delivery = deliveryBase + postagePrice

  const total = preDelivery + delivery

  return {
    materials: +materials.toFixed(2),
    ink: +ink.toFixed(2),
    setup: 0,
    cutting: +extrasAfterMultiplier.toFixed(2),
    finishingUplift: 0,
    preDelivery: +preDelivery.toFixed(2),
    delivery: +delivery.toFixed(2),
    total: +total.toFixed(2),

    vinylLm: vinylLmRaw ? +vinylLmRaw.toFixed(3) : undefined,
    vinylLmWithWaste: vinylLmWithWaste ? +vinylLmWithWaste.toFixed(3) : undefined,
    sheetFraction: undefined,
    sheetsUsed,
    usagePct: undefined,
    wastePct: undefined,
    deliveryBand: postageBand,

    costs: { vinyl: vinylCostItems, substrate: substrateCostItems },
    notes,
  }
}
