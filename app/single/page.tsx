'use client'

import { useEffect, useMemo, useState } from 'react'
import { priceSingle } from '@/lib/pricing'
import { DEFAULT_SETTINGS } from '@/lib/defaults'
import { normalizeSettings } from '@/lib/settings-normalize'
import type { SingleSignInput, PriceBreakdown, Settings, VinylMedia, Substrate } from '@/lib/types'

// UI
import ProductCard from '@/components/ProductCard'
import DimensionsCard from '@/components/DimensionsCard'
import MaterialsCard from '@/components/MaterialsCard'
import SubstrateSplitsCard from '@/components/SubstrateSplitsCard'
import VinylSplitOptionsCard from '@/components/VinylSplitOptionsCard'
import VinylCutOptionsCard from '@/components/VinylCutOptionsCard'
import CostsCard from '@/components/CostsCard'

// Helpers
const SIZE_SUFFIX_RE = /\s*\(\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm)?\s*\)\s*$/i
const baseName = (name?: string) => (name ?? '').replace(SIZE_SUFFIX_RE, '').trim()
const nameKey  = (name?: string) => baseName(name).toLowerCase()
const sizeKey  = (w?: number, h?: number) => `${w ?? 0}x${h ?? 0}`
const fmtSize  = (w?: number, h?: number) => `${w ?? 0} x ${h ?? 0}mm`
const MAX_SPLITS = 6

// Derive unions from SingleSignInput so we don’t rely on extra exports
type Mode        = SingleSignInput['mode']
type Orientation = NonNullable<SingleSignInput['panelOrientation']>

const MODES: { id: Mode; label: string }[] = [
  { id: 'SolidColourCutVinyl',     label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl',        label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly',           label: 'Substrate Only' },
]

export default function SinglePage() {
  // Materials via API
  const [media, setMedia] = useState<VinylMedia[]>([])
  const [substrates, setSubstrates] = useState<Substrate[]>([])
  const [loading, setLoading] = useState(true)

  // Settings (uploaded rates with DEFAULT fallback)
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
    finishing: 'None',
    complexity: 'Standard',

    // Substrate splits (also used for the “panels” wording)
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

    // Delivery selection (NEW: wire-through only; pricing already supports it)
    deliveryMode: 'Boxed', // 'Boxed' | 'OnARoll'

    hemEyelets: false,
  })

  // Which substrate name group is selected
  const [subGroupKey, setSubGroupKey] = useState<string | null>(null)

  // Local state for Vinyl Split Options UI
  const [vinylAutoMode, setVinylAutoMode] = useState<'auto' | 'custom'>('auto')
  const [vinylSplitOverride, setVinylSplitOverride] = useState<number>(0)
  const [vinylOrientation, setVinylOrientation] = useState<Orientation>('Vertical')

  // Fetch materials
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [m, s] = await Promise.all([
          fetch('/api/settings/vinyl',      { cache: 'no-store' }).then(r => (r.ok ? r.json() : [])),
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

  // Fetch uploaded costs/settings (CSV -> JSON)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const c = await fetch('/api/settings/costs', { cache: 'no-store' }).then(r => (r.ok ? r.json() : {}))
        if (!cancelled) setSettings(normalizeSettings({ ...DEFAULT_SETTINGS, costs: c } as any))
      } catch {
        // fall back to DEFAULT_SETTINGS silently
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Ensure a valid printable vinyl is chosen when needed
  useEffect(() => {
    if (!media.length) return
    setInput(prev =>
        prev.vinylId && media.some(m => m.id === prev.vinylId)
            ? prev
            : { ...prev, vinylId: media[0].id },
    )
  }, [media])

  // Build substrate “name groups” (same product, different sheet sizes)
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
      const variants = list
          .filter(v => {
            const sk = sizeKey(v.sizeW, v.sizeH)
            if (seen.has(sk)) return false
            seen.add(sk)
            return true
          })
          .sort((a, b) => {
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

  // Sync selected group and variant
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
  const isPrintedProduct = input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate'
  const hasVinylSelected = !!input.vinylId && input.mode !== 'SubstrateOnly'

  // Current substrate variant + usable area (with margins)
  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId],
  )

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

  // Compute allowed splits per orientation so the dropdowns enable sensible options
  const allowedSplitsForOrientation = useMemo(() => {
    const res: Record<Orientation, number[]> = { Vertical: [], Horizontal: [] }
    const W = input.widthMm || 0
    const H = input.heightMm || 0

    const pushIfFits = (ori: Orientation, n: number) => {
      const N = n === 0 ? 1 : n
      const pw = ori === 'Vertical' ? W / N : W
      const ph = ori === 'Vertical' ? H     : H / N
      if (fitsOnSheet(pw, ph)) res[ori].push(n)
    }

    // “No split” (0) only if it fits
    pushIfFits('Vertical', 0)
    pushIfFits('Horizontal', 0)

    for (let n = 2; n <= MAX_SPLITS; n++) {
      pushIfFits('Vertical', n)
      pushIfFits('Horizontal', n)
    }
    return res
  }, [input.widthMm, input.heightMm, usableSheet.w, usableSheet.h])

  // Auto-correct panel splits to something that fits (previous app behaviour)
  useEffect(() => {
    if (!isSubstrateMode || !currentSubVariant) return
    const curOri: Orientation = input.panelOrientation ?? 'Vertical'
    const curSplit = input.panelSplits ?? 0
    const allowed = allowedSplitsForOrientation[curOri]

    if (allowed.includes(curSplit)) return

    // Prefer 0 (one piece) if allowed, else smallest >=2
    const next =
        allowed.includes(0) ? 0 :
            allowed.find(n => n >= 2)

    if (next != null) {
      setInput(prev => ({ ...prev, panelSplits: next }))
      return
    }

    // If none fit in current orientation, try the other one
    const other: Orientation = curOri === 'Vertical' ? 'Horizontal' : 'Vertical'
    const allowedOther = allowedSplitsForOrientation[other]
    const nextOther =
        allowedOther.includes(0) ? 0 :
            allowedOther.find(n => n >= 2)

    if (nextOther != null) {
      setInput(prev => ({ ...prev, panelOrientation: other, panelSplits: nextOther }))
    }
  }, [isSubstrateMode, currentSubVariant, input.panelOrientation, input.panelSplits, allowedSplitsForOrientation])

  // Ready?
  const ready =
      !loading &&
      (input.mode === 'SubstrateOnly' || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!isSubstrateMode || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

  // Price (authoritative)
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
          settings,
      )
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [ready, input, media, substrates, vinylAutoMode, vinylSplitOverride, vinylOrientation, settings])

  // Substrate split preview text
  const splitPreview = useMemo(() => {
    const n = input.panelSplits ?? 0
    const N = n === 0 ? 1 : n
    const ori: Orientation = input.panelOrientation ?? 'Vertical'
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const panelW = ori === 'Vertical' ? W / N : W
    const panelH = ori === 'Vertical' ? H : H / N
    return { panelsText: `${n === 0 ? 1 : n} × Panels of ${Math.round(panelW)}mm × ${Math.round(panelH)}mm` }
  }, [input.panelSplits, input.panelOrientation, input.widthMm, input.heightMm])

  // ---------- Vinyl Split Options preview (mirrors pricing, includes edge gutters & double-sided) ----------
  const vinylPreview = useMemo(() => {
    const m = media.find(x => x.id === input.vinylId)
    if (!m) return { text: '—', lmText: '—' }

    const masterCap = settings.masterMaxPrintWidthMm || Infinity
    const effW = Math.min(masterCap, m.rollPrintableWidthMm, m.maxPrintWidthMm ?? Infinity)
    const margin = settings.vinylMarginMm ?? 0
    const overlap = settings.tileOverlapMm ?? 0
    const W = input.widthMm || 0
    const H = input.heightMm || 0
    const Q = Math.max(1, input.qty || 1)
    const sides = input.doubleSided ? 2 : 1

    const perRow = (acrossDim: number) => Math.max(1, Math.floor(effW / (acrossDim + margin)))
    const mmText = (mm: number) => `${Math.round(mm)}mm (${(mm / 1000).toFixed(2)}m)`

    const packAcross = (acrossDim: number, lengthDim: number, pieces: number) => {
      const pr = perRow(acrossDim)
      const rows = Math.ceil(pieces / pr)
      const totalMm = rows * lengthDim + (rows + 1) * margin // edge gutters
      return { across: pr, rows, totalMm }
    }

    const tileColumnsTotal = (acrossDim: number, lengthDim: number, pieces: number) => {
      const denom = Math.max(1, effW - overlap)
      const cols = Math.ceil((acrossDim + overlap) / denom)
      const totalMm = cols * (pieces * lengthDim + (pieces + 1) * margin) // edge + between
      return { cols, totalMm }
    }

    // AUTO
    if (vinylAutoMode === 'auto' && vinylSplitOverride === 0) {
      const fitsAsIs = W <= effW
      const fitsRot  = H <= effW
      if (fitsAsIs || fitsRot) {
        const cand: Array<{ across: number; rows: number; totalMm: number }> = []
        if (fitsAsIs) cand.push(packAcross(W, H, Q))
        if (fitsRot)  cand.push(packAcross(H, W, Q))
        const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
        return { text: `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`, lmText: mmText(pick.totalMm * sides) }
      }
      const t = tileColumnsTotal(W, H, Q)
      const tileW = W / t.cols
      const across = perRow(tileW)
      return { text: `${across} per row — ${t.cols} × ${Math.round(W / t.cols)} × ${Math.round(H)}mm`, lmText: mmText(t.totalMm * sides) }
    }

    // CUSTOM
    const n = Math.max(1, vinylSplitOverride)
    const pieces = Q * n
    const baseW = vinylOrientation === 'Vertical' ? W / n : W
    const baseH = vinylOrientation === 'Vertical' ? H : H / n

    const candidates: Array<{ across?: number; rows?: number; totalMm: number }> = []
    if (baseW <= effW) candidates.push(packAcross(baseW, baseH, pieces))
    if (baseH <= effW) candidates.push(packAcross(baseH, baseW, pieces))

    if (!candidates.length) {
      const ta = tileColumnsTotal(baseW, baseH, pieces)
      const tb = tileColumnsTotal(baseH, baseW, pieces)
      const pick = ta.totalMm <= tb.totalMm ? ta : tb
      const acrossDim = pick === tb ? baseH : baseW
      const tileAcross = acrossDim / (pick.cols || 1)
      const across = perRow(tileAcross)
      const disp = n > 1
          ? `${across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm`
          : `${across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`
      return { text: disp, lmText: mmText(pick.totalMm * sides) }
    } else {
      const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      const disp = n > 1
          ? `${pick.across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm`
          : `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`
      return { text: disp, lmText: mmText(pick.totalMm * sides) }
    }
  }, [
    media,
    input.vinylId,
    input.widthMm,
    input.heightMm,
    input.qty,
    input.doubleSided,
    vinylAutoMode,
    vinylSplitOverride,
    vinylOrientation,
    settings.masterMaxPrintWidthMm,
    settings.vinylMarginMm,
    settings.tileOverlapMm,
  ])

  // ---------- Layout ----------
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
              // NEW: wire delivery selection through the same onChange patch
              deliveryMode={input.deliveryMode ?? 'Boxed'}
              onChange={(patch) => setInput({ ...input, ...patch })}
          />

          <MaterialsCard
              loading={loading}
              media={media}
              vinylId={input.vinylId}
              onVinylChange={(id) => setInput({ ...input, vinylId: id })}
              isVinylDisabled={input.mode === 'SubstrateOnly'}
              isSubstrateProduct={isSubstrateMode}
              isPrintedProduct={isPrintedProduct}
              doubleSided={!!input.doubleSided}
              onDoubleSidedChange={(v) => setInput({ ...input, doubleSided: v })}
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <SubstrateSplitsCard
                  isSubstrateProduct={true}
                  currentSubVariant={currentSubVariant}
                  panelSplits={input.panelSplits ?? 0}
                  panelOrientation={input.panelOrientation ?? 'Vertical'}
                  onSplitsChange={(n) => setInput({ ...input, panelSplits: n })}
                  onOrientationChange={(o) => setInput({ ...input, panelOrientation: o })}
                  allowedSplitsForOrientation={allowedSplitsForOrientation}
                  splitPreviewText={splitPreview.panelsText}
                  result={result}
              />

              {/* Hide Vinyl Split Options completely for Substrate Only */}
              {input.mode !== 'SubstrateOnly' && (
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
              )}

              <CostsCard loading={loading} ready={ready} result={result} />
            </div>
        )}
      </div>
  )
}
