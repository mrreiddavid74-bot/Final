'use client'
import Card from '@/components/Card'
import type { PriceBreakdown } from '@/lib/types'

type Props = {
    loading: boolean
    ready: boolean
    result: PriceBreakdown | { error: string } | null
}

export default function CostsCard({ loading, ready, result }: Props) {
    // Loading / not ready
    if (loading || !ready) {
        return (
            <Card>
                <h2 className="h2 mb-2">Costs</h2>
                <div className="opacity-70">Select materials to see pricing…</div>
            </Card>
        )
    }

    // Null result
    if (!result) {
        return (
            <Card>
                <h2 className="h2 mb-2">Costs</h2>
                <div className="text-red-600">No result.</div>
            </Card>
        )
    }

    // Error case
    if ('error' in result) {
        return (
            <Card>
                <h2 className="h2 mb-2">Costs</h2>
                <div className="text-red-600">{String(result.error)}</div>
            </Card>
        )
    }

    // Success: now `result` is a PriceBreakdown
    const pb = result as PriceBreakdown
    const vinylRows = pb.costs?.vinyl ?? []
    const substrateRows = pb.costs?.substrate ?? []
    const notes = pb.notes ?? []

    return (
        <Card>
            <h2 className="h2 mb-2">Costs</h2>

            <div className="space-y-2">
                {vinylRows.length > 0 && (
                    <div>
                        <h3 className="font-semibold">Vinyl</h3>
                        <ul className="list-disc ml-5">
                            {vinylRows.map((v, i) => (
                                <li key={i}>
                                    {v.media}: {v.lm?.toFixed?.(2)} lm × £{v.pricePerLm?.toFixed?.(2)} ={' '}
                                    <b>£{v.cost?.toFixed?.(2)}</b>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {substrateRows.length > 0 && (
                    <div>
                        <h3 className="font-semibold">Substrate</h3>
                        <ul className="list-disc ml-5">
                            {substrateRows.map((s, i) => (
                                <li key={i}>
                                    {s.material} — {s.sheet}: need {s.neededSheets} → <b>{s.chargedSheets} full sheets</b> × £
                                    {s.pricePerSheet?.toFixed?.(2)} = <b>£{s.cost?.toFixed?.(2)}</b>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div>
                    <b>Materials Cost:</b> £{pb.materials.toFixed(2)}
                </div>
                <div>
                    <b>Sell Cost (pre-delivery):</b> £{pb.preDelivery.toFixed(2)}
                </div>
                <div>
                    <b>Delivery:</b> £{pb.delivery.toFixed(2)}
                </div>
                <div className="mt-2 text-2xl font-extrabold">
                    Total (Sell Price): £{pb.total.toFixed(2)}
                </div>

                {notes.length > 0 && (
                    <div className="mt-3">
                        <h3 className="font-semibold">Notes</h3>
                        <ul className="list-disc ml-5">
                            {notes.map((n, i) => (
                                <li key={i}>{n}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </Card>
    )
}
