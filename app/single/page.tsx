'use client'

import { useEffect, useMemo, useState } from 'react'
import { priceSingle } from '@/lib/pricing'
import { DEFAULT_SETTINGS } from '@/lib/defaults'
import type {
  Mode,
  Orientation,
  Finishing,
  Complexity,
  VinylMedia,
  Substrate,
  SingleSignInput,
  PriceBreakdown,
  Settings,
} from '@/lib/types'

// UI pieces
import ProductCard from '@/components/ProductCard'
import DimensionsCard from '@/components/DimensionsCard'
import MaterialsCard from '@/components/MaterialsCard'
import SubstrateSplitsCard from '@/components/SubstrateSplitsCard'
import VinylSplitOptionsCard from '@/components/VinylSplitOptionsCard'
import VinylCutOptionsCard from '@/components/VinylCutOptionsCard'
import CostsCard from '@/components/CostsCard'

const MODES: { id: Mode; label: string }[] = [
  { id: 'SolidColourCutVinyl',     label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl',        label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly',           label: 'Substrate Only' },
]

// helpers
const SIZE_SUFFIX_RE = /\s*\(\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm)?\s*\)\s*$/i
const baseName = (name?: string) => (name ?? '').replace(SIZE_SUFFIX_RE, '').trim()
const nameKey = (name?: string) => baseName(name).toLowerCase()
const sizeKey = (w?: number, h?: number) => `${w ?? 0}x${h ?? 0}`
const fmtSize = (w?: number, h?: number) => `${w ?? 0} x ${h ?? 0}mm`
const MAX_SPLITS = 6

export default function SinglePage() {
  // Materials (loaded via API)
  const [media, setMedia] = useState<VinylMedia[]>([])
  const [substrates, setSubstrates] = useState<Substrate[]>([])
  const [loading, setLoading] = useState(true)

  // Settings/costs (loaded from your /api/settings/costs)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  // User input
  const [input, setInput] = useState<SingleSignInput>({
    mode: 'PrintAndCutVinyl',
    widthMm: 1000,
    heightMm: 500,
    qty: 1,
    vinylId: undefined,
    substrateId: undefined,
    doubleSided: false,
    finishing: 'None' as Finishing,
    complexity: 'Standard' as Complexity,

    // Vinyl tiling (panels used for substrate splits naming, reused as "Vinyl splits" visual)
    panelSplits: 0,
    panelOrientation: 'Vertical',

    // Vinyl Split Options (tiling)
    vinylAuto: true,
    vinylSplitOverride: 0,
    vinylSplitOrientation: 'Vertical',

    // Vinyl Cut Options
    plotterCut: 'None',
    backedWithWhite: false,
    cuttingStyle: 'Standard',
    applicationTape: false,
  })

  // Which substrate name group is selected
  const [subGroupKey, setSubGroupKey] = useState<string | null>(null)

  // --- VINYL SPLIT OPTIONS state (UI local mirrors) ---
  const [vinylAutoMode, setVinylAutoMode] = useState<'auto' | 'custom'>('auto')
  const [vinylSplitOverride, setVinylSplitOverride] = useState<number>(0)
  const [vinylOrientation, setVinylOrientation] = useState<Orientation>('Vertical')

  // Fetch materials
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [m, s] = await Promise.all([
          fetch('/api/settings/vinyl',       { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])),
          fetch('/api/settings/substrates',  { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])),
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

  // Fetch costs/settings (CSV → JSON)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/settings/costs', { cache: 'no-store' })
        if (!res.ok) throw new Error('Failed to load costs')
        const json = await res.json()
        if (!cancelled) setSettings(json as Settings)
      } catch {
        // fall back silently to DEFAULT_SETTINGS
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
            : { ...prev, vinylId: media[0].id },
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

  // Sync selected group with current substrate id; initialise both
  useEffect(() => {
    if (!subGroups.length) return
    setInput(prev => {
      const next = { ...prev }
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

  // If group changes, ensure a valid size
  useEffect(() => {
    if (!subGroupKey) return
    const g = subGroups.find(x => x.key === subGroupKey)
    if (!g) return
    setInput(prev =>
        prev.substrateId && g.variants.some(v => v.id === prev.substrateId)
            ? prev
            : { ...prev, substrateId: g.variants[0]?.id },
    )
  }, [subGroupKey, subGroups])

  // Convenience flags
  const isVinylOnlyMode  = input.mode === 'SolidColourCutVinyl' || input.mode === 'PrintAndCutVinyl'
  const isSubstrateMode  = input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'
  const hasVinylSelected = !!input.vinylId && input.mode !== 'SubstrateOnly'

  // Current substrate variant
  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId],
  )

  // Usable sheet dims (from settings)
  const usableSheet = useMemo(() => {
    if (!currentSubVariant) return { w: 0, h: 0 }
    const margin = settings.substrateMarginMm ?? 0
    const w = Math.max(0, (currentSubVariant.sizeW ?? 0) - 2 * margin)
    const h = Math.max(0, (currentSubVariant.sizeH ?? 0) - 2 * margin)
    return { w, h }
  }, [currentSubVariant, settings.substrateMarginMm])

  function fitsOnSheet(panelW: number, panelH: number) {
    const { w, h } = usableSheet
    return (panelW <= w && panelH <= h) || (panelW <= h && panelH <= w)
  }

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

  useEffect(() => {
    if (!isSubstrateMode || !currentSubVariant) return
    const curOri: Orientation = input.panelOrientation ?? 'Vertical'
    const allowedCur = allowedSplitsForOrientation[curOri]
    const cur = input.panelSplits ?? 0
    if (allowedCur.includes(cur)) return
    if (allowedCur.includes(0)) { setInput(prev => ({ ...prev, panelSplits: 0 })); return }
    const smallest = allowedCur.find(n => n >= 2)
    if (smallest != null) { setInput(prev => ({ ...prev, panelSplits: smallest })); return }
    const otherOri: Orientation = curOri === 'Vertical' ? 'Horizontal' : 'Vertical'
    const allowedOther = allowedSplitsForOrientation[otherOri]
    if (allowedOther.includes(0)) { setInput(prev => ({ ...prev, panelOrientation: otherOri, panelSplits: 0 })); return }
    const smallestOther = allowedOther.find(n => n >= 2)
    if (smallestOther != null) setInput(prev => ({ ...prev, panelOrientation: otherOri, panelSplits: smallestOther }))
  }, [allowedSplitsForOrientation, isSubstrateMode, currentSubVariant, input.panelOrientation, input.panelSplits])

  // Ready to price?
  const needsVinyl = input.mode !== 'SubstrateOnly'
  const needsSub   = isSubstrateMode
  const ready =
      !loading &&
      (!needsVinyl || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!needsSub   || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

  // Pricing (kept in sync with the Vinyl Split Options UI)
  const result: PriceBreakdown | { error: string } | null = useMemo(() => {
    if (!ready) return null
    try {
      return priceSingle(
          {
            ...input,
            vinylAuto: vinylAutoMode === 'auto',
            vinylSplitOverride: vinylAutoMode === 'custom' ? vinylSplitOverride : 0,
            vinylSplitOrientation: vinylOrientation,
          },
          media, substrates, settings
      )
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [ready, input, media, substrates, vinylAutoMode, vinylSplitOverride, vinylOrientation, settings])

  // Substrate split preview (display only)
  const splitPreview = useMemo(() => {
    const n = input.panelSplits ?? 0
    const N = n === 0 ? 1 : n
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const panelW = ori === 'Vertical' ? W / N : W
    const panelH = ori === 'Vertical' ? H : H / N
    const panelsText = `${n === 0 ? 1 : n} × Panels of ${Math.round(panelW)}mm × ${Math.round(panelH)}mm`
    return { panelsText }
  }, [input.panelSplits, input.panelOrientation, input.widthMm, input.heightMm])

  // ---------- VINYL SPLIT OPTIONS PREVIEW (matches pricing formulas and SETTINGS) ----------
  const vinylPreview = useMemo(() => {
    const m = media.find(x => x.id === input.vinylId)
    if (!m) return { text: '—', lmText: '—' }

    const masterCap = settings.masterMaxPrintWidthMm || Infinity
    const effW = Math.min(masterCap, m.rollPrintableWidthMm, m.maxPrintWidthMm ?? Infinity)
    const gutter = settings.vinylMarginMm ?? 0
    const overlap = settings.tileOverlapMm ?? 0
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const Q = Math.max(1, input.qty || 1)

    const perRow = (acrossDim: number) => Math.max(1, Math.floor(effW / (acrossDim + gutter)))
    const mmText = (mm: number) => `${Math.round(mm)}mm (${(mm / 1000).toFixed(2)}m)`

    // helpers mirroring pricing.ts
    const packAcross = (acrossDim: number, lengthDim: number, pieces: number) => {
      const pr = perRow(acrossDim)
      const rows = Math.ceil(pieces / pr)
      const totalMm = rows * lengthDim + Math.max(0, rows - 1) * gutter
      return { across: pr, rows, totalMm }
    }
    const tileColumnsTotal = (acrossDim: number, lengthDim: number, pieces: number) => {
      const denom = Math.max(1, effW - overlap)
      const cols = Math.ceil((acrossDim + overlap) / denom)
      const totalMm = cols * (lengthDim + gutter) * pieces
      return { cols, totalMm }
    }

    // AUTO (rotate to avoid tiling if possible)
    if (vinylAutoMode === 'auto' && vinylSplitOverride === 0) {
      const fitsAsIs = W <= effW
      const fitsRot  = H <= effW
      if (fitsAsIs || fitsRot) {
        const cand: Array<{ across: number; rows: number; totalMm: number; label: string }> = []
        if (fitsAsIs) cand.push({ ...packAcross(W, H, Q), label: `${Math.round(W)} × ${Math.round(H)}mm` })
        if (fitsRot)  cand.push({ ...packAcross(H, W, Q), label: `${Math.round(W)} × ${Math.round(H)}mm` })
        const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
        return { text: `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`, lmText: mmText(pick.totalMm) }
      }
      // need tiling
      const t = tileColumnsTotal(W, H, Q)
      const tileW = W / t.cols
      const across = perRow(tileW)
      return {
        text: `${across} per row — ${t.cols} × ${Math.round(W / t.cols)} × ${Math.round(H)}mm`,
        lmText: mmText(t.totalMm)
      }
    }

    // CUSTOM (override)
    const n = Math.max(1, vinylSplitOverride)
    const pieces = Q * n
    const baseW = vinylOrientation === 'Vertical' ? W / n : W
    const baseH = vinylOrientation === 'Vertical' ? H : H / n

    const candidates: Array<{ across?: number; rows?: number; totalMm: number; cols?: number; rotated?: boolean }> = []

    if (baseW <= effW) candidates.push({ ...packAcross(baseW, baseH, pieces) })
    if (baseH <= effW) candidates.push({ ...packAcross(baseH, baseW, pieces), rotated: true })

    if (!candidates.length) {
      const ta = tileColumnsTotal(baseW, baseH, pieces)
      const tb = tileColumnsTotal(baseH, baseW, pieces)
      const pick = ta.totalMm <= tb.totalMm ? { ...ta, rotated: false } : { ...tb, rotated: true }
      const acrossDim = pick.rotated ? baseH : baseW
      const tileAcross = acrossDim / (pick.cols || 1)
      const across = perRow(tileAcross)
      const disp = n > 1
          ? `${across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm`
          : `${across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`
      return { text: disp, lmText: mmText(pick.totalMm) }
    } else {
      const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      const disp = n > 1
          ? `${pick.across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm`
          : `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`
      return { text: disp, lmText: mmText(pick.totalMm) }
    }
  }, [
    media,
    input.vinylId,
    input.widthMm,
    input.heightMm,
    input.qty,
    vinylAutoMode,
    vinylSplitOverride,
    vinylOrientation,
    settings.masterMaxPrintWidthMm,
    settings.vinylMarginMm,
    settings.tileOverlapMm,
  ])

  // ---------- LAYOUT ----------
  return (
      <div className="space-y-6">
        <h1 className="h1">Single Sign</h1>

        {/* Top row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ProductCard
              modes={MODES}
              mode={input.mode}
              onChange={(m) => setInput({ ...input, mode: m })}
          />
          <DimensionsCard
              widthMm={input.widthMm}
              heightMm={input.heightMm}
              qty={input.qty}
              onChange={(patch) => setInput({ ...input, ...patch })}
          />
          <MaterialsCard
              loading={loading}
              media={media}
              vinylId={input.vinylId}
              onVinylChange={(id) => setInput({ ...input, vinylId: id })}
              isVinylDisabled={input.mode === 'SubstrateOnly'}
              isSubstrateProduct={isSubstrateMode}
              subGroups={subGroups}
              subGroupKey={subGroupKey}
              setSubGroupKey={setSubGroupKey}
              substrateId={input.substrateId}
              onSubstrateChange={(id) => setInput(prev => ({ ...prev, substrateId: id }))}
              fmtSize={fmtSize}
              isVinylProdOnly={isVinylOnlyMode}
          />
        </div>

        {/* Second row */}
        {isVinylOnlyMode ? (
            // For "Print & Cut Vinyl" and "Solid Colour Cut Vinyl Only": show Vinyl Split Options in the first slot.
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <VinylSplitOptionsCard
                  hasVinyl={hasVinylSelected}
                  vinylAutoMode={vinylAutoMode}
                  setVinylAutoMode={setVinylAutoMode}
                  vinylSplitOverride={vinylSplitOverride}
                  setVinylSplitOverride={setVinylSplitOverride}
                  vinylOrientation={vinylOrientation}
                  setVinylOrientation={setVinylOrientation}
                  previewText={vinylPreview.text}
                  previewLmText={vinylPreview.lmText}
              />

              {/* Vinyl Cut Options next, then Costs */}
              <VinylCutOptionsCard
                  show={true}
                  plotterCut={input.plotterCut ?? 'None'}
                  backedWithWhite={!!input.backedWithWhite}
                  cuttingStyle={input.cuttingStyle ?? 'Standard'}
                  applicationTape={!!input.applicationTape}
                  onChange={(patch) => setInput({ ...input, ...patch })}
              />

              <CostsCard loading={loading} ready={ready} result={result} />
            </div>
        ) : (
            // Substrate products: keep Substrate Splits first, Vinyl Split Options second, Costs third.
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SubstrateSplitsCard
                  isSubstrateProduct={isSubstrateMode}
                  currentSubVariant={currentSubVariant}
                  panelSplits={input.panelSplits ?? 0}
                  panelOrientation={input.panelOrientation ?? 'Vertical'}
                  onSplitsChange={(n) => setInput({ ...input, panelSplits: n })}
                  onOrientationChange={(o) => setInput({ ...input, panelOrientation: o })}
                  allowedSplitsForOrientation={allowedSplitsForOrientation}
                  splitPreviewText={splitPreview.panelsText}
                  result={result}
              />

              <VinylSplitOptionsCard
                  hasVinyl={hasVinylSelected}
                  vinylAutoMode={vinylAutoMode}
                  setVinylAutoMode={setVinylAutoMode}
                  vinylSplitOverride={vinylSplitOverride}
                  setVinylSplitOverride={setVinylSplitOverride}
                  vinylOrientation={vinylOrientation}
                  setVinylOrientation={setVinylOrientation}
                  previewText={vinylPreview.text}
                  previewLmText={vinylPreview.lmText}
              />

              <CostsCard loading={loading} ready={ready} result={result} />
            </div>
        )}
      </div>
  )
}
