
export type VinylRow = { id?: string; name: string; rollWidthMm: number; rollPrintableWidthMm: number; pricePerLm: number; maxPrintWidthMm?: number; maxCutWidthMm?: number; category?: string };
export type SubstrateRow = { id?: string; name: string; thicknessMm?: number; sizeW: number; sizeH: number; pricePerSheet: number };

let VINYL: VinylRow[] = [];
let SUBSTRATES: SubstrateRow[] = [];

export const setVinylMedia = (rows: VinylRow[]) => { VINYL = rows; };
export const getVinylMedia = () => VINYL;
export const setSubstrates = (rows: SubstrateRow[]) => { SUBSTRATES = rows; };
export const getSubstrates = () => SUBSTRATES;
