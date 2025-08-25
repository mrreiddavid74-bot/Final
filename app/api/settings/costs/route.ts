import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs/promises'

type CostMap = Record<string, number | string>

const DATA_DIR = path.join(process.cwd(), 'public', 'settings')
const COSTS_PATH = path.join(DATA_DIR, 'costs.json')

// --- utils ---
async function ensureDir(p: string) {
    try {
        await fs.mkdir(p, { recursive: true })
    } catch {
        /* ignore */
    }
}

async function loadCostsFromDisk(): Promise<CostMap> {
    try {
        const buf = await fs.readFile(COSTS_PATH, 'utf-8')
        const json = JSON.parse(buf)
        return (json && typeof json === 'object') ? (json as CostMap) : {}
    } catch {
        return {}
    }
}

async function saveCostsToDisk(costs: CostMap) {
    await ensureDir(DATA_DIR)
    await fs.writeFile(COSTS_PATH, JSON.stringify(costs, null, 2), 'utf-8')
}

function toNumberIfPossible(v: string): number | string {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : v
}

// very small CSV reader: expects 2 columns: key, value (header optional)
function parseCsv(text: string): CostMap {
    const out: CostMap = {}
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '')
    if (lines.length === 0) return out

    // Allow an optional header row
    const start = /^"?key"?\s*,\s*"?value"?/i.test(lines[0].trim()) ? 1 : 0

    for (let i = start; i < lines.length; i++) {
        const raw = lines[i]
        // naive split – OK for simple 2-column file; if you later need quoted commas, swap in a real CSV parser
        const idx = raw.indexOf(',')
        if (idx === -1) continue
        const k = raw.slice(0, idx).trim().replace(/^"|"$/g, '')
        const v = raw.slice(idx + 1).trim().replace(/^"|"$/g, '')
        if (!k) continue
        out[k] = toNumberIfPossible(v)
    }
    return out
}

export async function GET() {
    const current = await loadCostsFromDisk()
    return NextResponse.json(current)
}

export async function POST(req: NextRequest) {
    const ctype = req.headers.get('content-type') || ''
    try {
        let costs: CostMap = {}

        if (ctype.includes('application/json')) {
            // Accept either { "K": V, ... } or [{ key,name,id, value }, ...]
            const body = await req.json()
            if (Array.isArray(body)) {
                const out: CostMap = {}
                for (const row of body) {
                    const k = (row.key ?? row.name ?? row.id ?? '').toString().trim()
                    if (!k) continue
                    const val = row.value ?? row.val ?? row.amount
                    out[k] = typeof val === 'string' ? toNumberIfPossible(val.trim()) : val
                }
                costs = out
            } else if (body && typeof body === 'object') {
                costs = body as CostMap
            }
        } else {
            const text = await req.text()
            costs = parseCsv(text)
        }

        await saveCostsToDisk(costs)
        return NextResponse.json({ ok: true, count: Object.keys(costs).length })
    } catch (e: any) {
        return NextResponse.json({ ok: false, error: e?.message || 'Upload failed' }, { status: 400 })
    }
}
