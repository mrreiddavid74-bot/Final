// components/DimensionsCard.tsx
'use client'

import Card from '@/components/Card'
import { useId } from 'react'
import type { DeliveryMode } from '@/lib/types'

export default function DimensionsCard({
                                           widthMm,
                                           heightMm,
                                           qty,
                                           deliveryMode = 'Boxed',
                                           onChange,
                                       }: {
    widthMm: number
    heightMm: number
    qty: number
    deliveryMode?: DeliveryMode
    onChange: (patch: Partial<{ widthMm: number; heightMm: number; qty: number; deliveryMode: DeliveryMode }>) => void
}) {
    const id = useId()
    return (
        <Card>
            <h2 className="h2 mb-2">Dimensions</h2>

            <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Width (mm)</span>
                    <input
                        className="input"
                        type="number"
                        min={1}
                        value={widthMm ?? 0}
                        onChange={(e) => onChange({ widthMm: +e.target.value || 0 })}
                    />
                </label>

                <label className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Height (mm)</span>
                    <input
                        className="input"
                        type="number"
                        min={1}
                        value={heightMm ?? 0}
                        onChange={(e) => onChange({ heightMm: +e.target.value || 0 })}
                    />
                </label>

                <label className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Quantity</span>
                    <input
                        className="input"
                        type="number"
                        min={1}
                        value={qty ?? 1}
                        onChange={(e) => onChange({ qty: Math.max(1, +e.target.value || 1) })}
                    />
                </label>

                {/* Delivery selector */}
                <label className="flex flex-col">
                    <span className="text-sm text-muted-foreground">Delivery</span>
                    <select
                        id={`${id}-delivery`}
                        className="input"
                        value={deliveryMode}
                        onChange={(e) => onChange({ deliveryMode: e.target.value as DeliveryMode })}
                    >
                        <option value="Boxed">Boxed</option>
                        <option value="OnRoll">On a Roll</option>
                    </select>
                </label>
            </div>
        </Card>
    )
}
