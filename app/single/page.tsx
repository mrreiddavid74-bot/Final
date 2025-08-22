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

export default function SinglePage() {
  /** Materials (loaded from API; API prefers lib/preloaded, then /public, then defaults) */
  const [media, setMedia] = useState<VinylMedia[]>([])
  const [substrates, setSubstrates] = useState<Substrate[]>([])
  const [loading, setLoading] = useState(true)

  /** User input */
  const [input, setInput] = useState<SingleSignInput>({
    mode: 'PrintedVinylOnly',
    widthMm: 1000,
    heightMm: 500,
    qty: 1,
    vinylId: undefined,
    substrateId: undefined,
    doubleSided: false,
    finishing: 'None' as Finishing,        // kept for pricing compatibility
    complexity: 'Standard' as Complexity,  // kept for pricing compatibility
    applicationTape: false,                // kept for print&cut case; not shown here
    panelSplits: 0,                        // 0 = None
    panelOrientation: 'Vertical' as Orientation,
  })

  /** Which substrate **name group** is selected (unique names) */
  const [subGroupKey, setSubGroupKey] = useState<string | null>(null)

  /** Fetch materials */
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

  /** Ensure a valid vinyl selection */
  useEffect(() => {
    if (!media.length) return
    setInput(prev =>
        prev.vinylId && media.some(m => m.id === prev.vinylId)
            ? prev
            : { ...prev, vinylId: media[0].id }
    )
  }, [media])

  /** Build substrate groups: unique by base name; de-dupe sizes and sort sizes by area, then width */
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

  /** Sync selected group with selected substrate id; initialise both */
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

  /** If group changes, ensure a valid size inside it */
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

  /** Convenience flags */
  const isVinylOnly =
      input.mode === 'SolidColourCutVinyl' ||
      input.mode === 'PrintAndCutVinyl' ||
      input.mode === 'PrintedVinylOnly'

  const isSubstrateProduct =
      input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'

  /** Current substrate variant */
  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId]
  )

  /** Usable sheet dims (margin aware) */
  const usableSheet = useMemo(() => {
    if (!currentSubVariant) return { w: 0, h: 0 }
    const w = Math.max(0, (currentSubVariant.sizeW ?? 0) - 2 * (DEFAULT_SETTINGS.substrateMarginMm ?? 0))
    const h = Math.max(0, (currentSubVariant.sizeH ?? 0) - 2 * (DEFAULT_SETTINGS.substrateMarginMm ?? 0))
    return { w, h }
  }, [currentSubVariant])

  /** Fit check allowing rotation on the sheet */
  function fitsOnSheet(panelW: number, panelH: number) {
    const { w, h } = usableSheet
    return (panelW <= w && panelH <= h) || (panelW <= h && panelH <= w)
  }

  /** For a given orientation, which split counts are allowed on this sheet? */
  const allowedSplitsForOrientation = useMemo(() => {
    const res: Record<Orientation, number[]> = { Vertical: [], Horizontal: [] }

    const W = input.widthMm || 0
    const H = input.heightMm || 0

    // None (0) is orientation-agnostic
    const noneAllowed = fitsOnSheet(W, H)
    if (noneAllowed) {
      res.Vertical.push(0)
      res.Horizontal.push(0)
    }

    for (let n = 2; n <= MAX_SPLITS; n++) {
      // Vertical: split width into n columns; Horizontal: split height into n rows
      const vw = W / n, vh = H
      const hw = W,    hh = H / n
      if (fitsOnSheet(vw, vh)) res.Vertical.push(n)
      if (fitsOnSheet(hw, hh)) res.Horizontal.push(n)
    }
    return res
  }, [input.widthMm, input.heightMm, usableSheet.w, usableSheet.h])

  /** Auto-default splits if needed (per spec) */
  useEffect(() => {
    if (!isSubstrateProduct || !currentSubVariant) return

    const curOri: Orientation = input.panelOrientation ?? 'Vertical'
    const allowedCur = allowedSplitsForOrientation[curOri]
    const cur = input.panelSplits ?? 0

    // If current choice is still valid for the current orientation, keep it
    if (allowedCur.includes(cur as number)) return

    // Prefer None when possible
    if (allowedCur.includes(0)) {
      setInput(prev => ({ ...prev, panelSplits: 0 }))
      return
    }

    // Otherwise choose the smallest allowed for this orientation
    const smallest = allowedCur.find(n => n >= 2)
    if (smallest != null) {
      setInput(prev => ({ ...prev, panelSplits: smallest }))
      return
    }

    // If nothing fits in current orientation, try the other orientation
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

  /** Ready to price? */
  const needsVinyl = input.mode !== 'SubstrateOnly'
  const needsSub   = isSubstrateProduct

  const ready =
      !loading &&
      (!needsVinyl || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!needsSub   || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

  /** Pricing (guarded) */
  const result: PriceBreakdown | { error: string } | null = useMemo(() => {
    if (!ready) return null
    try {
      return priceSingle({ ...input }, media, substrates, DEFAULT_SETTINGS)
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [ready, input, media, substrates])

  /** Split size result text */
// Split size result text (now multiplied by Quantity)
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

          {/* NEW: Substrate Splits */}
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
                {/* Build options with disabled when not allowed for current orientation */}
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
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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

              {/* Substrate (unique names) */}
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

              {/* Substrate Size for selected name */}
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

              {/*If a different substrate size is selected, the available split options will change.*/}
            </div>
          </Card>

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
