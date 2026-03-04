import { RequireAuth } from '@/app/_shared/auth/RequireAuth'
import { TeamSelectGuard } from '@/app/_shared/auth/TeamSelectGuard'
import { AuthProvider } from '@/src/shared/auth/AuthContext'
import { AppShellGate } from '@/app/_shared/components/AppShellGate'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AuthProvider>
        <TeamSelectGuard>
          <AppShellGate>{children}</AppShellGate>
        </TeamSelectGuard>
      </AuthProvider>
    </RequireAuth>
  )
}
