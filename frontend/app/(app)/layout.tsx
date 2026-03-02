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
          <div className="min-h-screen bg-[#0a0d14]">
            <NavBar />
            <TeamPageContent>{children}</TeamPageContent>
          </div>
        </TeamSelectGuard>
      </AuthProvider>
    </RequireAuth>
  )
}
