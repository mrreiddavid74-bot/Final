import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_MEDIA } from '@/lib/defaults'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type VinylRow = {
  id?: string
  name?: string
  rollWidthMm?: number | string
  rollPrintableWidthMm?: number | string
  pricePerLm?: number | string
  maxPrintWidthMm?: number | string
  maxCutWidthMm?: number | string
  category?: string
}

const LIB_PRELOADED = path.resolve(process.cwd(), 'lib/preloaded/vinyl.json')

async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, 'utf8')
    const data = JSON.parse(raw)
    return data as T
  } catch { return null }
}

async function readPublicJson<T>(req: NextRequest, rel: string): Promise<T | null> {
  try {
    const res = await fetch(new URL(rel, req.nextUrl.origin), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

function coerceRows(rows: VinylRow[]): VinylRow[] {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v))
  return (rows || []).map((r, i) => {
    const id = r.id || `${String(r.name ?? 'vinyl').toLowerCase().replace(/\s+/g, '-')}-${i}`
    return {
      id,
      name: r.name ?? `Vinyl ${i + 1}`,
      rollWidthMm: num(r.rollWidthMm),
      rollPrintableWidthMm: num(r.rollPrintableWidthMm) ?? num(r.rollWidthMm),
      pricePerLm: num(r.pricePerLm),
      maxPrintWidthMm: num(r.maxPrintWidthMm),
      maxCutWidthMm: num(r.maxCutWidthMm),
      category: r.category,
    }
  }).filter(r => typeof r.rollWidthMm === 'number' && typeof r.rollPrintableWidthMm === 'number')
}

function asCSV(rows: VinylRow[]) {
  const header = ['id','name','rollWidthMm','rollPrintableWidthMm','pricePerLm','maxPrintWidthMm','maxCutWidthMm','category']
  const lines = rows.map(r => header.map(h => (r as any)[h] ?? '').map(v => String(v).replace(/"/g,'"')).map(v => v.includes(',')?`"${v}"`:v).join(','))
  return header.join(',') + '\n' + lines.join('\n') + '\n'
}

export async function GET(req: NextRequest) {
  // 1) lib/preloaded
  let rows = await readJsonFile<VinylRow[]>(LIB_PRELOADED)
  // 2) public/preloaded
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    rows = await readPublicJson<VinylRow[]>(req, '/preloaded/vinyl.json')
  }
  // 3) defaults
  const result = coerceRows((rows && Array.isArray(rows) ? rows : (DEFAULT_MEDIA as any)) as VinylRow[])

  const wantsJson = req.nextUrl.searchParams.get('format') === 'json'
      || (req.headers.get('accept') || '').includes('application/json')

  if (wantsJson) return NextResponse.json(result)

  return new NextResponse(asCSV(result), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="vinyl.csv"',
    },
  })
}

export async function POST() {
  return new NextResponse(JSON.stringify({ error: 'Uploads not enabled here' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}
