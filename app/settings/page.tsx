'use client'

import { useCallback, useEffect, useState } from 'react'
import Card from '../../components/Card'

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
        // Non-JSON response (e.g., error HTML or empty body)
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
    const [info, setInfo] = useState<string>('')
    const [error, setError] = useState<string>('')

    const reload = useCallback(async () => {
        setError('')
        setInfo('Loading current materials…')
        try {
            const [vinRes, subRes] = await Promise.all([
                fetch('/api/settings/vinyl', { cache: 'no-store' }),
                fetch('/api/settings/substrates', { cache: 'no-store' }),
            ])
            const [vinJson, subJson] = await Promise.all([safeJson(vinRes), safeJson(subRes)])
            setVinyl(Array.isArray(vinJson) ? vinJson : [])
            setSubstrates(Array.isArray(subJson) ? subJson : [])
            setInfo(`Loaded: ${Array.isArray(vinJson) ? vinJson.length : 0} vinyl, ${Array.isArray(subJson) ? subJson.length : 0} substrates`)
        } catch (e: any) {
            setError(String(e?.message || e))
            setInfo('')
        }
    }, [])

    useEffect(() => {
        reload()
    }, [reload])

    async function upload(endpoint: 'vinyl' | 'substrates', file: File) {
        setError('')
        setInfo(`Uploading ${file.name} to ${endpoint}…`)

        const text = await file.text()
        const looksJson =
            file.name.toLowerCase().endsWith('.json') || /^[\s\r\n]*[\[{]/.test(text)

        try {
            const res = await fetch(`/api/settings/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': looksJson ? 'application/json' : 'text/csv' },
                body: text,
            })

            // Always try to parse JSON; show clear error if not.
            const payload = await safeJson(res)
            if (!res.ok) {
                throw new Error(payload?.error || `Upload failed (${res.status})`)
            }

            setInfo(`${endpoint}: uploaded ${payload?.count ?? 0} rows`)
            await reload()
        } catch (e: any) {
            setError(String(e?.message || e))
            setInfo('')
        }
    }

    return (
        <div className="space-y-6">
            <h1 className="h1">Settings</h1>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                    <h2 className="h2 mb-2">Upload Materials</h2>

                    <div className="space-y-4">
                        <div>
                            <div className="font-semibold mb-1">Vinyl (CSV or JSON array)</div>
                            <input
                                type="file"
                                accept=".csv,.json"
                                onChange={e => {
                                    const f = e.currentTarget.files?.[0]
                                    if (f) upload('vinyl', f)
                                    e.currentTarget.value = '' // allow re-upload same file
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
                                    e.currentTarget.value = '' // allow re-upload same file
                                }}
                            />
                        </div>

                        <button className="btn" onClick={reload}>Reload current data</button>

                        {info ? <div className="text-green-700">{info}</div> : null}
                        {error ? <div className="text-red-600 whitespace-pre-wrap">{error}</div> : null}
                    </div>
                </Card>

                <Card>
                    <h2 className="h2 mb-2">Current Materials Snapshot</h2>
                    <div className="space-y-4">
                        <div>
                            <div className="font-semibold">Vinyl ({vinyl.length})</div>
                            <ul className="list-disc ml-5 max-h-48 overflow-auto">
                                {vinyl.slice(0, 50).map((v, i) => (
                                    <li key={i}>{v.name} — {v.rollPrintableWidthMm}mm printable — £{v.pricePerLm}/lm</li>
                                ))}
                            </ul>
                            {vinyl.length > 50 && <div className="opacity-70 mt-1">…and {vinyl.length - 50} more</div>}
                        </div>

                        <div>
                            <div className="font-semibold">Substrates ({substrates.length})</div>
                            <ul className="list-disc ml-5 max-h-48 overflow-auto">
                                {substrates.slice(0, 50).map((s, i) => (
                                    <li key={i}>{s.name} — {s.sizeW}×{s.sizeH}mm — £{s.pricePerSheet}/sheet</li>
                                ))}
                            </ul>
                            {substrates.length > 50 && <div className="opacity-70 mt-1">…and {substrates.length - 50} more</div>}
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    )
}
