import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: 'Coupang Analytics',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-[#030712] text-[#e2e8f0] min-h-screen" suppressHydrationWarning>
        <Sidebar />
        <main className="ml-[220px] p-6 min-h-screen">
          {children}
        </main>
      </body>
    </html>
  )
}
