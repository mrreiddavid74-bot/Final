'use client'
import Card from '@/components/Card'
import type { CuttingStyle, PlotterCut } from '@/lib/types'

export default function VinylCutOptionsCard({
                                                show,
                                                plotterCut,
                                                backedWithWhite,
                                                cuttingStyle,
                                                applicationTape,
                                                onChange,
                                            }: {
    show: boolean
    plotterCut: PlotterCut
    backedWithWhite: boolean
    cuttingStyle: CuttingStyle
    applicationTape: boolean
    onChange: (patch: Partial<{
        plotterCut: PlotterCut
        backedWithWhite: boolean
        cuttingStyle: CuttingStyle
        applicationTape: boolean
    }>) => void
}) {
    if (!show) return null

    return (
        <Card>
            <h2 className="h2 mb-2">Vinyl Cut Options</h2>

            <label className="label">
                Plotter Cut Options
                <select
                    className="select"
                    value={plotterCut}
                    onChange={e => onChange({ plotterCut: e.target.value as PlotterCut })}
                >
                    <option value="None">None</option>
                    <option value="KissOnRoll">Kiss Cut On Roll</option>
                    <option value="KissOnSheets">Kiss Cut On Sheets</option>
                    <option value="CutIndividually">Cut Individually</option>
                    <option value="CutAndWeeded">Cut &amp; Weeded</option>
                </select>
            </label>

            <label className="label">
                Backed with White Vinyl?
                <select
                    className="select"
                    value={backedWithWhite ? 'yes' : 'no'}
                    onChange={e => onChange({ backedWithWhite: e.target.value === 'yes' })}
                >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                </select>
            </label>

            <label className="label">
                Cutting Type
                <select
                    className="select"
                    value={cuttingStyle}
                    onChange={e => onChange({ cuttingStyle: e.target.value as CuttingStyle })}
                >
                    <option value="Standard">Standard Cut</option>
                    <option value="Reverse">Reverse Cut</option>
                </select>
            </label>

            <label className="label">
                Application Tape?
                <select
                    className="select"
                    value={applicationTape ? 'yes' : 'no'}
                    onChange={e => onChange({ applicationTape: e.target.value === 'yes' })}
                >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                </select>
            </label>
        </Card>
    )
}
