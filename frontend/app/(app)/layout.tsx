import { NavBar } from '@/app/_shared/components/NavBar'
import { TeamPageContent } from '@/app/_shared/components/TeamPageContent'
import { RequireAuth } from '@/app/_shared/auth/RequireAuth'
import { TeamSelectGuard } from '@/app/_shared/auth/TeamSelectGuard'
import { AuthProvider } from '@/src/shared/auth/AuthContext'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AuthProvider>
        <TeamSelectGuard>
          <div className="flex h-screen overflow-hidden bg-[#0d141c]">
            <NavBar />
            <main className="flex-1 overflow-y-auto">
              <TeamPageContent>{children}</TeamPageContent>
            </main>
          </div>
        </TeamSelectGuard>
      </AuthProvider>
    </RequireAuth>
  )
}
