import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_MEDIA } from '@/lib/defaults'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

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

let VINYL_OVERRIDE: VinylRow[] | null = null // in-memory override for instant effect

const LIB_PRELOADED = path.resolve(process.cwd(), 'lib/preloaded/vinyl.json')
const num = (v: any) => (v === '' || v == null ? undefined : Number(v))

function coerceRows(rows: VinylRow[]): VinylRow[] {
  return (rows || [])
      .map((r, i) => {
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
      })
      .filter(r => typeof r.rollWidthMm === 'number' && typeof r.rollPrintableWidthMm === 'number')
}

async function readJsonFile<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T } catch { return null }
}

async function readPublicJson<T>(req: NextRequest, rel: string): Promise<T | null> {
  try {
    const res = await fetch(new URL(rel, req.nextUrl.origin), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

function parseCsv(text: string): VinylRow[] {
  // minimal CSV parser — expects a header; no quoted-comma handling
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const headers = lines.shift()!.split(',').map(h => h.trim().toLowerCase())
  const idx = (h: string) => headers.findIndex(x => x === h)
  const iName = idx('name')
  const iRoll = idx('rollwidthmm')
  const iPrint = idx('rollprintablewidthmm')
  const iPrice = idx('priceperlm')
  const iMaxPrint = idx('maxprintwidthmm')
  const iMaxCut = idx('maxcutwidthmm')
  const iCat = idx('category')
  return lines.filter(Boolean).map((line) => {
    const c = line.split(',')
    return {
      name: iName >= 0 ? c[iName] : undefined,
      rollWidthMm: iRoll >= 0 ? c[iRoll] : undefined,
      rollPrintableWidthMm: iPrint >= 0 ? c[iPrint] : undefined,
      pricePerLm: iPrice >= 0 ? c[iPrice] : undefined,
      maxPrintWidthMm: iMaxPrint >= 0 ? c[iMaxPrint] : undefined,
      maxCutWidthMm: iMaxCut >= 0 ? c[iMaxCut] : undefined,
      category: iCat >= 0 ? c[iCat] : undefined,
      id: undefined,
    }
  })
}

async function persistJson(p: string, rows: any[]): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true })
    await fs.writeFile(p, JSON.stringify(rows, null, 2) + '\n', 'utf8')
    return true
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  let rows: VinylRow[] | null = null

  // 1) in-memory override wins (set by POST)
  if (VINYL_OVERRIDE) rows = VINYL_OVERRIDE

  // 2) lib/preloaded from disk
  if (!rows) rows = await readJsonFile<VinylRow[]>(LIB_PRELOADED)

  // 3) public/preloaded fallback
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    rows = await readPublicJson<VinylRow[]>(req, '/preloaded/vinyl.json')
  }

  // 4) defaults
  const result = coerceRows((rows && Array.isArray(rows) ? rows : (DEFAULT_MEDIA as any)) as VinylRow[])
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const ctype = req.headers.get('content-type') || ''
  const text = await req.text()

  let rows: VinylRow[] = []
  try {
    if (ctype.includes('application/json') || /^[\s\r\n]*[\[{]/.test(text)) {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array')
      rows = parsed as VinylRow[]
    } else {
      rows = parseCsv(text)
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Parse error: ${err?.message || String(err)}` }, { status: 400 })
  }

  // Set in-memory override for immediate effect
  VINYL_OVERRIDE = rows

  // Try to persist to lib/preloaded (works in dev/local; may fail on serverless)
  const persisted = await persistJson(LIB_PRELOADED, rows)

  const coerced = coerceRows(rows)
  return NextResponse.json({
    ok: true,
    count: coerced.length,
    persisted,
    path: persisted ? LIB_PRELOADED : undefined,
    note: persisted ? undefined : 'Could not write to disk (likely read-only in production). Data is active in memory for this server process.',
  })
}
