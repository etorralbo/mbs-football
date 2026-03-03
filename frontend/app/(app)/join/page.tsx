import { Suspense } from 'react'
import { JoinTeamForm } from './JoinTeamForm'

export default function JoinPage() {
  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold text-white">Join a team</h1>
      <p className="mt-2 text-sm text-slate-400">
        Open the invite link your coach sent you, or paste the token below.
      </p>
      {/* Suspense required because JoinTeamForm uses useSearchParams */}
      <Suspense>
        <JoinTeamForm />
      </Suspense>
    </div>
  )
}
