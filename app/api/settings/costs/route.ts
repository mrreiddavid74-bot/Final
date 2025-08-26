// app/api/settings/costs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

const OUT_PATH = path.join(process.cwd(), 'public', 'settings', 'costs.json')

function sanitizeKey(k: unknown): string {
    return String(k ?? '').trim().replace(/^\uFEFF/, '') // trim + strip BOM
}

function parseCsvKV(text: string): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    const lines = text.split(/\r?\n/)

    // detect simple header like "Key,Value"
    const firstLine = lines[0]?.trim()
    const hasHeader = firstLine && /key|name/i.test(firstLine) && /value/i.test(firstLine)

    for (let i = hasHeader ? 1 : 0; i < lines.length; i++) {
        const raw = lines[i]
        if (!raw || !raw.trim()) continue
        // split on first comma only (allow commas in value)
        const m = raw.match(/^\s*"?([^",]+)"?\s*,\s*"?(.+?)"?\s*$/)
        if (!m) continue
        const key = sanitizeKey(m[1])
        if (!key) continue // <-- skip empty keys
        const valStr = m[2].trim()
        const n = Number(valStr)
        out[key] = Number.isFinite(n) ? n : valStr
    }
    return out
}

export async function POST(req: NextRequest) {
    try {
        const ctype = req.headers.get('content-type') || ''
        const body = await req.text()
        let obj: Record<string, unknown> = {}

        if (ctype.includes('application/json')) {
            const parsed = JSON.parse(body)
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                // sanitize keys
                for (const [k, v] of Object.entries(parsed)) {
                    const kk = sanitizeKey(k)
                    if (!kk) continue
                    obj[kk] = v
                }
            } else {
                return NextResponse.json({ error: 'Expected a JSON object' }, { status: 400 })
            }
        } else {
            // CSV
            obj = parseCsvKV(body)
        }

        // ensure folder
        await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
        await fs.writeFile(OUT_PATH, JSON.stringify(obj, null, 2), 'utf8')

        return NextResponse.json({ ok: true, count: Object.keys(obj).length })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
    }
}

export async function GET() {
    try {
        const buf = await fs.readFile(OUT_PATH, 'utf8')
        const json = JSON.parse(buf)
        return NextResponse.json(json)
    } catch {
        // not uploaded yet
        return NextResponse.json({}, { status: 200 })
    }
}
