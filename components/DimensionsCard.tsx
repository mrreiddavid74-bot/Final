// components/DimensionsCard.tsx
'use client'

import Card from '@/components/Card'
import type { DeliveryMode, SingleSignInput } from '@/lib/types'

export default function DimensionsCard(props: {
    widthMm: number
    heightMm: number
    qty: number
    deliveryMode?: DeliveryMode
    onChange: (patch: Partial<SingleSignInput>) => void
}) {
    const { widthMm, heightMm, qty, deliveryMode = 'Boxed', onChange } = props

    return (
        <Card>
            <h2 className="h2 mb-2">Dimensions</h2>

            <div className="space-y-3">
                <label className="block">
                    <div className="label">Width (mm)</div>
                    <input
                        type="number"
                        className="input"
                        value={widthMm ?? 0}
                        onChange={(e) => onChange({ widthMm: Number(e.target.value || 0) })}
                        min={0}
                    />
                </label>

                <label className="block">
                    <div className="label">Height (mm)</div>
                    <input
                        type="number"
                        className="input"
                        value={heightMm ?? 0}
                        onChange={(e) => onChange({ heightMm: Number(e.target.value || 0) })}
                        min={0}
                    />
                </label>

                <label className="block">
                    <div className="label">Quantity</div>
                    <input
                        type="number"
                        className="input"
                        value={qty ?? 1}
                        onChange={(e) => onChange({ qty: Math.max(1, Number(e.target.value || 1)) })}
                        min={1}
                    />
                </label>

                {/* NEW: Delivery option */}
                <label className="block">
                    <div className="label">Delivery</div>
                    <select
                        className="select w-full"
                        value={deliveryMode}
                        onChange={(e) =>
                            onChange({ deliveryMode: (e.target.value as DeliveryMode) })
                        }
                    >
                        <option value="Boxed">Boxed</option>
                        <option value="OnARoll">On a Roll</option>
                    </select>
                </label>
            </div>
        </Card>
    )
}
