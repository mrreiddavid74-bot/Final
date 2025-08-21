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
    const parts = line.split(',').map(s => s.trim())
    const obj: any = {}
    cols.forEach((c, i) => obj[c] = parts[i] ?? '')
    // coerce numbers
    ;['rollWidthMm','rollPrintableWidthMm','pricePerLm','maxPrintWidthMm','maxCutWidthMm'].forEach(k => {
      if (obj[k] !== '') obj[k] = Number(obj[k])
    })
    return obj as VinylRow
  })
}

export async function GET(req: NextRequest) {
  const wantsJson = req.nextUrl.searchParams.get('format') === 'json'
      || (req.headers.get('accept') || '').includes('application/json')

  if (wantsJson) return NextResponse.json(getVinylMedia())
  return new NextResponse(toCSV(getVinylMedia()), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="vinyl.csv"'
    }
  })
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const rows = parseCSV(text)
  setVinylMedia(rows)
  return NextResponse.json({ ok: true, count: rows.length })
}
