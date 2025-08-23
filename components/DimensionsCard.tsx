'use client'
import Card from '@/components/Card'

export default function DimensionsCard({
                                           widthMm, heightMm, qty,
                                           onChange,
                                       }: {
    widthMm: number
    heightMm: number
    qty: number
    onChange: (patch: Partial<{ widthMm: number; heightMm: number; qty: number }>) => void
}) {
    return (
        <Card>
            <h2 className="h2 mb-2">Dimensions</h2>
            <label className="label">
                Width (mm)
                <input className="input" type="number" min={1} value={widthMm}
                       onChange={e => onChange({ widthMm: +e.target.value || 0 })}/>
            </label>
            <label className="label">
                Height (mm)
                <input className="input" type="number" min={1} value={heightMm}
                       onChange={e => onChange({ heightMm: +e.target.value || 0 })}/>
            </label>
            <label className="label">
                Quantity
                <input className="input" type="number" min={1} value={qty}
                       onChange={e => onChange({ qty: Math.max(1, +e.target.value || 1) })}/>
            </label>
        </Card>
    )
}
