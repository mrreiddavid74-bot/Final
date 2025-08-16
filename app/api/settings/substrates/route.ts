
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
    const parts = line.split(',')
    const obj: any = {}
    cols.forEach((c, i) => obj[c] = parts[i])
    return {
      name: String(obj.name),
      sizeW: Number(obj.sizeW),
      sizeH: Number(obj.sizeH),
      pricePerSheet: Number(obj.pricePerSheet),
      thicknessMm: obj.thicknessMm ? Number(obj.thicknessMm) : undefined,
    }
  })
}

export async function GET() {
  return new NextResponse(toCSV(getSubstrates()), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="substrates.csv"' }
  })
}

export async function POST(req: NextRequest) {
  const text = await req.text()
  const rows = parseCSV(text)
  setSubstrates(rows)
  return NextResponse.json({ ok: true, count: rows.length })
}
