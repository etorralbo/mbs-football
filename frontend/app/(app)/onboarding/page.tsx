import { OnboardingForm } from './OnboardingForm'

export default function OnboardingPage() {
  return (
    <div className="max-w-sm">
      <h1 className="text-2xl font-semibold text-zinc-900">Set up your team</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Create your team to get started. You&apos;ll be the coach.
      </p>
      <OnboardingForm />
    </div>
  )
}
