'use client'
import Card from '@/components/Card'
import type { Orientation } from '@/lib/types'

const MAX_SPLITS = 6

export default function VinylSplitOptionsCard({
                                                  hasVinyl,
                                                  vinylAutoMode, setVinylAutoMode,
                                                  vinylSplitOverride, setVinylSplitOverride,
                                                  vinylOrientation, setVinylOrientation,
                                                  previewText, previewLmText,
                                              }: {
    hasVinyl: boolean
    vinylAutoMode: 'auto' | 'custom'
    setVinylAutoMode: (v: 'auto' | 'custom') => void
    vinylSplitOverride: number
    setVinylSplitOverride: (n: number) => void
    vinylOrientation: Orientation
    setVinylOrientation: (o: Orientation) => void
    previewText: string
    previewLmText: string
}) {
    return (
        <Card>
            <h2 className="h2 mb-2">Vinyl Split Options</h2>

            <label className="label">
                Auto rotate to avoid tiling
                <select className="select" value={vinylAutoMode} disabled={!hasVinyl}
                        onChange={e => {
                            const v = e.target.value as 'auto' | 'custom'
                            setVinylAutoMode(v)
                            if (v === 'auto') setVinylSplitOverride(0)
                        }}>
                    <option value="auto">Yes (Auto Tile)</option>
                    <option value="custom">No (Custom Tile)</option>
                </select>
            </label>

            <label className={`label ${vinylAutoMode === 'auto' ? 'opacity-50' : ''}`}>
                Vinyl Split Override
                <select className="select" value={vinylSplitOverride}
                        disabled={vinylAutoMode === 'auto'}
                        onChange={e => setVinylSplitOverride(+e.target.value)}>
                    <option value={0}>None</option>
                    {Array.from({ length: MAX_SPLITS - 1 }, (_, i) => i + 2).map(n => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
            </label>

            <label className={`label ${vinylAutoMode === 'auto' || vinylSplitOverride === 0 ? 'opacity-50' : ''}`}>
                Vinyl Split Orientation
                <select className="select" value={vinylOrientation}
                        onChange={e => setVinylOrientation(e.target.value as Orientation)}
                        disabled={vinylAutoMode === 'auto' || vinylSplitOverride === 0}>
                    <option>Vertical</option>
                    <option>Horizontal</option>
                </select>
            </label>

            <div className="mt-2 p-2 rounded bg-slate-50 border">
                <div className="font-semibold">Split size result:</div>
                <div>{previewText}</div>
                <div className="mt-2 font-semibold">Total Vinyl Length:</div>
                <div>{previewLmText}</div>
            </div>
        </Card>
    )
}
