import { Suspense } from 'react'
import { JoinTeamForm } from './JoinTeamForm'

export default function JoinPage() {
  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Join a team</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Enter the invite code your coach sent you.
      </p>
      {/* Suspense required because JoinTeamForm uses useSearchParams */}
      <Suspense>
        <JoinTeamForm />
      </Suspense>
    </div>
  )
}
