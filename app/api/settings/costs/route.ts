import { NextRequest, NextResponse } from 'next/server'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { put, list } from '@vercel/blob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

/** Runtime file (best-effort) */
const RUNTIME_DIR = '/tmp/settings'
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'costs.json')
/** Bundled, repo-tracked fallback */
const BUNDLED_FILE = path.join(process.cwd(), 'public', 'settings', 'costs.json')
/** Shared, cross-instance storage (stable in production) */
const BLOB_KEY = 'settings/costs.json'

/* ---------------- helpers ---------------- */

function json(res: unknown, status = 200) {
    return new NextResponse(JSON.stringify(res), {
        status,
        headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
        },
    })
}

function sanitizeKey(k: unknown): string {
    return String(k ?? '').trim().replace(/^\uFEFF/, '')
}

function parseCsvKV(text: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const lines = text.split(/\r?\n/)
    const firstLine = lines[0]?.trim()
    const hasHeader = firstLine && /key|name/i.test(firstLine) && /value/i.test(firstLine)

    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
        const raw = lines[i]
        if (!raw || !raw.trim()) continue
        const m = raw.match(/^\s*"?([^",]+)"?\s*,\s*"?(.+?)"?\s*$/)
        if (!m) continue
        const key = sanitizeKey(m[1])
        if (!key) continue
        const valStr = m[2].trim()
        const n = Number(valStr)
        out[key] = Number.isFinite(n) ? n : valStr
    }
    return out
}

async function readJsonFile<T>(p: string): Promise<T | null> {
    try { return JSON.parse(await readFile(p, 'utf8')) as T } catch { return null }
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
        const { url } = await put(key, JSON.stringify(obj), {
            access: 'public',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: process.env.BLOB_READ_WRITE_TOKEN, // optional; uses env if present
        })
        return url
    } catch {
        return null
    }
}

/* ---------------- handlers ---------------- */

export async function GET() {
    // 1) runtime file
    const runtime = await readJsonFile<Record<string, unknown>>(RUNTIME_FILE)
    if (runtime) return json(runtime)

    // 2) blob
    const blobObj = await readBlobJson<Record<string, unknown>>(BLOB_KEY)
    if (blobObj) return json(blobObj)

    // 3) bundled file
    const bundled = await readJsonFile<Record<string, unknown>>(BUNDLED_FILE)
    if (bundled) return json(bundled)

    // 4) empty
    return json({})
}

export async function POST(req: NextRequest) {
    try {
        const ctype = req.headers.get('content-type') || ''
        const body = await req.text()
        let obj: Record<string, unknown> = {}

        if (ctype.includes('application/json') || /^[\s\r\n]*\{/.test(body)) {
            const parsed = JSON.parse(body)
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
                return json({ error: 'Expected a JSON object' }, 400)
            }
            for (const [k, v] of Object.entries(parsed)) {
                const kk = sanitizeKey(k)
                if (!kk) continue
                obj[kk] = v
            }
        } else {
            obj = parseCsvKV(body)
        }

        // write runtime (best effort)
        try {
            await mkdir(RUNTIME_DIR, { recursive: true })
            await writeFile(RUNTIME_FILE, JSON.stringify(obj, null, 2), 'utf8')
        } catch {}

        // write blob (cross-instance)
        const blobUrl = await writeBlobJson(BLOB_KEY, obj)

        return json({ ok: true, count: Object.keys(obj).length, blobUrl })
    } catch (e: any) {
        return json({ error: e?.message || String(e) }, 500)
    }
}
