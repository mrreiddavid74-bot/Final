'use client'

import { useEffect, useMemo, useState } from 'react'
import Card from '../../components/Card'
import { DEFAULT_SETTINGS } from '../../lib/defaults'
import { priceSingle } from '../../lib/pricing'
import type {
  Mode,
  Orientation,
  Finishing,
  Complexity,
  VinylMedia,
  Substrate,
  SingleSignInput,
  PriceBreakdown,
} from '../../lib/types'

const MODES: { id: Mode; label: string }[] = [
  { id: 'SolidColourCutVinyl', label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl', label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnly', label: 'Printed Vinyl Only' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly', label: 'Substrate Only' },
]

/** helpers */
const SIZE_SUFFIX_RE = /\s*\(\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm)?\s*\)\s*$/i
const baseName = (name?: string) => (name ?? '').replace(SIZE_SUFFIX_RE, '').trim()
const nameKey = (name?: string) => baseName(name).toLowerCase()
const fmtSize = (w?: number, h?: number) => `${w ?? 0} x ${h ?? 0}mm`
const sizeKey = (w?: number, h?: number) => `${w ?? 0}x${h ?? 0}`
const MAX_SPLITS = 6

function minCap(...vals: Array<number | undefined>): number {
  const nums = vals.filter(
      (v): v is number => typeof v === 'number' && isFinite(v) && v > 0
  )
  return nums.length ? Math.min(...nums) : Infinity
}

export default function SinglePage() {
  const [media, setMedia] = useState<VinylMedia[]>([])
  const [substrates, setSubstrates] = useState<Substrate[]>([])
  const [loading, setLoading] = useState(true)

  const [input, setInput] = useState<SingleSignInput>({
    mode: 'PrintedVinylOnly',
    widthMm: 1000,
    heightMm: 500,
    qty: 1,
    vinylId: undefined,
    substrateId: undefined,
    doubleSided: false,
    finishing: 'None' as Finishing,
    complexity: 'Standard' as Complexity,
    applicationTape: false,
    panelSplits: 0,
    panelOrientation: 'Vertical' as Orientation,
  })

  const [subGroupKey, setSubGroupKey] = useState<string | null>(null)

  // Vinyl Split UI state (only shown for PrintedVinylOnSubstrate)
  const [vinylAuto, setVinylAuto] = useState(true)
  const [vinylSplits, setVinylSplits] = useState(0) // 0 = None
  const [vinylOrientation, setVinylOrientation] = useState<Orientation>('Vertical')

  // Load materials
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [m, s] = await Promise.all([
          fetch('/api/settings/vinyl', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])),
          fetch('/api/settings/substrates', { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])),
        ])
        if (cancelled) return
        setMedia(Array.isArray(m) ? m : [])
        setSubstrates(Array.isArray(s) ? s : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Ensure a valid vinyl selection
  useEffect(() => {
    if (!media.length) return
    setInput(prev =>
        prev.vinylId && media.some(m => m.id === prev.vinylId)
            ? prev
            : { ...prev, vinylId: media[0].id }
    )
  }, [media])

  // Build substrate groups
  type SubGroup = { key: string; displayName: string; variants: Substrate[] }
  const subGroups: SubGroup[] = useMemo(() => {
    const map = new Map<string, Substrate[]>()
    for (const s of substrates) {
      const k = nameKey(s.name)
      map.set(k, [...(map.get(k) || []), s])
    }
    const groups: SubGroup[] = []
    for (const [key, list] of map) {
      const seen = new Set<string>()
      const variants = list.filter(v => {
        const sk = sizeKey(v.sizeW, v.sizeH)
        if (seen.has(sk)) return false
        seen.add(sk)
        return true
      })
      variants.sort((a, b) => {
        const arA = (a.sizeW ?? 0) * (a.sizeH ?? 0)
        const arB = (b.sizeW ?? 0) * (b.sizeH ?? 0)
        if (arA !== arB) return arA - arB
        return (a.sizeW ?? 0) - (b.sizeW ?? 0)
      })
      groups.push({ key, displayName: baseName(variants[0]?.name) || 'Substrate', variants })
    }
    groups.sort((a, b) => a.displayName.localeCompare(b.displayName))
    return groups
  }, [substrates])

  // Sync group with selection
  useEffect(() => {
    if (!subGroups.length) return
    setInput(prev => {
      let next = { ...prev }
      if (!prev.substrateId) {
        const g = subGroups[0]
        setSubGroupKey(g.key)
        next.substrateId = g.variants[0]?.id
        return next
      }
      const g = subGroups.find(gr => gr.variants.some(v => v.id === prev.substrateId))
      if (g) {
        setSubGroupKey(k => (k === g.key ? k : g.key))
        return next
      }
      const g2 = subGroups[0]
      setSubGroupKey(g2.key)
      next.substrateId = g2.variants[0]?.id
      return next
    })
  }, [subGroups])

  // Ensure valid size in current group
  useEffect(() => {
    if (!subGroupKey) return
    const g = subGroups.find(x => x.key === subGroupKey)
    if (!g) return
    setInput(prev =>
        prev.substrateId && g.variants.some(v => v.id === prev.substrateId)
            ? prev
            : { ...prev, substrateId: g.variants[0]?.id }
    )
  }, [subGroupKey, subGroups])

  const isVinylOnly =
      input.mode === 'SolidColourCutVinyl' ||
      input.mode === 'PrintAndCutVinyl' ||
      input.mode === 'PrintedVinylOnly'

  const isSubstrateProduct =
      input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'

  const showVinylSplitCard = input.mode === 'PrintedVinylOnSubstrate'

  useEffect(() => {
    if (!showVinylSplitCard) {
      setVinylAuto(true)
      setVinylSplits(0)
      setVinylOrientation('Vertical')
    }
  }, [showVinylSplitCard])

  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId]
  )

  const currentMedia = useMemo(
      () => (input.vinylId ? media.find(m => m.id === input.vinylId) : undefined),
      [media, input.vinylId]
  )

  const effectivePrintWidthMm = useMemo(() => {
    const m = currentMedia
    return minCap(
        DEFAULT_SETTINGS.masterMaxPrintWidthMm,
        typeof m?.rollPrintableWidthMm === 'number' ? m?.rollPrintableWidthMm : m?.rollWidthMm,
        m?.maxPrintWidthMm
    )
  }, [currentMedia])

  // Usable sheet dims
  const usableSheet = useMemo(() => {
    if (!currentSubVariant) return { w: 0, h: 0 }
    const w = Math.max(0, (currentSubVariant.sizeW ?? 0) - 2 * (DEFAULT_SETTINGS.substrateMarginMm ?? 0))
    const h = Math.max(0, (currentSubVariant.sizeH ?? 0) - 2 * (DEFAULT_SETTINGS.substrateMarginMm ?? 0))
    return { w, h }
  }, [currentSubVariant])

  function fitsOnSheet(panelW: number, panelH: number) {
    const { w, h } = usableSheet
    return (panelW <= w && panelH <= h) || (panelW <= h && panelH <= w)
  }

  // Allowed substrate splits per orientation
  const allowedSplitsForOrientation = useMemo(() => {
    const res: Record<Orientation, number[]> = { Vertical: [], Horizontal: [] }
    const W = input.widthMm || 0
    const H = input.heightMm || 0

    const noneAllowed = fitsOnSheet(W, H)
    if (noneAllowed) {
      res.Vertical.push(0)
      res.Horizontal.push(0)
    }

    for (let n = 2; n <= MAX_SPLITS; n++) {
      const vw = W / n, vh = H
      const hw = W,    hh = H / n
      if (fitsOnSheet(vw, vh)) res.Vertical.push(n)
      if (fitsOnSheet(hw, hh)) res.Horizontal.push(n)
    }
    return res
  }, [input.widthMm, input.heightMm, usableSheet.w, usableSheet.h])

  // Auto default substrate splits
  useEffect(() => {
    if (!isSubstrateProduct || !currentSubVariant) return

    const curOri: Orientation = input.panelOrientation ?? 'Vertical'
    const allowedCur = allowedSplitsForOrientation[curOri]
    const cur = input.panelSplits ?? 0

    if (allowedCur.includes(cur)) return

    if (allowedCur.includes(0)) {
      setInput(prev => ({ ...prev, panelSplits: 0 }))
      return
    }

    const smallest = allowedCur.find(n => n >= 2)
    if (smallest != null) {
      setInput(prev => ({ ...prev, panelSplits: smallest }))
      return
    }

    const otherOri: Orientation = curOri === 'Vertical' ? 'Horizontal' : 'Vertical'
    const allowedOther = allowedSplitsForOrientation[otherOri]
    if (allowedOther.includes(0)) {
      setInput(prev => ({ ...prev, panelOrientation: otherOri, panelSplits: 0 }))
      return
    }
    const smallestOther = allowedOther.find(n => n >= 2)
    if (smallestOther != null) {
      setInput(prev => ({ ...prev, panelOrientation: otherOri, panelSplits: smallestOther }))
    }
  }, [allowedSplitsForOrientation, isSubstrateProduct, currentSubVariant, input.panelOrientation, input.panelSplits])

  // Ready to price?
  const needsVinyl = input.mode !== 'SubstrateOnly'
  const needsSub   = isSubstrateProduct

  const ready =
      !loading &&
      (!needsVinyl || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!needsSub   || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

  const result: PriceBreakdown | { error: string } | null = useMemo(() => {
    if (!ready) return null
    try {
      return priceSingle({ ...input }, media, substrates, DEFAULT_SETTINGS)
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [ready, input, media, substrates])

  // Substrate split preview (× qty)
  const splitPreview = useMemo(() => {
    const n = input.panelSplits ?? 0
    const N = n === 0 ? 1 : n
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const qty = input.qty || 1

    const panelW = ori === 'Vertical' ? W / N : W
    const panelH = ori === 'Vertical' ? H : H / N

    const totalPanels = qty * N
    const panelsText = `${totalPanels} × Panels of ${Math.round(panelW)}mm × ${Math.round(panelH)}mm`

    return { panelsText, panelW, panelH }
  }, [input.panelSplits, input.panelOrientation, input.widthMm, input.heightMm, input.qty])

  // --- Vinyl Split Options (preview) ---
  function tileLmForPiece(pieceW: number, pieceH: number, effW: number, qty: number) {
    const overlap = DEFAULT_SETTINGS.tileOverlapMm || 0
    const gutter = DEFAULT_SETTINGS.vinylMarginMm || 0
    const denom = Math.max(1, effW - overlap)
    const columns = Math.ceil((pieceW + overlap) / denom)
    // If one column, do not add gutter; length is exact piece height
    const lm =
        columns === 1
            ? (pieceH * qty) / 1000
            : (columns * (pieceH + gutter) * qty) / 1000
    return { columns, lm }
  }

  const vinylCalc = useMemo(() => {
    const effW = effectivePrintWidthMm
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const qty = input.qty || 1

    if (!showVinylSplitCard || !currentMedia || !isFinite(effW)) {
      return { text: '—', totalLm: 0, totalMm: 0, usedN: 1, usedOri: 'Vertical' as Orientation }
    }

    // AUTO: prefer 1 piece, rotate so min side is across the roll; only tile if both sides exceed roll width
    if (vinylAuto) {
      const minSide = Math.min(W, H)
      const maxSide = Math.max(W, H)
      if (minSide <= effW) {
        const pieceW = minSide
        const pieceH = maxSide
        const totalMm = pieceH * qty
        const totalLm = totalMm / 1000
        const text = `1 × ${Math.round(pieceW)} × ${Math.round(pieceH)}mm`
        return { text, totalLm, totalMm, usedN: 1, usedOri: pieceW === W ? 'Horizontal' as Orientation : 'Vertical' as Orientation }
      }
      // both sides too wide → choose orientation with smaller lm
      const v = { pieceW: W, pieceH: H } // Vertical orientation means width=W
      const h = { pieceW: H, pieceH: W } // Horizontal orientation swaps
      const lv = tileLmForPiece(v.pieceW, v.pieceH, effW, qty)
      const lh = tileLmForPiece(h.pieceW, h.pieceH, effW, qty)
      const pick = lv.lm <= lh.lm ? { ...v, lm: lv.lm, columns: lv.columns, ori: 'Vertical' as Orientation } : { ...h, lm: lh.lm, columns: lh.columns, ori: 'Horizontal' as Orientation }
      const text = `${pick.columns} col × ${Math.round(pick.pieceW)} × ${Math.round(pick.pieceH)}mm`
      return { text, totalLm: pick.lm, totalMm: Math.round(pick.lm * 1000), usedN: pick.columns, usedOri: pick.ori }
    }

    // CUSTOM: honor override split count & orientation
    const N = Math.max(0, Math.min(MAX_SPLITS, vinylSplits | 0))
    const ori: Orientation = vinylOrientation
    const nPieces = N === 0 ? 1 : N
    const pieceW = ori === 'Vertical' ? W / nPieces : W
    const pieceH = ori === 'Vertical' ? H : H / nPieces
    const { columns, lm } = tileLmForPiece(pieceW, pieceH, effW, qty)
    const text = `${nPieces} × ${Math.round(pieceW)} × ${Math.round(pieceH)}mm${columns > 1 ? ` (${columns} col)` : ''}`
    return { text, totalLm: lm, totalMm: Math.round(lm * 1000), usedN: nPieces, usedOri: ori }
  }, [
    showVinylSplitCard,
    currentMedia,
    effectivePrintWidthMm,
    vinylAuto,
    vinylSplits,
    vinylOrientation,
    input.widthMm,
    input.heightMm,
    input.qty,
  ])

  return (
      <div className="space-y-6">
        <h1 className="h1">Single Sign</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <h2 className="h2 mb-2">Product</h2>
            <select
                className="select"
                value={input.mode}
                onChange={e => setInput({ ...input, mode: e.target.value as Mode })}
            >
              {MODES.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
              ))}
            </select>
          </Card>

          <Card>
            <h2 className="h2 mb-2">Dimensions</h2>
            <label className="label">
              Width (mm)
              <input
                  className="input"
                  type="number"
                  min={1}
                  value={input.widthMm}
                  onChange={e => setInput({ ...input, widthMm: +e.target.value || 0 })}
              />
            </label>
            <label className="label">
              Height (mm)
              <input
                  className="input"
                  type="number"
                  min={1}
                  value={input.heightMm}
                  onChange={e => setInput({ ...input, heightMm: +e.target.value || 0 })}
              />
            </label>
            <label className="label">
              Quantity
              <input
                  className="input"
                  type="number"
                  min={1}
                  value={input.qty}
                  onChange={e => setInput({ ...input, qty: Math.max(1, +e.target.value || 1) })}
              />
            </label>
          </Card>

          <Card>
            <h2 className="h2 mb-2">Materials</h2>
            <div className="flex flex-col gap-3">
              <label className={`label ${input.mode === 'SubstrateOnly' ? 'opacity-50' : ''}`}>
                Vinyl / Media
                <select
                    className="select mt-1"
                    value={input.vinylId ?? ''}
                    onChange={e => setInput({ ...input, vinylId: e.target.value })}
                    disabled={input.mode === 'SubstrateOnly' || loading || !media.length}
                >
                  {!media.length ? (
                      <option value="">Loading…</option>
                  ) : (
                      media.map(v => (
                          <option key={v.id} value={v.id}>
                            {v.name}
                          </option>
                      ))
                  )}
                </select>
              </label>

              {/* Substrate (grouped) */}
              <label className={`label ${isVinylOnly ? 'opacity-50' : ''}`}>
                Substrate
                <select
                    className="select mt-1"
                    value={subGroupKey ?? ''}
                    onChange={e => {
                      const k = e.target.value
                      setSubGroupKey(k)
                      const g = subGroups.find(x => x.key === k)
                      if (g?.variants?.length) {
                        setInput(prev => ({ ...prev, substrateId: g.variants[0].id }))
                      }
                    }}
                    disabled={!isSubstrateProduct || loading || !subGroups.length}
                >
                  {!subGroups.length ? (
                      <option value="">Loading…</option>
                  ) : (
                      subGroups.map(g => (
                          <option key={g.key} value={g.key}>
                            {g.displayName}
                          </option>
                      ))
                  )}
                </select>
              </label>

              {/* Substrate size */}
              <label className={`label ${isSubstrateProduct ? '' : 'opacity-50'}`}>
                Substrate Size
                <select
                    className="select mt-1"
                    value={input.substrateId ?? ''}
                    onChange={e => setInput(prev => ({ ...prev, substrateId: e.target.value }))}
                    disabled={!isSubstrateProduct || loading || !subGroupKey}
                >
                  {!subGroupKey ? (
                      <option value="">Loading…</option>
                  ) : (
                      (subGroups.find(g => g.key === subGroupKey)?.variants || []).map(v => (
                          <option key={v.id} value={v.id}>
                            {fmtSize(v.sizeW, v.sizeH)}
                          </option>
                      ))
                  )}
                </select>
              </label>
            </div>
          </Card>

          {/* Substrate Splits */}
          <Card>
            <h2 className="h2 mb-2">Substrate Splits</h2>

            <label className="label">
              Substrate Split Override
              <select
                  className="select"
                  value={input.panelSplits ?? 0}
                  onChange={e => setInput({ ...input, panelSplits: +e.target.value })}
                  disabled={!isSubstrateProduct || !currentSubVariant}
              >
                {(() => {
                  const oriKey: Orientation = input.panelOrientation ?? 'Vertical'
                  const allowed = new Set(allowedSplitsForOrientation[oriKey])
                  const opts: { val: number; label: string; disabled?: boolean }[] = [
                    { val: 0, label: 'None (1 piece)', disabled: !allowed.has(0) },
                  ]
                  for (let n = 2; n <= MAX_SPLITS; n++) {
                    opts.push({ val: n, label: String(n), disabled: !allowed.has(n) })
                  }
                  return opts.map(o => (
                      <option key={o.val} value={o.val} disabled={!!o.disabled}>
                        {o.label}
                      </option>
                  ))
                })()}
              </select>
            </label>

            <label className={`label ${input.panelSplits === 0 ? 'opacity-50' : ''}`}>
              Substrate Split Orientation
              <select
                  className="select"
                  value={input.panelOrientation ?? 'Vertical'}
                  onChange={e => setInput({ ...input, panelOrientation: e.target.value as Orientation })}
                  disabled={!isSubstrateProduct || !currentSubVariant || input.panelSplits === 0}
              >
                <option>Vertical</option>
                <option>Horizontal</option>
              </select>
            </label>

            <div className="mt-2 p-2 rounded bg-slate-50 border">
              <div className="font-semibold">Split Size Result:</div>
              <div>{splitPreview.panelsText}</div>
              <div className="mt-2 font-semibold">Total Full Sheets Required:</div>
              <div>
                {typeof (result as PriceBreakdown | null)?.sheetsUsed === 'number' && currentSubVariant
                    ? `${(result as PriceBreakdown).sheetsUsed} × Sheets of ${currentSubVariant.sizeW} x ${currentSubVariant.sizeH}mm`
                    : '—'}
              </div>
            </div>
          </Card>

          {/* Vinyl Split Options (only for Printed Vinyl mounted to a substrate) */}
          {showVinylSplitCard && (
              <Card>
                <h2 className="h2 mb-2">Vinyl Split Options</h2>

                <label className="label">
                  Auto rotate to avoid tiling
                  <select
                      className="select"
                      value={vinylAuto ? 'yes' : 'no'}
                      onChange={e => setVinylAuto(e.target.value === 'yes')}
                  >
                    <option value="yes">Yes (Auto Tile)</option>
                    <option value="no">No (Custom Tile)</option>
                  </select>
                </label>

                <label className={`label ${vinylAuto ? 'opacity-50' : ''}`}>
                  Vinyl Split Override
                  <select
                      className="select"
                      value={vinylSplits}
                      onChange={e => setVinylSplits(+e.target.value)}
                      disabled={vinylAuto}
                  >
                    <option value={0}>None</option>
                    {[2, 3, 4, 5, 6].map(n => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </label>

                <label className={`label ${vinylAuto ? 'opacity-50' : ''}`}>
                  Vinyl Split Orientation
                  <select
                      className="select"
                      value={vinylOrientation}
                      onChange={e => setVinylOrientation(e.target.value as Orientation)}
                      disabled={vinylAuto}
                  >
                    <option>Vertical</option>
                    <option>Horizontal</option>
                  </select>
                </label>

                <div className="mt-2 p-2 rounded bg-slate-50 border">
                  <div className="font-semibold">Split size result:</div>
                  <div>{vinylCalc.text}</div>
                  <div className="mt-2 font-semibold">Total Vinyl Length:</div>
                  <div>{Math.round(vinylCalc.totalMm)}mm ({vinylCalc.totalLm.toFixed(2)}m)</div>
                </div>
              </Card>
          )}

          {/* Costs */}
          <Card>
            <h2 className="h2 mb-2">Costs</h2>

            {loading || !ready ? (
                <div className="opacity-70">Select materials to see pricing…</div>
            ) : 'error' in (result as any) ? (
                <div className="text-red-600">{String((result as any).error)}</div>
            ) : (
                <div className="space-y-2">
                  {(result as PriceBreakdown)?.costs?.vinyl?.length ? (
                      <div>
                        <h3 className="font-semibold">Vinyl</h3>
                        <ul className="list-disc ml-5">
                          {(result as PriceBreakdown).costs!.vinyl.map((v, i) => (
                              <li key={i}>
                                {v.media}: {v.lm?.toFixed?.(2)} lm × £{v.pricePerLm?.toFixed?.(2)} ={' '}
                                <b>£{v.cost?.toFixed?.(2)}</b>
                              </li>
                          ))}
                        </ul>
                      </div>
                  ) : null}

                  {(result as PriceBreakdown)?.costs?.substrate?.length ? (
                      <div>
                        <h3 className="font-semibold">Substrate</h3>
                        <ul className="list-disc ml-5">
                          {(result as PriceBreakdown).costs!.substrate.map((s, i) => (
                              <li key={i}>
                                {s.material} — {s.sheet}: need {s.neededSheets} →{' '}
                                <b>{s.chargedSheets} full sheets</b> × £{s.pricePerSheet?.toFixed?.(2)} ={' '}
                                <b>£{s.cost?.toFixed?.(2)}</b>
                              </li>
                          ))}
                        </ul>
                      </div>
                  ) : null}

                  <div><b>Materials Cost:</b> £{(result as PriceBreakdown).materials.toFixed(2)}</div>
                  <div><b>Sell Cost (pre-delivery):</b> £{(result as PriceBreakdown).preDelivery.toFixed(2)}</div>
                  <div><b>Delivery:</b> £{(result as PriceBreakdown).delivery.toFixed(2)}</div>
                  <div className="mt-2 text-2xl font-extrabold">
                    Total (Sell Price): £{(result as PriceBreakdown).total.toFixed(2)}
                  </div>

                  {!!(result as PriceBreakdown).notes?.length && (
                      <div className="mt-3">
                        <h3 className="font-semibold">Notes</h3>
                        <ul className="list-disc ml-5">
                          {(result as PriceBreakdown).notes!.map((n, i) => (
                              <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                  )}
                </div>
            )}
          </Card>
        </div>
      </div>
  )
}
