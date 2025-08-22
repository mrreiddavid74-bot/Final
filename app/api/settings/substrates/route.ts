import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_SUBSTRATES } from '@/lib/defaults'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SubstrateRow = {
  id?: string
  name?: string
  sizeW?: number | string
  sizeH?: number | string
  pricePerSheet?: number | string
  thicknessMm?: number | string
}

const LIB_PRELOADED = path.resolve(process.cwd(), 'lib/preloaded/substrates.json')

async function readJsonFile<T>(p: string): Promise<T | null> {
  try {
    const raw = await (await fs.readFile(p, 'utf8')).toString()
    return JSON.parse(raw) as T
  } catch { return null }
}

async function readPublicJson<T>(req: NextRequest, rel: string): Promise<T | null> {
  try {
    const res = await fetch(new URL(rel, req.nextUrl.origin), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

function coerceRows(rows: SubstrateRow[]): SubstrateRow[] {
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v))
  return (rows || []).map((r, i) => {
    const id = r.id || `${String(r.name ?? 'substrate').toLowerCase().replace(/\s+/g, '-')}-${i}`
    return {
      id,
      name: r.name ?? `Substrate ${i + 1}`,
      sizeW: num(r.sizeW),
      sizeH: num(r.sizeH),
      pricePerSheet: num(r.pricePerSheet),
      thicknessMm: num(r.thicknessMm),
    }
  }).filter(r => typeof r.sizeW === 'number' && typeof r.sizeH === 'number')
}

function asCSV(rows: SubstrateRow[]) {
  const header = ['id','name','sizeW','sizeH','pricePerSheet','thicknessMm']
  const lines = rows.map(r => header.map(h => (r as any)[h] ?? '').map(v => String(v).replace(/"/g,'"')).map(v => (v.includes(',')?`"${v}"`:v)).join(','))
  return header.join(',') + '\n' + lines.join('\n') + '\n'
}

export async function GET(req: NextRequest) {
  // 1) lib/preloaded
  let rows = await readJsonFile<SubstrateRow[]>(LIB_PRELOADED)
  // 2) public/preloaded
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    rows = await readPublicJson<SubstrateRow[]>(req, '/preloaded/substrates.json')
  }
  // 3) defaults
  const result = coerceRows((rows && Array.isArray(rows) ? rows : (DEFAULT_SUBSTRATES as any)) as SubstrateRow[])

  const wantsJson = req.nextUrl.searchParams.get('format') === 'json'
      || (req.headers.get('accept') || '').includes('application/json')

  if (wantsJson) return NextResponse.json(result)

  return new NextResponse(asCSV(result), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="substrates.csv"',
    },
  })
}

export async function POST() {
  return new NextResponse(JSON.stringify({ error: 'Uploads not enabled here' }), {
    status: 405, headers: { 'Content-Type': 'application/json' },
  })
}
