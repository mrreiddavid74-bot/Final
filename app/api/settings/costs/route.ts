import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { put, list } from '@vercel/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'Surrogate-Control': 'no-store',
}

const BLOB_KEY = 'settings/costs.json'
const RUNTIME_DIR = '/tmp/settings'
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'costs.json')
const BUNDLED_FILE = path.join(process.cwd(), 'public', 'settings', 'costs.json')

function sanitizeKey(k: unknown): string {
    return String(k ?? '').trim().replace(/^\uFEFF/, '')
}

function parseCsvKV(text: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const lines = text.split(/\r?\n/).filter(Boolean)
    if (!lines.length) return out
    const headerish = /key|name/i.test(lines[0]) && /value/i.test(lines[0])
    for (let i = headerish ? 1 : 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s*"?([^",]+)"?\s*,\s*"?(.+?)"?\s*$/)
        if (!m) continue
        const key = sanitizeKey(m[1])
        const raw = m[2].trim()
        const n = Number(raw.replace(/[£,\s]/g, ''))
        out[key] = Number.isFinite(n) ? n : raw
    }
    return out
}

async function readJsonFile<T>(p: string): Promise<T | null> {
    try { return JSON.parse(await fs.readFile(p, 'utf8')) as T } catch { return null }
}

async function readFromBlob<T>(): Promise<T | null> {
    try {
        const { blobs } = await list({ prefix: BLOB_KEY, limit: 1 })
        const hit = blobs.find(b => b.pathname === BLOB_KEY) ?? blobs[0]
        if (!hit?.url) return null
        const res = await fetch(hit.url, { cache: 'no-store' })
        if (!res.ok) return null
        return (await res.json()) as T
    } catch { return null }
}

async function writeToBlob(obj: unknown) {
    try {
        const out = await put(BLOB_KEY, JSON.stringify(obj), {
            access: 'public',
            contentType: 'application/json',
        })
        return { ok: true, url: out.url }
    } catch (e: any) {
        return { ok: false, error: e?.message || String(e) }
    }
}

export async function GET() {
    let data =
        (await readFromBlob<Record<string, unknown>>()) ||
        (await readJsonFile<Record<string, unknown>>(RUNTIME_FILE)) ||
        (await readJsonFile<Record<string, unknown>>(BUNDLED_FILE)) ||
        {}

    return NextResponse.json(data, { headers: CACHE_HEADERS })
}

export async function POST(req: NextRequest) {
    try {
        const ctype = req.headers.get('content-type') || ''
        const body = await req.text()
        let obj: Record<string, unknown> = {}

        if (ctype.includes('application/json') || /^[\s\r\n]*\{/.test(body)) {
            const parsed = JSON.parse(body)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
            }
            for (const [k, v] of Object.entries(parsed)) {
                const kk = sanitizeKey(k)
                if (kk) obj[kk] = v
            }
        } else {
            obj = parseCsvKV(body)
        }

        // Persist to Blob (shared) + /tmp (local hot)
        const blob = await writeToBlob(obj)
        try {
            await fs.mkdir(RUNTIME_DIR, { recursive: true })
            await fs.writeFile(RUNTIME_FILE, JSON.stringify(obj, null, 2), 'utf8')
        } catch { /* ignore */ }

        return NextResponse.json(
            {
                ok: true,
                count: Object.keys(obj).length,
                blob: blob.ok ? { url: blob.url } : { error: blob.error },
                version: Date.now(),
            },
            { headers: CACHE_HEADERS },
        )
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500, headers: CACHE_HEADERS })
    }
}
