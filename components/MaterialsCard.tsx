'use client'
import Card from '@/components/Card'
import type { Substrate, VinylMedia } from '@/lib/types'

type SubGroup = { key: string; displayName: string; variants: Substrate[] }

export default function MaterialsCard({
                                          loading,
                                          media,
                                          vinylId,
                                          onVinylChange,
                                          isVinylDisabled,
                                          isVinylProdOnly,
                                          isSubstrateProduct,
                                          // NEW:
                                          isPrintedProduct,
                                          doubleSided,
                                          onDoubleSidedChange,

                                          subGroups,
                                          subGroupKey,
                                          setSubGroupKey,
                                          substrateId,
                                          onSubstrateChange,
                                          fmtSize,
                                      }: {
    loading: boolean
    media: VinylMedia[]
    vinylId?: string
    onVinylChange: (id: string) => void
    isVinylDisabled: boolean
    isVinylProdOnly: boolean
    isSubstrateProduct: boolean

    // NEW props for “Printed Sides”
    isPrintedProduct: boolean
    doubleSided: boolean
    onDoubleSidedChange: (v: boolean) => void

    subGroups: SubGroup[]
    subGroupKey: string | null
    setSubGroupKey: (k: string) => void
    substrateId?: string
    onSubstrateChange: (id: string) => void
    fmtSize: (w?: number, h?: number) => string
}) {
    return (
        <Card>
            <h2 className="h2 mb-2">Materials</h2>

            <div className="flex flex-col gap-3">
                <label className={`label ${isVinylDisabled ? 'opacity-50' : ''}`}>
                    Vinyl / Media
                    <select
                        className="select mt-1"
                        value={vinylId ?? ''}
                        disabled={isVinylDisabled || loading || !media.length}
                        onChange={e => onVinylChange(e.target.value)}
                    >
                        {!media.length ? (
                            <option value="">Loading…</option>
                        ) : (
                            media.map(v => <option key={v.id} value={v.id}>{v.name}</option>)
                        )}
                    </select>
                </label>

                {/* NEW: Printed Sides (only for printed products) */}
                <label className={`label ${!isPrintedProduct ? 'opacity-50' : ''}`}>
                    Printed Sides
                    <select
                        className="select mt-1"
                        value={doubleSided ? 'double' : 'single'}
                        disabled={!isPrintedProduct}
                        onChange={e => onDoubleSidedChange(e.target.value === 'double')}
                    >
                        <option value="single">Single Sided</option>
                        <option value="double">Double Sided</option>
                    </select>
                </label>

                <label className={`label ${isVinylProdOnly ? 'opacity-50' : ''}`}>
                    Substrate
                    <select
                        className="select mt-1"
                        value={subGroupKey ?? ''}
                        disabled={!isSubstrateProduct || loading || !subGroups.length}
                        onChange={e => {
                            const k = e.target.value
                            setSubGroupKey(k)
                            const g = subGroups.find(x => x.key === k)
                            if (g?.variants?.length) onSubstrateChange(g.variants[0].id)
                        }}
                    >
                        {!subGroups.length ? (
                            <option value="">Loading…</option>
                        ) : (
                            subGroups.map(g => <option key={g.key} value={g.key}>{g.displayName}</option>)
                        )}
                    </select>
                </label>

                <label className={`label ${isSubstrateProduct ? '' : 'opacity-50'}`}>
                    Substrate Size
                    <select
                        className="select mt-1"
                        value={substrateId ?? ''}
                        disabled={!isSubstrateProduct || loading || !subGroupKey}
                        onChange={e => onSubstrateChange(e.target.value)}
                    >
                        {!subGroupKey ? (
                            <option value="">Loading…</option>
                        ) : (
                            (subGroups.find(g => g.key === subGroupKey)?.variants || []).map(v => (
                                <option key={v.id} value={v.id}>{fmtSize(v.sizeW, v.sizeH)}</option>
                            ))
                        )}
                    </select>
                </label>
            </div>
        </Card>
    )
}
