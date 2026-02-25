import { NavBar } from '@/app/_shared/components/NavBar'
import { RequireAuth } from '@/app/_shared/auth/RequireAuth'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-white">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </div>
    </RequireAuth>
  )
}
