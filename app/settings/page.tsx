
'use client'
import { useState } from 'react'

export default function SettingsPage() {
  const [info, setInfo] = useState<string>('')

  async function upload(endpoint: 'vinyl'|'substrates', file: File) {
    const text = await file.text()
    const res = await fetch(`/api/settings/${endpoint}`, { method: 'POST', body: text })
    const data = await res.json()
    setInfo(`${endpoint}: uploaded ${data.count} rows`)
  }

  return (
    <main className="max-w-3xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-semibold">Settings – CSV upload/download</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Vinyl media</h2>
        <div className="flex gap-3 items-center">
          <a className="underline text-blue-600" href="/api/settings/vinyl">Download current CSV</a>
          <input type="file" accept=".csv" onChange={e => e.target.files && upload('vinyl', e.target.files[0])} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Substrates</h2>
        <div className="flex gap-3 items-center">
          <a className="underline text-blue-600" href="/api/settings/substrates">Download current CSV</a>
          <input type="file" accept=".csv" onChange={e => e.target.files && upload('substrates', e.target.files[0])} />
        </div>
      </section>

      {info && <div className="text-sm text-gray-600">{info}</div>}
    </main>
  )
}
