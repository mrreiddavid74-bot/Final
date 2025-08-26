'use client'

import { useEffect, useMemo, useState } from 'react'
import { priceSingle } from '@/lib/pricing'
import { DEFAULT_SETTINGS } from '@/lib/defaults'
import { normalizeSettings } from '@/lib/settings-normalize'
import type {
  Mode, Orientation, Finishing, Complexity,
  VinylMedia, Substrate, SingleSignInput, PriceBreakdown, Settings,
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

const SIZE_SUFFIX_RE = /\s*\(\s*\d+(?:\.\d+)?\s*[x×]\s*\d+(?:\.\d+)?\s*(?:mm)?\s*\)\s*$/i
const baseName = (name?: string) => (name ?? '').replace(SIZE_SUFFIX_RE, '').trim()
const nameKey  = (name?: string) => baseName(name).toLowerCase()
const sizeKey  = (w?: number, h?: number) => `${w ?? 0}x${h ?? 0}`
const fmtSize  = (w?: number, h?: number) => `${w ?? 0} x ${h ?? 0}mm`
const MAX_SPLITS = 6

export default function SinglePage() {
  const [media, setMedia] = useState<VinylMedia[]>([])
  const [substrates, setSubstrates] = useState<Substrate[]>([])
  const [loading, setLoading] = useState(true)

  // uploaded-first settings (defaults fallback)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

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

    // Substrate / visual splits
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
    hemEyelets: false,
  })

  const [subGroupKey, setSubGroupKey] = useState<string | null>(null)

  // --- VINYL SPLIT OPTIONS state ---
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

  // Fetch uploaded costs/settings and normalize with defaults
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const c = await fetch('/api/settings/costs', { cache: 'no-store' }).then(r => (r.ok ? r.json() : {}))
        if (!cancelled) {
          setSettings(normalizeSettings({ ...DEFAULT_SETTINGS, costs: c } as any))
        }
      } catch {
        // fallback already in state
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
      }).sort((a, b) => {
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

  // Sync group with current substrate id; initialise both
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

  // Current substrate variant
  const currentSubVariant = useMemo(
      () => (input.substrateId ? substrates.find(s => s.id === input.substrateId) : undefined),
      [substrates, input.substrateId],
  )

  // Usable sheet dims (from settings margin)
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

  // Allowed splits for each orientation (auto-built; rotation allowed for fit)
  const allowedSplitsForOrientation = useMemo(() => {
    const res: Record<Orientation, number[]> = { Vertical: [], Horizontal: [] }
    const W = input.widthMm || 0
    const H = input.heightMm || 0

    const test = (ori: Orientation, n: number) => {
      const N = n === 0 ? 1 : n
      const pw = ori === 'Vertical' ? W / N : W
      const ph = ori === 'Vertical' ? H     : H / N
      if (fitsOnSheet(pw, ph)) res[ori].push(n)
    }

    test('Vertical', 0);   test('Horizontal', 0)
    for (let n = 2; n <= MAX_SPLITS; n++) {
      test('Vertical', n)
      test('Horizontal', n)
    }

    // If dims not ready yet, keep dropdown interactive
    if (res.Vertical.length === 0)   res.Vertical   = [0, 2, 3, 4, 5, 6]
    if (res.Horizontal.length === 0) res.Horizontal = [0, 2, 3, 4, 5, 6]
    return res
  }, [input.widthMm, input.heightMm, usableSheet.w, usableSheet.h])

  // Auto-snap to a valid split so the panel fits sheet (prefers smallest valid)
  useEffect(() => {
    const isSubstrateMode = input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'
    if (!isSubstrateMode || !currentSubVariant) return

    const curOri: Orientation = input.panelOrientation ?? 'Vertical'
    const curSplit = input.panelSplits ?? 0
    const allowedCur = allowedSplitsForOrientation[curOri]

    if (allowedCur.includes(curSplit)) return

    // smallest valid in current orientation
    const nextInCur = allowedCur.find(n => n === 0 || n >= 2)
    if (nextInCur != null) {
      setInput(prev => ({ ...prev, panelSplits: nextInCur }))
      return
    }

    // switch orientation if needed
    const otherOri: Orientation = curOri === 'Vertical' ? 'Horizontal' : 'Vertical'
    const allowedOther = allowedSplitsForOrientation[otherOri]
    const nextInOther = allowedOther.find(n => n === 0 || n >= 2)
    if (nextInOther != null) {
      setInput(prev => ({ ...prev, panelOrientation: otherOri, panelSplits: nextInOther }))
    }
  }, [
    input.mode,
    currentSubVariant,
    input.panelOrientation,
    input.panelSplits,
    allowedSplitsForOrientation,
  ])

  const isVinylOnlyMode  = input.mode === 'SolidColourCutVinyl' || input.mode === 'PrintAndCutVinyl'
  const isSubstrateMode  = input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'
  const hasVinylSelected = !!input.vinylId && input.mode !== 'SubstrateOnly'

  // Ready to price?
  const ready =
      !loading &&
      (input.mode === 'SubstrateOnly' || (!!input.vinylId && media.some(m => m.id === input.vinylId))) &&
      (!isSubstrateMode || (!!input.substrateId && substrates.some(s => s.id === input.substrateId)))

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
  }, [ready, input, media, substrates, settings, vinylAutoMode, vinylSplitOverride, vinylOrientation])

  // Substrate split preview text
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

  // Vinyl preview
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

    if (vinylAutoMode === 'auto' && vinylSplitOverride === 0) {
      const fitsAsIs = W <= effW
      const fitsRot  = H <= effW
      if (fitsAsIs || fitsRot) {
        const cand: Array<{ across: number; rows: number; totalMm: number }> = []
        if (fitsAsIs) cand.push(packAcross(W, H, Q))
        if (fitsRot)  cand.push(packAcross(H, W, Q))
        const pick = cand.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
        return { text: `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`, lmText: mmText(pick.totalMm) }
      }
      const t = tileColumnsTotal(W, H, Q)
      const tileW = W / t.cols
      const across = perRow(tileW)
      return { text: `${across} per row — ${t.cols} × ${Math.round(W / t.cols)} × ${Math.round(H)}mm`, lmText: mmText(t.totalMm) }
    }

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
      return {
        text: `${n > 1 ? `${Math.max(1, perRow((baseW) / (pick.cols || 1)))} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm` : `1 × ${Math.round(W)} × ${Math.round(H)}mm`}`,
        lmText: mmText(pick.totalMm),
      }
    } else {
      const pick = candidates.reduce((a, b) => (a.totalMm <= b.totalMm ? a : b))
      return {
        text: `${n > 1 ? `${pick.across} per row — ${n} × ${Math.round(baseW)} × ${Math.round(baseH)}mm` : `${pick.across} per row — 1 × ${Math.round(W)} × ${Math.round(H)}mm`}`,
        lmText: mmText(pick.totalMm),
      }
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
              isPrintedProduct={input.mode === 'PrintAndCutVinyl' || input.mode === 'PrintedVinylOnSubstrate'}
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
                  hemEyelets={!!input.hemEyelets}
                  showHemEyelets={input.mode === 'PrintAndCutVinyl'}
                  onChange={(patch) => setInput({ ...input, ...patch })}
              />
              <CostsCard loading={loading} ready={ready} result={result} />
            </div>
        ) : (
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
