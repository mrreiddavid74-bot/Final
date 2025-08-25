import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_SETTINGS } from '@/lib/defaults'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const LIB_PRELOADED = path.resolve(process.cwd(), 'lib/preloaded/costs.json')

let COSTS_OVERRIDE: Record<string, any> | null = null

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
async function persistJson(p: string, obj: any): Promise<boolean> {
    try {
        await fs.mkdir(path.dirname(p), { recursive: true })
        await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8')
        return true
    } catch { return false }
}

// ---------- helpers ----------
function normalizeKey(k: string) {
    // remove BOM + NBSP, trim regular whitespace
    return k.replace(/\uFEFF/g, '').replace(/\u00a0/g, ' ').trim()
}
function coerceScalar(v: unknown) {
    if (typeof v !== 'string') return v
    const s = v.trim()
    if (s === '') return ''
    if (/^(true|false)$/i.test(s)) return /^true$/i.test(s)
    const n = Number(s)
    if (!Number.isNaN(n)) return n
    return s
}

function setPath(obj: Record<string, any>, dotPath: string, value: any) {
    const parts = normalizeKey(dotPath).split('.')
    let cur: any = obj
    for (let i = 0; i < parts.length; i++) {
        const raw = parts[i]
        const m = raw.match(/^(.+)\[(\d+)\]$/) // e.g., delivery.bands[0].maxGirthCm
        if (m) {
            const key = m[1]; const idx = Number(m[2])
            if (!Array.isArray(cur[key])) cur[key] = []
            if (!cur[key][idx]) cur[key][idx] = {}
            if (i === parts.length - 1) {
                cur[key][idx] = value
            } else {
                cur = cur[key][idx]
            }
        } else {
            if (i === parts.length - 1) {
                cur[raw] = value
            } else {
                if (typeof cur[raw] !== 'object' || cur[raw] == null) cur[raw] = {}
                cur = cur[raw]
            }
        }
    }
    return obj
}

function deepMerge<T extends Record<string, any>>(base: T, over: Record<string, any>): T {
    const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
    for (const [k, v] of Object.entries(over || {})) {
        if (Array.isArray(v)) out[k] = v
        else if (v && typeof v === 'object') out[k] = deepMerge(out[k] || {}, v as Record<string, any>)
        else out[k] = v
    }
    return out
}

function parseCostsCsv(textRaw: string): { obj: Record<string, any>, rows: number } {
    const text = textRaw.replace(/^\uFEFF/, '') // strip leading BOM once
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== '')
    if (!lines.length) return { obj: {}, rows: 0 }

    const header = lines[0].split(',').map(s => normalizeKey(s).toLowerCase())
    let start = 0
    let keyIdx = -1
    let valIdx = -1
    if (header.includes('key') && header.includes('value')) {
        keyIdx = header.indexOf('key')
        valIdx = header.indexOf('value')
        start = 1
    }

    const out: Record<string, any> = {}
    for (let i = start; i < lines.length; i++) {
        const rawCols = lines[i].split(',')
        const key = normalizeKey(keyIdx >= 0 ? (rawCols[keyIdx] ?? '') : (rawCols[0] ?? ''))
        const rawVal = (valIdx >= 0 ? rawCols[valIdx] : rawCols[1]) ?? ''
        if (!key) continue
        const val = coerceScalar(rawVal)
        setPath(out, key, val)
    }
    const rowsCount = Math.max(0, lines.length - start)
    return { obj: out, rows: rowsCount }
}

// *** FIXED TYPINGS HERE ***
function countLeafKeys(o: any): number {
    if (o == null || typeof o !== 'object') return 1
    if (Array.isArray(o)) {
        return (o as any[]).reduce((acc: number, v: any) => acc + countLeafKeys(v), 0)
    }
    const values: any[] = Object.values(o as Record<string, any>)
    return values.reduce((acc: number, v: any) => acc + countLeafKeys(v), 0)
}

export async function GET(req: NextRequest) {
    let loaded = COSTS_OVERRIDE
    if (!loaded) loaded = await readJsonFile<Record<string, any>>(LIB_PRELOADED)
    if (!loaded) loaded = await readPublicJson<Record<string, any>>(req, '/preloaded/costs.json')
    const merged = deepMerge(DEFAULT_SETTINGS as any, loaded || {})
    return NextResponse.json(merged, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
    const ctype = (req.headers.get('content-type') || '').toLowerCase()
    const text = await req.text()

    let incoming: Record<string, any> = {}
    let rows = 0

    try {
        if (ctype.includes('application/json') || /^[\s\r\n]*[{[]/.test(text)) {
            const parsed: unknown = JSON.parse(text)
            if (Array.isArray(parsed)) {
                rows = parsed.length
                for (const row of parsed as Array<any>) {
                    if (row && typeof row.key === 'string') setPath(incoming, row.key, coerceScalar(row.value))
                }
            } else if (parsed && typeof parsed === 'object') {
                rows = Object.keys(parsed as Record<string, any>).length
                incoming = parsed as Record<string, any>
            } else {
                throw new Error('JSON must be an object or an array of {key,value}')
            }
        } else {
            const r = parseCostsCsv(text)
            incoming = r.obj
            rows = r.rows
        }
    } catch (err: any) {
        return NextResponse.json({ error: `Parse error: ${err?.message || String(err)}` }, { status: 400 })
    }

    COSTS_OVERRIDE = incoming
    const persisted = await persistJson(LIB_PRELOADED, incoming)

    const topLevelKeys = Object.keys(incoming || {}).length
    const leafKeys = countLeafKeys(incoming)

    return NextResponse.json({
        ok: true,
        rows,                 // how many lines/items you uploaded
        topLevelKeys,         // how many top-level sections got values
        leafKeys,             // total individual values set (can be > rows)
        persisted,
        path: persisted ? LIB_PRELOADED : undefined,
        note: persisted ? undefined : 'Could not write to disk (likely read-only). Using in-memory override.',
    })
}
