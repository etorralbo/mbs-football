import Link from 'next/link'

export default function InviteInvalidPage() {
  return (
    <div className="mx-auto max-w-sm space-y-5 pt-10 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-500/15">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>
      <div>
        <h1 className="text-xl font-semibold text-white">
          Invite link is invalid or expired
        </h1>
        <p className="mt-1.5 text-sm text-slate-400">
          Ask your coach for a new one.
        </p>
      </div>
      <Link
        href="/sessions"
        className="inline-block rounded-md bg-white/8 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/12 hover:text-white"
      >
        Go to dashboard
      </Link>
    </div>
  )
}
