'use client'
import Card from '@/components/Card'
import type { Orientation, PriceBreakdown, Substrate } from '@/lib/types'

export default function SubstrateSplitsCard({
                                                isSubstrateProduct,
                                                currentSubVariant,
                                                panelSplits,
                                                panelOrientation,
                                                onSplitsChange,
                                                onOrientationChange,
                                                allowedSplitsForOrientation,
                                                splitPreviewText,
                                                result,
                                            }: {
    isSubstrateProduct: boolean
    currentSubVariant?: Substrate
    panelSplits: number
    panelOrientation: Orientation
    onSplitsChange: (n: number) => void
    onOrientationChange: (o: Orientation) => void
    allowedSplitsForOrientation: Record<Orientation, number[]>
    splitPreviewText: string
    result: PriceBreakdown | { error: string } | null
}) {
    const allowed = new Set(allowedSplitsForOrientation[panelOrientation ?? 'Vertical'])

    return (
        <Card>
            <h2 className="h2 mb-2">Substrate Splits</h2>

            <label className="label">
                Substrate Split Override
                <select className="select" value={panelSplits} disabled={!isSubstrateProduct || !currentSubVariant}
                        onChange={e => onSplitsChange(+e.target.value)}>
                    <option value={0} disabled={!allowed.has(0)}>None (1 piece)</option>
                    {[2,3,4,5,6].map(n => (
                        <option key={n} value={n} disabled={!allowed.has(n)}>{n}</option>
                    ))}
                </select>
            </label>

            <label className={`label ${panelSplits === 0 ? 'opacity-50' : ''}`}>
                Substrate Split Orientation
                <select className="select" value={panelOrientation}
                        onChange={e => onOrientationChange(e.target.value as Orientation)}
                        disabled={!isSubstrateProduct || !currentSubVariant || panelSplits === 0}>
                    <option>Vertical</option>
                    <option>Horizontal</option>
                </select>
            </label>

            <div className="mt-2 p-2 rounded bg-slate-50 border">
                <div className="font-semibold">Split Size Result:</div>
                <div>{splitPreviewText}</div>
                <div className="mt-2 font-semibold">Total Full Sheets Required:</div>
                <div>
                    {typeof (result as PriceBreakdown | null)?.sheetsUsed === 'number' && currentSubVariant
                        ? `${(result as PriceBreakdown).sheetsUsed} × Sheets of ${currentSubVariant.sizeW} x ${currentSubVariant.sizeH}mm`
                        : '—'}
                </div>
            </div>
        </Card>
    )
}
