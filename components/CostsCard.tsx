'use client'
import Card from '@/components/Card'
import type { PriceBreakdown } from '@/lib/types'

export default function CostsCard({
                                      loading, ready, result,
                                  }: {
    loading: boolean
    ready: boolean
    result: PriceBreakdown | { error: string } | null
}) {
    return (
        <Card>
            <h2 className="h2 mb-2">Costs</h2>

            {loading || !ready ? (
                <div className="opacity-70">Select materials to see pricing…</div>
            ) : 'error' in (result as any) ? (
                <div className="text-red-600">{String((result as any).error)}</div>
            ) : (
                <div className="space-y-2">
                    {(result as PriceBreakdown)?.costs?.vinyl?.length ? (
                        <div>
                            <h3 className="font-semibold">Vinyl</h3>
                            <ul className="list-disc ml-5">
                                {(result as PriceBreakdown).costs!.vinyl.map((v, i) => (
                                    <li key={i}>
                                        {v.media}: {v.lm?.toFixed?.(2)} lm × £{v.pricePerLm?.toFixed?.(2)} = <b>£{v.cost?.toFixed?.(2)}</b>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    {(result as PriceBreakdown)?.costs?.substrate?.length ? (
                        <div>
                            <h3 className="font-semibold">Substrate</h3>
                            <ul className="list-disc ml-5">
                                {(result as PriceBreakdown).costs!.substrate.map((s, i) => (
                                    <li key={i}>
                                        {s.material} — {s.sheet}: need {s.neededSheets} → <b>{s.chargedSheets} full sheets</b> × £
                                        {s.pricePerSheet?.toFixed?.(2)} = <b>£{s.cost?.toFixed?.(2)}</b>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}

                    <div><b>Materials Cost:</b> £{(result as PriceBreakdown).materials.toFixed(2)}</div>
                    <div><b>Sell Cost (pre-delivery):</b> £{(result as PriceBreakdown).preDelivery.toFixed(2)}</div>
                    <div><b>Delivery:</b> £{(result as PriceBreakdown).delivery.toFixed(2)}</div>
                    <div className="mt-2 text-2xl font-extrabold">
                        Total (Sell Price): £{(result as PriceBreakdown).total.toFixed(2)}
                    </div>

                    {!!(result as PriceBreakdown).notes?.length && (
                        <div className="mt-3">
                            <h3 className="font-semibold">Notes</h3>
                            <ul className="list-disc ml-5">
                                {(result as PriceBreakdown).notes!.map((n, i) => <li key={i}>{n}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </Card>
    )
}
