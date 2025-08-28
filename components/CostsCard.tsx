// components/CostsCard.tsx
'use client'

import Card from '@/components/Card'
import type { PriceBreakdown } from '@/lib/types'

export default function CostsCard({
                                      loading,
                                      ready,
                                      result,
                                  }: {
    loading: boolean
    ready: boolean
    result: PriceBreakdown | { error: string } | null
}) {
    const isError = !!(result && 'error' in (result as any))
    const r = (result as PriceBreakdown) || ({} as PriceBreakdown)

    const fmt = (n?: number) =>
        typeof n === 'number' && Number.isFinite(n) ? n.toFixed(2) : '0.00'

    const totalIncVat =
        typeof r.total === 'number' ? +(r.total * 1.2).toFixed(2) : undefined

    return (
        <Card>
            <h2 className="h2 mb-2">Costs</h2>
            {/* top splitter like the mock */}
            <hr className="border-t border-gray-300 mb-2" />

            {loading || !ready ? (
                <div className="opacity-70">Select materials to see pricing…</div>
            ) : isError ? (
                <div className="text-red-600">{String((result as any).error)}</div>
            ) : (
                <div className="space-y-2">
                    {/* Vinyl */}
                    {!!r?.costs?.vinyl?.length && (
                        <>
                            <div>
                                <h3 className="font-semibold text-sm mb-1">Vinyl</h3>
                                <div className="space-y-1.5 text-xs leading-snug">
                                    {r.costs!.vinyl!.map((v, i) => (
                                        <div key={i}>
                                            <div>{v.media}</div>
                                            <div>
                                                {v.lm?.toFixed?.(2)} lm × £{v.pricePerLm?.toFixed?.(2)} ={' '}
                                                <b>£{v.cost?.toFixed?.(2)}</b>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <hr className="border-t border-gray-300" />
                        </>
                    )}

                    {/* Substrate */}
                    {!!r?.costs?.substrate?.length && (
                        <>
                            <div>
                                <h3 className="font-semibold text-sm mb-1">Substrate</h3>
                                <div className="space-y-1.5 text-xs leading-snug">
                                    {r.costs!.substrate!.map((s, i) => (
                                        <div key={i}>
                                            <div>
                                                {s.material} — {s.sheet}: need {s.neededSheets}
                                            </div>
                                            <div>
                                                <b>{s.chargedSheets} full sheets</b> × £
                                                {s.pricePerSheet?.toFixed?.(2)} ={' '}
                                                <b>£{s.cost?.toFixed?.(2)}</b>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <hr className="border-t border-gray-300" />
                        </>
                    )}

                    {/* Totals (smaller) */}
                    <div className="text-[13px]">
                        <div>
                            <b>Materials Cost:</b> £{fmt(r.materials)}
                        </div>
                    </div>

                    <hr className="border-t border-gray-300" />

                    <div className="text-[13px]">
                        <div>
                            <b>Sell Cost (pre-delivery):</b> £{fmt(r.preDelivery)}
                        </div>
                    </div>

                    <hr className="border-t border-gray-300" />

                    <div className="text-[13px]">
                        <div>
                            <b>Delivery:</b> £{fmt(r.delivery)}
                        </div>
                    </div>

                    {/* Total box (slightly tighter padding) */}
                    <div className="rounded-md border border-gray-200 bg-gray-50 p-3">
                        <div className="text-xl font-extrabold">
                            Total (Sell Price): £{fmt(r.total)}
                        </div>
                        {typeof totalIncVat === 'number' && (
                            <div className="mt-1 text-[13px]">
                                Price including VAT: £{totalIncVat.toFixed(2)}
                            </div>
                        )}
                    </div>

                    {/* Notes (no splitter before; slightly tighter spacing) */}
                    {!!r?.notes?.length && (
                        <div>
                            <h3 className="font-semibold text-sm mb-1">Notes:</h3>
                            <ul className="list-disc ml-6 space-y-1 text-xs">
                                {r.notes!.map((n, i) => (
                                    <li key={i}>{n}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </Card>
    )
}
