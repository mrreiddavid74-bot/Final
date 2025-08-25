'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '@/components/Card'
import type { Settings } from '@/lib/types'
import { DEFAULT_SETTINGS } from '@/lib/defaults'

// --- Row types just for the list previews on this page ---
type VinylRow = {
    id?: string
    name?: string
    rollWidthMm?: number | string
    rollPrintableWidthMm?: number | string
    pricePerLm?: number | string
    maxPrintWidthMm?: number | string
    maxCutWidthMm?: number | string
    category?: string
}

type SubstrateRow = {
    id?: string
    name?: string
    sizeW?: number | string
    sizeH?: number | string
    pricePerSheet?: number | string
    thicknessMm?: number | string
}

async function safeJson(res: Response) {
    const ctype = res.headers.get('content-type') || ''
    const text = await res.text()
    if (!ctype.includes('application/json')) {
        throw new Error(
            `Unexpected non-JSON response (${res.status} ${res.statusText}).\n` +
            `${text.slice(0, 400)}`
        )
    }
    try {
        return JSON.parse(text)
    } catch (e: any) {
        throw new Error(`Invalid JSON from server: ${e?.message || e}\n${text.slice(0, 400)}`)
    }
}

export default function SettingsPage() {
    const [vinyl, setVinyl] = useState<VinylRow[]>([])
    const [substrates, setSubstrates] = useState<SubstrateRow[]>([])
    const [costs, setCosts] = useState<Settings>(DEFAULT_SETTINGS)
    const [info, setInfo] = useState('')
    const [error, setError] = useState('')

    const reload = useCallback(async () => {
        setError('')
        setInfo('Loading current materials & costs…')
        try {
            const [vinRes, subRes, costRes] = await Promise.all([
                fetch('/api/settings/vinyl', { cache: 'no-store' }),
                fetch('/api/settings/substrates', { cache: 'no-store' }),
                fetch('/api/settings/costs', { cache: 'no-store' }),
            ])
            const [vinJson, subJson, costJson] = await Promise.all([
                safeJson(vinRes),
                safeJson(subRes),
                safeJson(costRes),
            ])
            setVinyl(Array.isArray(vinJson) ? vinJson : [])
            setSubstrates(Array.isArray(subJson) ? subJson : [])
            // /api/settings/costs returns normalized settings (and maybe metadata)
            setCosts((costJson && typeof costJson === 'object' && costJson.settings) ? costJson.settings : costJson)

            setInfo(
                `Loaded: ${Array.isArray(vinJson) ? vinJson.length : 0} vinyl, ` +
                `${Array.isArray(subJson) ? subJson.length : 0} substrates, ` +
                `costs ok`
            )
        } catch (e: any) {
            setError(String(e?.message || e))
            setInfo('')
        }
    }, [])

    useEffect(() => { reload() }, [reload])

    async function upload(endpoint: 'vinyl' | 'substrates' | 'costs', file: File) {
        setError('')
        setInfo(`Uploading ${file.name} to ${endpoint}…`)

        const text = await file.text()
        const looksJson = file.name.toLowerCase().endsWith('.json') || /^[\s\r\n]*[\[{]/.test(text)

        try {
            const res = await fetch(`/api/settings/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': looksJson ? 'application/json' : 'text/csv' },
                body: text,
            })
            const payload = await safeJson(res)
            if (!res.ok) throw new Error(payload?.error || `Upload failed (${res.status})`)
            setInfo(`${endpoint}: uploaded ${payload?.count ?? 0} rows`)
            await reload()
        } catch (e: any) {
            setError(String(e?.message || e))
            setInfo('')
        }
    }

    // Helpers for snapshot display
    const finishingEntries = Object.entries(costs.finishingUplifts ?? {}) as Array<[string, number]>
    const complexityEntries = Object.entries(costs.complexityPerSticker ?? {}) as Array<[string, number]>
    const deliveryBands = costs.delivery?.bands ?? []

    return (
        <div className="space-y-6">
            <h1 className="h1">Settings</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Uploaders */}
                <Card>
                    <h2 className="h2 mb-2">Upload Materials & Costs</h2>

                    <div className="space-y-4">
                        <div>
                            <div className="font-semibold mb-1">Vinyl (CSV or JSON array)</div>
                            <input
                                type="file"
                                accept=".csv,.json"
                                onChange={e => {
                                    const f = e.currentTarget.files?.[0]
                                    if (f) upload('vinyl', f)
                                    e.currentTarget.value = ''
                                }}
                            />
                        </div>

                        <div>
                            <div className="font-semibold mb-1">Substrates (CSV or JSON array)</div>
                            <input
                                type="file"
                                accept=".csv,.json"
                                onChange={e => {
                                    const f = e.currentTarget.files?.[0]
                                    if (f) upload('substrates', f)
                                    e.currentTarget.value = ''
                                }}
                            />
                        </div>

                        <div>
                            <div className="font-semibold mb-1">Costs & Rules (CSV or JSON object)</div>
                            <input
                                type="file"
                                accept=".csv,.json"
                                onChange={e => {
                                    const f = e.currentTarget.files?.[0]
                                    if (f) upload('costs', f)
                                    e.currentTarget.value = ''
                                }}
                            />
                            <div className="text-sm opacity-70 mt-1">
                                CSV: two columns <code>key,value</code>. JSON: a single Settings object.
                            </div>
                        </div>

                        <button className="btn" onClick={reload}>Reload current data</button>

                        {info ? <div className="text-green-700">{info}</div> : null}
                        {error ? <div className="text-red-600 whitespace-pre-wrap">{error}</div> : null}
                    </div>
                </Card>

                {/* Materials snapshot */}
                <Card>
                    <h2 className="h2 mb-2">Current Materials Snapshot</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="font-semibold">Vinyl ({vinyl.length})</div>
                            <ul className="list-disc ml-5 max-h-48 overflow-auto">
                                {vinyl.slice(0, 50).map((v, i) => (
                                    <li key={i}>
                                        {v.name} — {v.rollPrintableWidthMm}mm printable — £{v.pricePerLm}/lm
                                    </li>
                                ))}
                            </ul>
                            {vinyl.length > 50 && <div className="opacity-70 mt-1">…and {vinyl.length - 50} more</div>}
                        </div>

                        <div>
                            <div className="font-semibold">Substrates ({substrates.length})</div>
                            <ul className="list-disc ml-5 max-h-48 overflow-auto">
                                {substrates.slice(0, 50).map((s, i) => (
                                    <li key={i}>
                                        {s.name} — {s.sizeW}×{s.sizeH}mm — £{s.pricePerSheet}/sheet
                                    </li>
                                ))}
                            </ul>
                            {substrates.length > 50 && <div className="opacity-70 mt-1">…and {substrates.length - 50} more</div>}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Costs snapshot */}
            <Card>
                <h2 className="h2 mb-2">Current Costs &amp; Rules Snapshot</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <div className="font-semibold mb-1">General</div>
                        <ul className="list-disc ml-5">
                            <li>Setup Fee: £{(costs.setupFee ?? 0).toFixed(2)}</li>
                            <li>Cut Per Sign: £{(costs.cutPerSign ?? 0).toFixed(2)}</li>
                            <li>App Tape / m²: £{(costs.appTapePerSqm ?? costs.applicationTapePerSqm ?? 0).toFixed(2)}</li>
                            <li>Ink+Elec / m²: £{(costs.inkElecPerSqm ?? costs.inkCostPerSqm ?? 0).toFixed(2)}</li>
                            <li>Profit ×: {(costs.profitMultiplier ?? 1).toFixed(2)}</li>
                        </ul>
                    </div>

                    <div>
                        <div className="font-semibold mb-1">Machine &amp; Margins</div>
                        <ul className="list-disc ml-5">
                            <li>Master Print Max: {costs.masterMaxPrintWidthMm ?? 0}mm</li>
                            <li>Master Cut Max: {costs.masterMaxCutWidthMm ?? 0}mm</li>
                            <li>Vinyl Margin: {costs.vinylMarginMm ?? 0}mm</li>
                            <li>Substrate Margin: {costs.substrateMarginMm ?? 0}mm</li>
                            <li>Tile Overlap: {costs.tileOverlapMm ?? 0}mm</li>
                            <li>Vinyl Waste / Job: {(costs.vinylWasteLmPerJob ?? 0).toFixed(2)} lm</li>
                        </ul>
                    </div>

                    <div>
                        <div className="font-semibold mb-1">Uplifts &amp; Bands</div>
                        <div className="mb-2">
                            <div className="font-semibold">Finishing Uplifts</div>
                            <ul className="list-disc ml-5">
                                {finishingEntries.map(([k, val]) => (
                                    <li key={k}>{k}: {(val * 100).toFixed(1)}%</li>
                                ))}
                            </ul>
                        </div>
                        {!!complexityEntries.length && (
                            <div className="mb-2">
                                <div className="font-semibold">Complexity per Sticker</div>
                                <ul className="list-disc ml-5">
                                    {complexityEntries.map(([k, val]) => (
                                        <li key={k}>{k}: £{val.toFixed(2)}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        <div className="mb-2">
                            <div className="font-semibold">Delivery</div>
                            {costs.delivery ? (
                                <ul className="list-disc ml-5">
                                    <li>Base Fee: £{(costs.delivery.baseFee ?? 0).toFixed(2)}</li>
                                    {deliveryBands.map((b, i) => (
                                        <li key={i}>
                                            {b.name ?? (b.maxGirthCm ? `${b.maxGirthCm}cm` : `${b.maxSumCm ?? ''}cm`)} — £
                                            {(b.price ?? 0).toFixed(2)}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <ul className="list-disc ml-5">
                                    <li>Base Fee: £{(costs.deliveryBase ?? 0).toFixed(2)}</li>
                                    {(costs.deliveryBands ?? []).map((b, i) => (
                                        <li key={i}>{b.maxSumCm}cm — +£{(b.surcharge ?? 0).toFixed(2)}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </Card>
        </div>
    )
}
