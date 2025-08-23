'use client'
import Card from '@/components/Card'
import type { Mode } from '@/lib/types'

export default function ProductCard({
                                        modes,
                                        mode,
                                        onChange,
                                    }: {
    modes: { id: Mode; label: string }[]
    mode: Mode
    onChange: (m: Mode) => void
}) {
    return (
        <Card>
            <h2 className="h2 mb-2">Product</h2>
            <select className="select" value={mode} onChange={e => onChange(e.target.value as Mode)}>
                {modes.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                ))}
            </select>
        </Card>
    )
}
