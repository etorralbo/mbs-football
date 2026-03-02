import { OnboardingHub } from './OnboardingForm'

export default function OnboardingPage() {
  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-white">Welcome to MBS Football</h1>
      <p className="mt-2 text-sm text-slate-400">
        Are you a coach setting up a new team, or an athlete joining one?
      </p>
      <OnboardingHub />
    </div>
  )
}
