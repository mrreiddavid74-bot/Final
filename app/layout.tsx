import './globals.css'
import Link from 'next/link'

export const metadata = { title: 'Sign Pricing', description: '5-mode sign pricing calculator' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b bg-white">
          <nav className="container flex items-center gap-4 h-14">
            <Link href="/single" className="font-semibold">Sign Pricing</Link>
            <div className="flex gap-3 text-sm">
              <Link href="/single" className="hover:underline">Single Sign</Link>
              <Link href="/mixed" className="hover:underline">Mixed Signs</Link>
              <Link href="/settings" className="hover:underline">Settings</Link>
            </div>
          </nav>
        </header>
        <main className="container py-6">{children}</main>
      </body>
    </html>
  )
}
