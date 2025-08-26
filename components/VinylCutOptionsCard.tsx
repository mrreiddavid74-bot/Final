'use client'
import Card from '@/components/Card'

export default function VinylCutOptionsCard({
                                                show,
                                                plotterCut,
                                                backedWithWhite,
                                                cuttingStyle,
                                                applicationTape,
                                                hemEyelets,
                                                showHemEyelets,          // <- NEW
                                                onChange,
                                            }: {
    show: boolean
    plotterCut: 'None' | 'KissOnRoll' | 'KissOnSheets' | 'CutIndividually' | 'CutAndWeeded'
    backedWithWhite: boolean
    cuttingStyle: 'Standard' | 'Intricate'
    applicationTape: boolean
    hemEyelets?: boolean
    showHemEyelets?: boolean
    onChange: (patch: Partial<{
        plotterCut: 'None' | 'KissOnRoll' | 'KissOnSheets' | 'CutIndividually' | 'CutAndWeeded'
        backedWithWhite: boolean
        cuttingStyle: 'Standard' | 'Intricate'
        applicationTape: boolean
        hemEyelets: boolean
    }>) => void
}) {
    if (!show) return <div className="hidden lg:block" />

    return (
        <Card>
            <h2 className="h2 mb-2">Vinyl Cut Options</h2>

            <label className="label">
                Plotter Cut Options
                <select
                    className="select"
                    value={plotterCut}
                    onChange={e => onChange({ plotterCut: e.target.value as any })}
                >
                    <option value="None">None</option>
                    <option value="KissOnRoll">Kiss Cut On Roll</option>
                    <option value="KissOnSheets">Kiss Cut On Sheets</option>
                    <option value="CutIndividually">Cut Individually</option>
                    <option value="CutAndWeeded">Cut &amp; Weeded</option>
                </select>
            </label>

            <label className="label">
                Cutting Style
                <select
                    className="select"
                    value={cuttingStyle}
                    onChange={e => onChange({ cuttingStyle: e.target.value as any })}
                >
                    <option value="Standard">Standard</option>
                    <option value="Intricate">Intricate</option>
                </select>
            </label>

            <label className="label">
                Backed with White Vinyl?
                <select
                    className="select"
                    value={backedWithWhite ? 'Yes' : 'No'}
                    onChange={e => onChange({ backedWithWhite: e.target.value === 'Yes' })}
                >
                    <option>No</option>
                    <option>Yes</option>
                </select>
            </label>

            <label className="label">
                Application Tape?
                <select
                    className="select"
                    value={applicationTape ? 'Yes' : 'No'}
                    onChange={e => onChange({ applicationTape: e.target.value === 'Yes' })}
                >
                    <option>No</option>
                    <option>Yes</option>
                </select>
            </label>

            {/* ✅ Only for Print & Cut Vinyl */}
            {showHemEyelets ? (
                <label className="label">
                    Hem/Eyelets
                    <select
                        className="select"
                        value={hemEyelets ? 'Yes' : 'No'}
                        onChange={e => onChange({ hemEyelets: e.target.value === 'Yes' })}
                    >
                        <option>No</option>
                        <option>Yes</option>
                    </select>
                </label>
            ) : null}
        </Card>
    )
}
