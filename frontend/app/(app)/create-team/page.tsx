import { CreateTeamForm } from './CreateTeamForm'

export default function CreateTeamPage() {
  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Create your team</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Give your team a name. You&apos;ll be the coach.
      </p>
      <CreateTeamForm />
    </div>
  )
}
