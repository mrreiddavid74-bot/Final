
import { NextRequest, NextResponse } from 'next/server'
import { getVinylMedia, setVinylMedia, VinylRow } from '@/lib/settingsStore'

function toCSV(rows: VinylRow[]) {
  const header = ['name','rollWidthMm','rollPrintableWidthMm','pricePerLm','maxPrintWidthMm','maxCutWidthMm','category']
  const lines = rows.map(r => header.map(h => (r as any)[h] ?? '').join(','))
  return header.join(',') + '\n' + lines.join('\n') + '\n'
}

function parseCSV(text: string): VinylRow[] {
  const [h, ...rows] = text.trim().split(/\r?\n/)
  const cols = h.split(',').map(s => s.trim())
  return rows.filter(Boolean).map(line => {
    const parts = line.split(',')
    const obj: any = {}
    cols.forEach((c, i) => obj[c] = parts[i])
    return {
      name: String(obj.name),
      rollWidthMm: Number(obj.rollWidthMm),
      rollPrintableWidthMm: Number(obj.rollPrintableWidthMm || obj.rollWidthMm),
      pricePerLm: Number(obj.pricePerLm),
      maxPrintWidthMm: obj.maxPrintWidthMm ? Number(obj.maxPrintWidthMm) : undefined,
      maxCutWidthMm: obj.maxCutWidthMm ? Number(obj.maxCutWidthMm) : undefined,
      category: obj.category || undefined
    }
  })
}

export async function GET() {
  return new NextResponse(toCSV(getVinylMedia()), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="vinyl_media.csv"' }
  })
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const rows = parseCSV(text)
  setVinylMedia(rows)
  return NextResponse.json({ ok: true, count: rows.length })
}
