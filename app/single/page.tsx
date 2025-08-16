// @ts-nocheck
'use client'

import { useMemo, useState } from 'react'
import Card from '../../components/Card'
import { DEFAULT_MEDIA, DEFAULT_SETTINGS, DEFAULT_SUBSTRATES } from '../../lib/defaults'
import { priceSingle } from '../../lib/pricing'

type Mode =
  | 'SolidColourCutVinyl'
  | 'PrintAndCutVinyl'
  | 'PrintedVinylOnly'
  | 'PrintedVinylOnSubstrate'
  | 'SubstrateOnly'

type Orientation = 'Vertical' | 'Horizontal'
type Finishing = 'None' | 'KissCutOnRoll' | 'CutIntoSheets' | 'IndividuallyCut'
type Complexity = 'Basic' | 'Standard' | 'Complex'

const MODES: { id: Mode; label: string }[] = [
  { id: 'SolidColourCutVinyl', label: 'Solid Colour Cut Vinyl Only' },
  { id: 'PrintAndCutVinyl', label: 'Print & Cut Vinyl' },
  { id: 'PrintedVinylOnly', label: 'Printed Vinyl Only' },
  { id: 'PrintedVinylOnSubstrate', label: 'Printed Vinyl mounted to a substrate' },
  { id: 'SubstrateOnly', label: 'Substrate Only' },
]

export default function SinglePage() {
  const [input, setInput] = useState({
    mode: 'PrintedVinylOnly' as Mode,
    widthMm: 1000,
    heightMm: 500,
    qty: 1,
    vinylId: DEFAULT_MEDIA[0]?.id,
    substrateId: DEFAULT_SUBSTRATES[0]?.id,
    doubleSided: false,
    finishing: 'None' as Finishing,
    complexity: 'Standard' as Complexity,
    applicationTape: false,
    panelSplits: 0,
    panelOrientation: 'Vertical' as Orientation,
  })

  const result = useMemo(() => {
    try {
      return priceSingle({
        ...input,
        settings: DEFAULT_SETTINGS,
      })
    } catch (e: any) {
      return { error: e?.message ?? 'Error' }
    }
  }, [input])

  const isVinylOnly =
    input.mode === 'SolidColourCutVinyl' ||
    input.mode === 'PrintAndCutVinyl' ||
    input.mode === 'PrintedVinylOnly'
  const isSubstrateProduct =
    input.mode === 'PrintedVinylOnSubstrate' || input.mode === 'SubstrateOnly'

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
          <h2 className="h2 mb-2">Panels & Finishing</h2>
          <label className="label">
            Split into panels
            <select
              className="select"
              value={input.panelSplits}
              onChange={e => setInput({ ...input, panelSplits: +e.target.value })}
            >
              {[0, 1, 2, 3, 4, 5, 6].map(n => (
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
              onChange={e => setInput({ ...input, panelOrientation: e.target.value as Orientation })}
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
              onChange={e => setInput({ ...input, finishing: e.target.value as Finishing })}
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
              checked={input.applicationTape}
              onChange={e => setInput({ ...input, applicationTape: e.target.checked })}
              disabled={!isVinylOnly}
            />
          </label>

          <label className={`label ${isSubstrateProduct ? '' : 'opacity-50'}`}>
            Printed Sides
            <select
              className="select"
              value={input.doubleSided ? 'Double Sided' : 'Single Sided'}
              onChange={e => setInput({ ...input, doubleSided: e.target.value === 'Double Sided' })}
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
            <label className={`label ${isSubstrateProduct ? 'opacity-50' : ''}`}>
              Vinyl / Media
              <select
                className="select mt-1"
                value={input.vinylId}
                onChange={e => setInput({ ...input, vinylId: e.target.value })}
                disabled={input.mode === 'SubstrateOnly'}
              >
                {DEFAULT_MEDIA.map(v => (
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
                onChange={e => setInput({ ...input, substrateId: e.target.value })}
                disabled={isVinylOnly}
              >
                {DEFAULT_SUBSTRATES.map(s => (
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
          {result?.error ? (
            <div className="text-red-600">{String(result.error)}</div>
          ) : (
            <div className="space-y-2">
              {result?.costs?.vinyl?.length ? (
                <div>
                  <h3 className="font-semibold">Vinyl</h3>
                  <ul className="list-disc ml-5">
                    {result.costs.vinyl.map((v: any, i: number) => (
                      <li key={i}>
                        {v.media}: {v.lm?.toFixed?.(2)} lm × £{v.pricePerLm?.toFixed?.(2)} = <b>£{v.cost?.toFixed?.(2)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {result?.costs?.substrate?.length ? (
                <div>
                  <h3 className="font-semibold">Substrate</h3>
                  <ul className="list-disc ml-5">
                    {result.costs.substrate.map((s: any, i: number) => (
                      <li key={i}>
                        {s.material} — {s.sheet}: need {s.neededSheets} → <b>{s.chargedSheets} full sheets</b> × £{s.pricePerSheet?.toFixed?.(2)} ={' '}
                        <b>£{s.cost?.toFixed?.(2)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div><b>Materials Cost:</b> £{result?.breakdown?.materials?.toFixed?.(2)}</div>
              <div><b>Sell Cost (pre-delivery):</b> £{(result?.totals?.exVAT - result?.breakdown?.delivery)?.toFixed?.(2)}</div>
              <div><b>Delivery:</b> £{result?.breakdown?.delivery?.toFixed?.(2)}</div>
              <div className="mt-2 text-2xl font-extrabold">Total (Sell Price): £{result?.totals?.exVAT?.toFixed?.(2)}</div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
