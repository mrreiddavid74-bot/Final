'use client'

import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/Card'
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
  PlotterCut,
  CuttingStyle,
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
  { id: 'SolidColourCutVinyl', label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl',    label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly',       label: 'Substrate Only' },
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

    // Vinyl tiling
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
  const isVinylProdOnly =
      input.mode === 'SolidColourCutVinyl' ||
      input.mode === 'PrintAndCutVinyl'
  const isSubstrateProduct =
      input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'
  const showVinylOptions = input.mode === 'PrintedVinylOnSubstrate'
  const showCutOptions = input.mode === 'PrintAndCutVinyl' || input.mode === 'SolidColourCutVinyl'

  // Current substrate variant
  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId],
  )

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
    if (!isSubstrateProduct || !currentSubVariant) return
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
  }, [allowedSplitsForOrientation, isSubstrateProduct, currentSubVariant, input.panelOrientation, input.panelSplits])

  // Ready to price?
  const needsVinyl = input.mode !== 'SubstrateOnly'
  const needsSub = isSubstrateProduct
  const ready =
      !loading &&
      (!needsVinyl || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!needsSub || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

  // Pricing (guarded, kept in sync with the Vinyl Split Options UI)
  const result: PriceBreakdown | { error: string } | null = useMemo(() => {
    if (!ready) return null
    try {
      return priceSingle(
          {
            ...input,
            // keep costs in sync with the "Vinyl Split Options" UI
            vinylAuto: vinylAutoMode === 'auto',
            vinylSplitOverride: vinylAutoMode === 'custom' ? vinylSplitOverride : 0,
            vinylSplitOrientation: vinylOrientation,
          },
          media, substrates, DEFAULT_SETTINGS
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
    // keep your existing working preview block here;
    // no changes needed for the new cut options.
    // (Use the one you already have in your split version.)
    return { text: '—', lmText: '—' } // placeholder if you trimmed it locally
  }, [/* same deps as your current preview */])
  const splitCardTitle =
      input.mode === 'SubstrateOnly' ? 'Substrate Splits' : 'Vinyl splits'
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

        {/* Second row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SubstrateSplitsCard
              title={splitCardTitle}
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

          {isSubstrateProduct ? (
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
              ""
          )}

          {/* NEW: Vinyl Cut Options (only for Print & Cut or Solid Colour) */}
          <VinylCutOptionsCard
              show={showCutOptions}
              plotterCut={input.plotterCut ?? 'None'}
              backedWithWhite={!!input.backedWithWhite}
              cuttingStyle={input.cuttingStyle ?? 'Standard'}
              applicationTape={!!input.applicationTape}
              onChange={(patch) => setInput({ ...input, ...patch })}
          />

          <CostsCard loading={loading} ready={ready} result={result} />
        </div>
      </div>
  )
}
