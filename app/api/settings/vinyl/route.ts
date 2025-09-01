import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { put, list } from '@vercel/blob'
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

let VINYL_OVERRIDE: VinylRow[] | null = null

const LIB_PRELOADED = path.resolve(process.cwd(), 'lib/preloaded/vinyl.json')
const BLOB_KEY = 'preloaded/vinyl.json'

const num = (v: any) => (v === '' || v == null ? undefined : Number(v))

function json(res: unknown, status = 200) {
  return new NextResponse(JSON.stringify(res), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

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
  try { return JSON.parse(await readFile(p, 'utf8')) as T } catch { return null }
}

async function readPublicJson<T>(req: NextRequest, rel: string): Promise<T | null> {
  try {
    const res = await fetch(new URL(rel, req.nextUrl.origin), { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

async function readBlobJson<T>(key: string): Promise<T | null> {
  try {
    const { blobs } = await list({ prefix: key })
    const entry = blobs.find(b => b.pathname === key)
    if (!entry) return null
    const res = await fetch(entry.url, { cache: 'no-store' })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch { return null }
}

async function writeBlobJson(key: string, obj: unknown): Promise<string | null> {
  try {
    const { url } = await put(key, JSON.stringify(obj, null, 2), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    })
    return url
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  // 1) in-memory override
  if (VINYL_OVERRIDE && Array.isArray(VINYL_OVERRIDE)) {
    return json(coerceRows(VINYL_OVERRIDE))
  }

  // 2) Blob
  const fromBlob = await readBlobJson<VinylRow[]>(BLOB_KEY)
  if (fromBlob && Array.isArray(fromBlob) && fromBlob.length) {
    return json(coerceRows(fromBlob))
  }

  // 3) lib/preloaded on disk
  const local = await readJsonFile<VinylRow[]>(LIB_PRELOADED)
  if (local && Array.isArray(local) && local.length) {
    return json(coerceRows(local))
  }

  // 4) public static fallback
  const pub = await readPublicJson<VinylRow[]>(req, '/preloaded/vinyl.json')
  if (pub && Array.isArray(pub) && pub.length) {
    return json(coerceRows(pub))
  }

  // 5) defaults
  return json(coerceRows(DEFAULT_MEDIA as any))
}

function parseCsv(text: string): VinylRow[] {
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
    return json({ error: `Parse error: ${err?.message || String(err)}` }, 400)
  }

  // 1) in-memory for instant use
  VINYL_OVERRIDE = rows

  // 2) persist to lib/preloaded (best effort)
  try {
    await mkdir(path.dirname(LIB_PRELOADED), { recursive: true })
    await writeFile(LIB_PRELOADED, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  } catch {}

  // 3) write to Blob
  const blobUrl = await writeBlobJson(BLOB_KEY, rows)

  const coerced = coerceRows(rows)
  return json({
    ok: true,
    count: coerced.length,
    persisted: Boolean(blobUrl),
    blobUrl,
    path: LIB_PRELOADED,
    note: blobUrl ? undefined : 'Blob write failed; data active in-memory only for this process.',
  })
}
