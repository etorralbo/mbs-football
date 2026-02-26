import { LoginForm } from './LoginForm'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden="true">⚽</span>
          <span className="text-lg font-bold text-zinc-900">MBS Football</span>
        </div>
        <h1 className="mt-6 text-2xl font-semibold text-zinc-900">Welcome back</h1>
        <p className="mt-2 text-sm text-zinc-500">Sign in to your account</p>
        <LoginForm />
      </div>
    </main>
  )
}
