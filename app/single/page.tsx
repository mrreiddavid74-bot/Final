'use client'

import { useEffect, useMemo, useState } from 'react'
import Card from '@/components/Card'
import { DEFAULT_MEDIA, DEFAULT_SETTINGS, DEFAULT_SUBSTRATES } from '@/lib/defaults'
import { priceSingle } from '@/lib/pricing'
import type {
  Mode,
  Orientation,
  Finishing,
  Complexity,
  VinylMedia,
  Substrate,
  PriceBreakdown,
} from '@/lib/types'

// UI options
const MODES: { id: Mode; label: string }[] = [
  { id: 'SolidColourCutVinyl', label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl', label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnly', label: 'Printed Vinyl Only' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly', label: 'Substrate Only' },
]

// Helpers: coerce uploaded CSV rows into strict app types (generate ids if missing)
function coerceVinylRows(rows: any[]): VinylMedia[] {
  return (rows || []).map((r, i) => {
    const id = r.id || `${(r.name || 'vinyl').toLowerCase().replace(/\s+/g, '-')}-${i}`
    return {
      id,
      name: String(r.name ?? `Vinyl ${i + 1}`),
      rollWidthMm: Number(r.rollWidthMm ?? r.rollPrintableWidthMm ?? 0),
      rollPrintableWidthMm: Number(r.rollPrintableWidthMm ?? r.rollWidthMm ?? 0),
      pricePerLm: Number(r.pricePerLm ?? 0),
      category: r.category ?? undefined,
      maxPrintWidthMm: r.maxPrintWidthMm != null ? Number(r.maxPrintWidthMm) : undefined,
      maxCutWidthMm: r.maxCutWidthMm != null ? Number(r.maxCutWidthMm) : undefined,
    }
  }).filter(v => v.rollWidthMm > 0 && v.rollPrintableWidthMm > 0)
}

function coerceSubstrateRows(rows: any[]): Substrate[] {
  return (rows || []).map((r, i) => {
    const id = r.id || `${(r.name || 'substrate').toLowerCase().replace(/\s+/g, '-')}-${i}`
    return {
      id,
      name: String(r.name ?? `Substrate ${i + 1}`),
      sizeW: Number(r.sizeW ?? 0),
      sizeH: Number(r.sizeH ?? 0),
      pricePerSheet: Number(r.pricePerSheet ?? 0),
      thicknessMm: r.thicknessMm != null ? Number(r.thicknessMm) : undefined,
    }
  }).filter(s => s.sizeW > 0 && s.sizeH > 0)
}

type SingleForm = {
  mode: Mode
  widthMm: number
  heightMm: number
  qty: number
  vinylId?: string
  substrateId?: string
  doubleSided: boolean
  finishing?: Finishing
  complexity?: Complexity
  applicationTape?: boolean
  panelSplits?: number
  panelOrientation?: Orientation
}

export default function SinglePage() {
  // Materials (live lists) → start with defaults; upgrade to uploaded CSV lists if available
  const [vinylList, setVinylList] = useState<VinylMedia[]>(DEFAULT_MEDIA)
  const [substrateList, setSubstrateList] = useState<Substrate[]>(DEFAULT_SUBSTRATES)

  // Selected input
  const [input, setInput] = useState<SingleForm>({
    mode: 'PrintedVinylOnly',
    widthMm: 1000,
    heightMm: 500,
    qty: 1,
    vinylId: DEFAULT_MEDIA[0]?.id,
    substrateId: DEFAULT_SUBSTRATES[0]?.id,
    doubleSided: false,
    finishing: 'None',
    complexity: 'Standard',
    applicationTape: false,
    panelSplits: 0,
    panelOrientation: 'Vertical',
  })

  // On mount: try to fetch uploaded CSV data (served as JSON)
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [vRes, sRes] = await Promise.all([
          fetch('/api/settings/vinyl?format=json', { cache: 'no-store' }),
          fetch('/api/settings/substrates?format=json', { cache: 'no-store' }),
        ])
        const [vRows, sRows] = await Promise.all([vRes.json().catch(() => []), sRes.json().catch(() => [])])

        const v = Array.isArray(vRows) ? coerceVinylRows(vRows) : []
        const s = Array.isArray(sRows) ? coerceSubstrateRows(sRows) : []

        if (!cancelled) {
          if (v.length) {
            setVinylList(v)
            // If current vinylId is missing in new list, set first
            if (!v.find(x => x.id === input.vinylId)) {
              setInput(prev => ({ ...prev, vinylId: v[0]?.id }))
            }
          }
          if (s.length) {
            setSubstrateList(s)
            if (!s.find(x => x.id === input.substrateId)) {
              setInput(prev => ({ ...prev, substrateId: s[0]?.id }))
            }
          }
        }
      } catch {
        // ignore → stay on defaults
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isVinylOnly =
      input.mode === 'SolidColourCutVinyl' ||
      input.mode === 'PrintAndCutVinyl' ||
      input.mode === 'PrintedVinylOnly'

  const isSubstrateProduct =
      input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'

  // Price calculation (uses current materials + defaults settings)
  const result = useMemo<PriceBreakdown | { error: string }>(() => {
    try {
      return priceSingle(
          { ...input, settings: DEFAULT_SETTINGS }, // SingleSignInput (settings optional)
          vinylList,
          substrateList,
          DEFAULT_SETTINGS
      )
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [input, vinylList, substrateList])

  return (
      <div className="space-y-6">
        <h1 className="h1">Single Sign</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card>
            <h2 className="h2 mb-2">Product</h2>
            <select
                className="select"
                value={input.mode}
                onChange={(e) => setInput({ ...input, mode: e.target.value as Mode })}
            >
              {MODES.map((m) => (
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
                  onChange={(e) => setInput({ ...input, widthMm: +e.target.value || 0 })}
              />
            </label>
            <label className="label">
              Height (mm)
              <input
                  className="input"
                  type="number"
                  min={1}
                  value={input.heightMm}
                  onChange={(e) => setInput({ ...input, heightMm: +e.target.value || 0 })}
              />
            </label>
            <label className="label">
              Quantity
              <input
                  className="input"
                  type="number"
                  min={1}
                  value={input.qty}
                  onChange={(e) =>
                      setInput({ ...input, qty: Math.max(1, +e.target.value || 1) })
                  }
              />
            </label>
          </Card>

          <Card>
            <h2 className="h2 mb-2">Panels &amp; Finishing</h2>
            <label className="label">
              Split into panels
              <select
                  className="select"
                  value={input.panelSplits}
                  onChange={(e) => setInput({ ...input, panelSplits: +e.target.value })}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? 'None' : n}
                    </option>
                ))}
              </select>
            </label>

            <label className="label">
              Orientation
              <select
                  className="select"
                  value={input.panelOrientation}
                  onChange={(e) =>
                      setInput({
                        ...input,
                        panelOrientation: e.target.value as Orientation,
                      })
                  }
              >
                <option>Vertical</option>
                <option>Horizontal</option>
              </select>
            </label>

            <label className="label">
              Finishing (Vinyl Only)
              <select
                  className="select"
                  value={input.finishing}
                  onChange={(e) =>
                      setInput({ ...input, finishing: e.target.value as Finishing })
                  }
                  disabled={isSubstrateProduct}
              >
                <option>None</option>
                <option>KissCutOnRoll</option>
                <option>CutIntoSheets</option>
                <option>IndividuallyCut</option>
              </select>
            </label>

            <label className={`label ${isVinylOnly ? '' : 'opacity-50'}`}>
              Application tape
              <input
                  className="ml-2"
                  type="checkbox"
                  checked={!!input.applicationTape}
                  onChange={(e) =>
                      setInput({ ...input, applicationTape: e.target.checked })
                  }
                  disabled={!isVinylOnly}
              />
            </label>

            <label className={`label ${isSubstrateProduct ? '' : 'opacity-50'}`}>
              Printed Sides
              <select
                  className="select"
                  value={input.doubleSided ? 'Double Sided' : 'Single Sided'}
                  onChange={(e) =>
                      setInput({ ...input, doubleSided: e.target.value === 'Double Sided' })
                  }
                  disabled={!isSubstrateProduct}
              >
                <option>Single Sided</option>
                <option>Double Sided</option>
              </select>
            </label>
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
                    value={input.vinylId}
                    onChange={e => setInput({ ...input, vinylId: e.target.value })}
                    disabled={input.mode === 'SubstrateOnly'}  // only truly disabled in this one mode
                >
                  {vinylList.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                  ))}
                </select>
              </label>

              <label className={`label ${isVinylOnly ? 'opacity-50' : ''}`}>
                Substrate
                <select
                    className="select mt-1"
                    value={input.substrateId}
                    onChange={(e) => setInput({ ...input, substrateId: e.target.value })}
                    disabled={isVinylOnly}
                >
                  {substrateList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <Card>
            <h2 className="h2 mb-2">Costs</h2>
            {'error' in result ? (
                <div className="text-red-600">{String(result.error)}</div>
            ) : (
                <div className="space-y-2">
                  {result?.costs?.vinyl?.length ? (
                      <div>
                        <h3 className="font-semibold">Vinyl</h3>
                        <ul className="list-disc ml-5">
                          {result.costs.vinyl.map((v, i) => (
                              <li key={i}>
                                {v.media}: {v.lm?.toFixed?.(2)} lm × £{v.pricePerLm?.toFixed?.(2)} ={' '}
                                <b>£{v.cost?.toFixed?.(2)}</b>
                              </li>
                          ))}
                        </ul>
                      </div>
                  ) : null}

                  {result?.costs?.substrate?.length ? (
                      <div>
                        <h3 className="font-semibold">Substrate</h3>
                        <ul className="list-disc ml-5">
                          {result.costs.substrate.map((s, i) => (
                              <li key={i}>
                                {s.material} — {s.sheet}: need {s.neededSheets} →{' '}
                                <b>{s.chargedSheets} full sheets</b> × £{s.pricePerSheet?.toFixed?.(2)} ={' '}
                                <b>£{s.cost?.toFixed?.(2)}</b>
                              </li>
                          ))}
                        </ul>
                      </div>
                  ) : null}

                  <div>
                    <b>Materials Cost:</b> £{result?.materials?.toFixed?.(2)}
                  </div>
                  <div>
                    <b>Sell Cost (pre-delivery):</b> £{result?.preDelivery?.toFixed?.(2)}
                  </div>
                  <div>
                    <b>Delivery:</b> £{result?.delivery?.toFixed?.(2)}
                  </div>
                  <div className="mt-2 text-2xl font-extrabold">
                    Total (Sell Price): £{result?.total?.toFixed?.(2)}
                  </div>

                  {result?.notes?.length ? (
                      <div className="pt-2">
                        <h3 className="font-semibold">Notes</h3>
                        <ul className="list-disc ml-5">
                          {result.notes.map((n, i) => (
                              <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                  ) : null}
                </div>
            )}
          </Card>
        </div>
      </div>
  )
}
