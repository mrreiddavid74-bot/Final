import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_SUBSTRATES } from '@/lib/defaults'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  'Surrogate-Control': 'no-store',
}

type SubstrateRow = {
  id?: string
  name?: string
  sizeW?: number | string
  sizeH?: number | string
  pricePerSheet?: number | string
  thicknessMm?: number | string
}

let SUBSTRATE_OVERRIDE: SubstrateRow[] | null = null

const LIB_PRELOADED = path.resolve(process.cwd(), 'lib/preloaded/substrates.json')
const num = (v: any) => (v === '' || v == null ? undefined : Number(v))

function coerceRows(rows: SubstrateRow[]): SubstrateRow[] {
  return (rows || [])
      .map((r, i) => {
        const id = r.id || `${String(r.name ?? 'substrate').toLowerCase().replace(/\s+/g, '-')}-${i}`
        return {
          id,
          name: r.name ?? `Substrate ${i + 1}`,
          sizeW: num(r.sizeW),
          sizeH: num(r.sizeH),
          pricePerSheet: num(r.pricePerSheet),
          thicknessMm: num(r.thicknessMm),
        }
      })
      .filter(r => typeof r.sizeW === 'number' && typeof r.sizeH === 'number')
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

function parseCsv(text: string): SubstrateRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const headers = lines.shift()!.split(',').map(h => h.trim().toLowerCase())
  const idx = (h: string) => headers.findIndex(x => x === h)
  const iName = idx('name')
  const iW = idx('sizew')
  const iH = idx('sizeh')
  const iPrice = idx('pricepersheet')
  const iThk = idx('thicknessmm')
  return lines.filter(Boolean).map(line => {
    const c = line.split(',')
    return {
      name: iName >= 0 ? c[iName] : undefined,
      sizeW: iW >= 0 ? c[iW] : undefined,
      sizeH: iH >= 0 ? c[iH] : undefined,
      pricePerSheet: iPrice >= 0 ? c[iPrice] : undefined,
      thicknessMm: iThk >= 0 ? c[iThk] : undefined,
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
  let rows: SubstrateRow[] | null = null

  if (SUBSTRATE_OVERRIDE) rows = SUBSTRATE_OVERRIDE
  if (!rows) rows = await readJsonFile<SubstrateRow[]>(LIB_PRELOADED)
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    rows = await readPublicJson<SubstrateRow[]>(req, '/preloaded/substrates.json')
  }

  const result = coerceRows((rows && Array.isArray(rows) ? rows : (DEFAULT_SUBSTRATES as any)) as SubstrateRow[])
  return NextResponse.json(result, { headers: CACHE_HEADERS })
}

export async function POST(req: NextRequest) {
  const ctype = req.headers.get('content-type') || ''
  const text = await req.text()

  let rows: SubstrateRow[] = []
  try {
    if (ctype.includes('application/json') || /^[\s\r\n]*[\[{]/.test(text)) {
      const parsed = JSON.parse(text)
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array')
      rows = parsed as SubstrateRow[]
    } else {
      rows = parseCsv(text)
    }
  } catch (err: any) {
    return NextResponse.json({ error: `Parse error: ${err?.message || String(err)}` }, { status: 400, headers: CACHE_HEADERS })
  }

  SUBSTRATE_OVERRIDE = rows
  const persisted = await persistJson(LIB_PRELOADED, rows)

  const coerced = coerceRows(rows)
  return NextResponse.json({
    ok: true,
    count: coerced.length,
    persisted,
    path: persisted ? LIB_PRELOADED : undefined,
    note: persisted ? undefined : 'Could not write to disk (likely read-only in production). Data is active in memory for this server process.',
  }, { headers: CACHE_HEADERS })
}
