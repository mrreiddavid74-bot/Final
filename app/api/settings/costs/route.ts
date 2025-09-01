import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const RUNTIME_DIR = '/tmp/settings'
const RUNTIME_FILE = path.join(RUNTIME_DIR, 'costs.json')
const BUNDLED_FILE = path.join(process.cwd(), 'public', 'settings', 'costs.json')

const CACHE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    'Surrogate-Control': 'no-store',
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

export async function GET() {
    try {
        const buf = await fs.readFile(RUNTIME_FILE, 'utf8')
        return NextResponse.json(JSON.parse(buf), { headers: CACHE_HEADERS })
    } catch {}
    try {
        const buf = await fs.readFile(BUNDLED_FILE, 'utf8')
        return NextResponse.json(JSON.parse(buf), { headers: CACHE_HEADERS })
    } catch {
        return NextResponse.json({}, { status: 200, headers: CACHE_HEADERS })
    }
}

export async function POST(req: NextRequest) {
    try {
        const ctype = req.headers.get('content-type') || ''
        const body = await req.text()
        let obj: Record<string, unknown> = {}

        if (ctype.includes('application/json')) {
            const parsed = JSON.parse(body)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                for (const [k, v] of Object.entries(parsed)) {
                    const kk = sanitizeKey(k)
                    if (!kk) continue
                    obj[kk] = v
                }
            } else {
                return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400, headers: CACHE_HEADERS })
            }
        } else {
            obj = parseCsvKV(body)
        }

        await fs.mkdir(RUNTIME_DIR, { recursive: true })
        await fs.writeFile(RUNTIME_FILE, JSON.stringify(obj, null, 2), 'utf8')

        return NextResponse.json({ ok: true, count: Object.keys(obj).length }, { headers: CACHE_HEADERS })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500, headers: CACHE_HEADERS })
    }
}
