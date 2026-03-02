import { NavBar } from '@/app/_shared/components/NavBar'
import { RequireAuth } from '@/app/_shared/auth/RequireAuth'
import { AuthProvider } from '@/src/shared/auth/AuthContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AuthProvider>
        <div className="min-h-screen bg-[#0a0d14]">
          <NavBar />
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        </div>
      </AuthProvider>
    </RequireAuth>
  )
}
