import { NextRequest, NextResponse } from 'next/server'
import { getSubstrates, setSubstrates, SubstrateRow } from '@/lib/settingsStore'

function toCSV(rows: SubstrateRow[]) {
  const header = ['name','sizeW','sizeH','pricePerSheet','thicknessMm']
  const lines = rows.map(r => header.map(h => (r as any)[h] ?? '').join(','))
  return header.join(',') + '\n' + lines.join('\n') + '\n'
}

function parseCSV(text: string): SubstrateRow[] {
  const [h, ...rows] = text.trim().split(/\r?\n/)
  const cols = h.split(',').map(s => s.trim())
  return rows.filter(Boolean).map(line => {
    const parts = line.split(',').map(s => s.trim())
    const obj: any = {}
    cols.forEach((c, i) => obj[c] = parts[i] ?? '')
    ;['sizeW','sizeH','pricePerSheet','thicknessMm'].forEach(k => {
      if (obj[k] !== '') obj[k] = Number(obj[k])
    })
    return obj as SubstrateRow
  })
}

export async function GET(req: NextRequest) {
  const wantsJson = req.nextUrl.searchParams.get('format') === 'json'
      || (req.headers.get('accept') || '').includes('application/json')

  if (wantsJson) return NextResponse.json(getSubstrates())
  return new NextResponse(toCSV(getSubstrates()), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="substrates.csv"'
    }
  })
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const rows = parseCSV(text)
  setSubstrates(rows)
  return NextResponse.json({ ok: true, count: rows.length })
}
