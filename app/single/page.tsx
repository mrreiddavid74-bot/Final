'use client'

import { useEffect, useMemo, useState } from 'react'
import Card from '../../components/Card'
import { DEFAULT_SETTINGS } from '@/lib/defaults'
import { priceSingle } from '@/lib/pricing'
import type {
  Mode,
  Orientation,
  Finishing,
  Complexity,
  VinylMedia,
  Substrate,
  SingleSignInput,
  PriceBreakdown,
} from '@/lib/types'

// UI pieces
import ProductCard from '@/components/ProductCard'
import DimensionsCard from '@/components/DimensionsCard'
import MaterialsCard from '@/components/MaterialsCard'
import SubstrateSplitsCard from '@/components/SubstrateSplitsCard'
import VinylSplitOptionsCard from '@/components/VinylSplitOptionsCard'
import CostsCard from '@/components/CostsCard'

const MODES: { id: Mode; label: string }[] = [
  { id: 'SolidColourCutVinyl', label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl', label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnly', label: 'Printed Vinyl Only' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly', label: 'Substrate Only' },
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

  // User input (panels fields kept for substrate split card)
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
    panelOrientation: 'Vertical',
  })

  // Which substrate name group is selected
  const [subGroupKey, setSubGroupKey] = useState<string | null>(null)

  // --- VINYL SPLIT OPTIONS state ---
  const [vinylAutoMode, setVinylAutoMode] = useState<'auto' | 'custom'>('auto')
  const [vinylSplitOverride, setVinylSplitOverride] = useState<number>(0) // 0 = None (1 piece)
  const [vinylOrientation, setVinylOrientation] = useState<Orientation>('Vertical')

  // Fetch materials
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
            : { ...prev, vinylId: media[0].id },
    )
  }, [media])

  // Build substrate groups (unique by base name), de-dupe sizes
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
  const isVinylProdOnly =
      input.mode === 'SolidColourCutVinyl' ||
      input.mode === 'PrintAndCutVinyl' ||
      input.mode === 'PrintedVinylOnly'
  const isSubstrateProduct =
      input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'
  const showVinylOptions = input.mode === 'PrintedVinylOnSubstrate'

  // Current substrate variant
  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId],
  )

  // Usable sheet dims (margin aware)
  const usableSheet = useMemo(() => {
    if (!currentSubVariant) return { w: 0, h: 0 }
    const w = Math.max(0, (currentSubVariant.sizeW ?? 0) - 2 * (DEFAULT_SETTINGS.substrateMarginMm ?? 0))
    const h = Math.max(0, (currentSubVariant.sizeH ?? 0) - 2 * (DEFAULT_SETTINGS.substrateMarginMm ?? 0))
    return { w, h }
  }, [currentSubVariant])

  // Fit check allowing rotation on the sheet
  function fitsOnSheet(panelW: number, panelH: number) {
    const { w, h } = usableSheet
    return (panelW <= w && panelH <= h) || (panelW <= h && panelH <= w)
  }

  // Allowed substrate split counts for each orientation
  const allowedSplitsForOrientation = useMemo(() => {
    const res: Record<Orientation, number[]> = { Vertical: [], Horizontal: [] }
    const W = input.widthMm || 0
    const H = input.heightMm || 0

    // None (0)
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

  // Auto-default substrate splits if needed
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
  const needsSub = isSubstrateProduct
  const ready =
      !loading &&
      (!needsVinyl || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!needsSub || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

  // Pricing (guarded, kept in sync with Vinyl Split Options)
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
          media,
          substrates,
          DEFAULT_SETTINGS
      )
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [ready, input, media, substrates, vinylAutoMode, vinylSplitOverride, vinylOrientation])

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

  // ---------- VINYL SPLIT OPTIONS PREVIEW (display only) ----------
  const vinylPreview = useMemo(() => {
    const m = media.find(x => x.id === input.vinylId)
    if (!m) return { text: '—', lmText: '—' }

    // effective printable width
    const masterCap = DEFAULT_SETTINGS.masterMaxPrintWidthMm || Infinity
    const effW = Math.min(masterCap, m.rollPrintableWidthMm, m.maxPrintWidthMm ?? Infinity)

    const gutter = DEFAULT_SETTINGS.vinylMarginMm ?? 0
    const overlap = DEFAULT_SETTINGS.tileOverlapMm ?? 0
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const Q = Math.max(1, input.qty || 1)

    const perRow = (acrossDim: number) => Math.max(1, Math.floor(effW / (acrossDim + gutter)))
    const mmText = (mm: number) => `${Math.round(mm)}mm (${(mm / 1000).toFixed(2)}m)`

    // AUTO (rotate to avoid tiling if possible)
    if (vinylAutoMode === 'auto' && vinylSplitOverride === 0) {
      const fitsAsIs = W <= effW
      const fitsRot = H <= effW
      if (fitsAsIs || fitsRot) {
        const tryOrient = (acrossDim: number, lengthDim: number) => {
          const across = perRow(acrossDim)
          const rows = Math.ceil(Q / across)
          const total = rows * lengthDim + Q * gutter
          return { across, total }
        }
        const a = fitsAsIs ? tryOrient(W, H) : null
        const b = fitsRot ? tryOrient(H, W) : null
        const pick = (a && b) ? (a.total <= b.total ? a : b) : (a || b)!
        return { text: `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`, lmText: mmText(pick.total) }
      }
      // needs tiling
      const denom = Math.max(1, effW - overlap)
      const cols = Math.ceil((W + overlap) / denom)
      const tileW = W / cols
      const pieces = Q * cols
      const across = perRow(tileW)
      const rows = Math.ceil(pieces / across)
      const total = rows * H + pieces * gutter
      return { text: `${across} per row — ${cols} × ${Math.round(W / cols)} × ${Math.round(H)}mm`, lmText: mmText(total) }
    }

    // CUSTOM
    const n = Math.max(1, vinylSplitOverride)
    const baseW = vinylOrientation === 'Vertical' ? W / n : W
    const baseH = vinylOrientation === 'Vertical' ? H : H / n
    const pieces = Q * n

    type Cand = { across: number; total: number }
    const candidates: Cand[] = []

    const tryIfFits = (acrossDim: number, lengthDim: number) => {
      if (acrossDim <= effW) {
        const across = perRow(acrossDim)
        const rows = Math.ceil(pieces / across)
        const total = rows * lengthDim + pieces * gutter
        candidates.push({ across, total })
      }
    }
    // as-is + rotated if they fit
    tryIfFits(baseW, baseH)
    tryIfFits(baseH, baseW)

    if (candidates.length > 0) {
      const pick = candidates.reduce((a, b) => (a.total <= b.total ? a : b))
      const disp = n > 1
          ? `${pick.across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm`
          : `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`
      return { text: disp, lmText: mmText(pick.total) }
    }

    // If neither fits across, fall back to tiling columns
    const denom = Math.max(1, effW - overlap)
    const colsA = Math.ceil((baseW + overlap) / denom)
    const colsB = Math.ceil((baseH + overlap) / denom)
    const useRot = colsB < colsA
    const lengthDim = useRot ? baseW : baseH
    const acrossDim = useRot ? baseH : baseW
    const cols = Math.max(1, Math.min(MAX_SPLITS, useRot ? colsB : colsA))
    const tileAcross = acrossDim / cols
    const across = perRow(tileAcross)
    const rows = Math.ceil((pieces * cols) / across)
    const total = rows * lengthDim + (pieces * cols) * gutter

    const disp = n > 1
        ? `${across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm`
        : `${across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`

    return { text: disp, lmText: mmText(total) }
  }, [
    media,
    input.vinylId,
    input.widthMm,
    input.heightMm,
    input.qty,
    vinylAutoMode,
    vinylSplitOverride,
    vinylOrientation,
  ])

  return (
      <div className="space-y-6">
        <h1 className="h1">Single Sign</h1>

        {/* Top row: Product / Dimensions / Materials */}
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
              isSubstrateProduct={isSubstrateProduct}
              subGroups={subGroups}
              subGroupKey={subGroupKey}
              setSubGroupKey={setSubGroupKey}
              substrateId={input.substrateId}
              onSubstrateChange={(id) => setInput(prev => ({ ...prev, substrateId: id }))}
              fmtSize={fmtSize}
              isVinylProdOnly={isVinylProdOnly}
          />
        </div>

        {/* Second row: Substrate Splits / Vinyl Split Options / Costs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SubstrateSplitsCard
              isSubstrateProduct={isSubstrateProduct}
              currentSubVariant={currentSubVariant}
              panelSplits={input.panelSplits ?? 0}
              panelOrientation={input.panelOrientation ?? 'Vertical'}
              onSplitsChange={(n) => setInput({ ...input, panelSplits: n })}
              onOrientationChange={(o) => setInput({ ...input, panelOrientation: o })}
              allowedSplitsForOrientation={allowedSplitsForOrientation}
              splitPreviewText={splitPreview.panelsText}
              result={result}
          />

          {showVinylOptions ? (
              <VinylSplitOptionsCard
                  hasVinyl={!!input.vinylId}
                  vinylAutoMode={vinylAutoMode}
                  setVinylAutoMode={setVinylAutoMode}
                  vinylSplitOverride={vinylSplitOverride}
                  setVinylSplitOverride={setVinylSplitOverride}
                  vinylOrientation={vinylOrientation}
                  setVinylOrientation={setVinylOrientation}
                  previewText={vinylPreview.text}
                  previewLmText={vinylPreview.lmText}
              />
          ) : (
              <div className="hidden lg:block" />
          )}

          <CostsCard loading={loading} ready={ready} result={result} />
        </div>
      </div>
  )
}
