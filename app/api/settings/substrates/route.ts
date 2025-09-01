import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { put, list } from '@vercel/blob'
import { DEFAULT_SUBSTRATES } from '@/lib/defaults'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

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
const BLOB_KEY = 'preloaded/substrates.json'

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
      allowOverwrite: true,
    })
    return url
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  // 1) in-memory override (fastest)
  if (SUBSTRATE_OVERRIDE && Array.isArray(SUBSTRATE_OVERRIDE)) {
    return json(coerceRows(SUBSTRATE_OVERRIDE))
  }

  // 2) Blob (shared, stable)
  const fromBlob = await readBlobJson<SubstrateRow[]>(BLOB_KEY)
  if (fromBlob && Array.isArray(fromBlob) && fromBlob.length) {
    return json(coerceRows(fromBlob))
  }

  // 3) lib/preloaded on disk
  const local = await readJsonFile<SubstrateRow[]>(LIB_PRELOADED)
  if (local && Array.isArray(local) && local.length) {
    return json(coerceRows(local))
  }

  // 4) public static fallback
  const pub = await readPublicJson<SubstrateRow[]>(req, '/preloaded/substrates.json')
  if (pub && Array.isArray(pub) && pub.length) {
    return json(coerceRows(pub))
  }

  // 5) defaults
  return json(coerceRows(DEFAULT_SUBSTRATES as any))
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
    return json({ error: `Parse error: ${err?.message || String(err)}` }, 400)
  }

  // 1) in-memory for instant effect
  SUBSTRATE_OVERRIDE = rows

  // 2) persist to lib/preloaded (best effort)
  try {
    await mkdir(path.dirname(LIB_PRELOADED), { recursive: true })
    await writeFile(LIB_PRELOADED, JSON.stringify(rows, null, 2) + '\n', 'utf8')
  } catch {}

  // 3) write to Blob (stable across instances)
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
