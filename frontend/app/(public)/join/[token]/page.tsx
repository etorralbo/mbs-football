'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/app/_shared/auth/supabaseClient'
import { request, ForbiddenError } from '@/app/_shared/api/httpClient'
import { Button } from '@/app/_shared/components/Button'
import type {
  AcceptInviteResponse,
  InvitePreviewResponse,
} from '@/app/_shared/api/types'

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000'

function formatRelativeExpiry(isoDate: string): string {
  const now = new Date()
  const expires = new Date(isoDate)
  const diffMs = expires.getTime() - now.getTime()
  if (diffMs <= 0) return 'Expired'
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 1) return 'Expires tomorrow'
  return `Expires in ${diffDays} days`
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/8 bg-[#131922] p-8 text-center">
        {children}
      </div>
    </div>
  )
}

function IconCircle({
  color,
  children,
}: {
  color: 'green' | 'amber' | 'red' | 'blue'
  children: React.ReactNode
}) {
  const bg: Record<string, string> = {
    green: 'bg-green-500/15',
    amber: 'bg-amber-500/15',
    red: 'bg-red-500/15',
    blue: 'bg-[#c8f135]/15',
  }
  return (
    <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${bg[color]}`}>
      {children}
    </div>
  )
}

type Phase =
  | 'loading'
  | 'preview'
  | 'joined'
  | 'already_member'
  | 'not_eligible'
  | 'expired'
  | 'used'
  | 'email_mismatch'
  | 'invalid'

export default function JoinTokenPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [phase, setPhase] = useState<Phase>('loading')
  const [preview, setPreview] = useState<InvitePreviewResponse | null>(null)
  const [teamName, setTeamName] = useState('')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [mismatchMessage, setMismatchMessage] = useState('')
  const [accepting, setAccepting] = useState(false)
  const [shouldAutoAccept, setShouldAutoAccept] = useState(false)
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    if (!token || token.length < 20) {
      setPhase('invalid')
      return
    }

    async function load() {
      // Fetch preview (no auth required)
      let previewData: InvitePreviewResponse
      try {
        const resp = await fetch(`${BASE_URL}/v1/invites/preview/${encodeURIComponent(token)}`)
        if (resp.status === 404) {
          setPhase('invalid')
          return
        }
        if (resp.status === 410) {
          setPhase('expired')
          return
        }
        if (resp.status === 409) {
          setPhase('used')
          return
        }
        if (!resp.ok) {
          setPhase('invalid')
          return
        }
        previewData = await resp.json()
        setPreview(previewData)
        setTeamName(previewData.team_name)
      } catch {
        setPhase('invalid')
        return
      }

      // Check auth state
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const loggedIn = !!session
      setIsLoggedIn(loggedIn)

      // Auto-accept: logged in + invite bound to email + emails match
      if (loggedIn && previewData.email) {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        const userEmail = user?.email?.toLowerCase() ?? ''
        if (userEmail && userEmail === previewData.email.toLowerCase()) {
          setPhase('preview')
          setShouldAutoAccept(true)
          return
        }
      }

      setPhase('preview')
    }

    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleAccept() {
    if (accepting) return
    setAccepting(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const meta = user?.user_metadata
      const displayName = (
        meta?.name ??
        meta?.full_name ??
        user?.email?.split('@')[0] ??
        ''
      ).trim()

      const result = await request<AcceptInviteResponse>(
        `/v1/team-invites/${encodeURIComponent(token)}/accept`,
        {
          method: 'POST',
          body: JSON.stringify({ display_name: displayName }),
          teamScoped: false,
        },
      )

      setTeamName(result.team_name)

      if (result.status === 'joined') {
        setPhase('joined')
      } else if (result.status === 'already_member') {
        setPhase('already_member')
      } else {
        setPhase('not_eligible')
      }
    } catch (err) {
      if (err instanceof ForbiddenError) {
        setMismatchMessage(err.message)
        setPhase('email_mismatch')
      } else {
        setPhase('invalid')
      }
    }
  }

  // Auto-accept: trigger handleAccept when email match detected during load
  useEffect(() => {
    if (shouldAutoAccept && phase === 'preview' && !accepting) {
      handleAccept()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldAutoAccept, phase])

  function handleLogin() {
    router.push(`/login?next=/join/${encodeURIComponent(token)}`)
  }

  async function handleSwitchAccount() {
    await supabase.auth.signOut()
    router.push(`/login?next=/join/${encodeURIComponent(token)}`)
  }

  // -- Loading --
  if (phase === 'loading') {
    return (
      <Card>
        <div className="flex flex-col items-center gap-3" aria-busy="true">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#c8f135] border-t-transparent" />
          <p className="text-sm text-slate-400">Loading...</p>
        </div>
      </Card>
    )
  }

  // -- Invalid token --
  if (phase === 'invalid') {
    return (
      <Card>
        <div className="space-y-4">
          <IconCircle color="red">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
            </svg>
          </IconCircle>
          <h1 className="text-xl font-semibold text-white">Invalid invite</h1>
          <p className="text-sm text-slate-400">
            This invite link is not valid. Ask your coach for a new invite link.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm text-[#c8f135] hover:underline"
          >
            Go to login
          </Link>
        </div>
      </Card>
    )
  }

  // -- Expired --
  if (phase === 'expired') {
    return (
      <Card>
        <div className="space-y-4">
          <IconCircle color="amber">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </IconCircle>
          <h1 className="text-xl font-semibold text-white">Invite expired</h1>
          <p className="text-sm text-slate-400">
            This invite link has expired. Ask your coach for a new invite link.
          </p>
        </div>
      </Card>
    )
  }

  // -- Already used --
  if (phase === 'used') {
    return (
      <Card>
        <div className="space-y-4">
          <IconCircle color="amber">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
          </IconCircle>
          <h1 className="text-xl font-semibold text-white">Invite already used</h1>
          <p className="text-sm text-slate-400">
            This invite link has already been used. Ask your coach for a new invite link.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm text-[#c8f135] hover:underline"
          >
            Go to login
          </Link>
        </div>
      </Card>
    )
  }

  // -- Successfully joined --
  if (phase === 'joined') {
    return (
      <Card>
        <div className="space-y-5">
          <IconCircle color="green">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </IconCircle>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-white">
              You joined {teamName}
            </h1>
            <p className="text-sm text-slate-400">
              Welcome to the team! You can now view your assigned sessions.
            </p>
          </div>
          <Button onClick={() => router.replace('/sessions')} className="w-full">
            View your sessions
          </Button>
        </div>
      </Card>
    )
  }

  // -- Already member --
  if (phase === 'already_member') {
    return (
      <Card>
        <div className="space-y-5">
          <IconCircle color="blue">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-[#c8f135]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </IconCircle>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-white">
              You are already part of {teamName}
            </h1>
            <p className="text-sm text-slate-400">
              No action needed — you are already a member of this team.
            </p>
          </div>
          <Button onClick={() => router.replace('/sessions')} className="w-full">
            Go to your sessions
          </Button>
        </div>
      </Card>
    )
  }

  // -- Not eligible (coach) --
  if (phase === 'not_eligible') {
    return (
      <Card>
        <div className="space-y-5">
          <IconCircle color="red">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
            </svg>
          </IconCircle>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-white">Cannot join as athlete</h1>
            <p className="text-sm text-slate-400">
              You are a coach and cannot join a team as an athlete. Share this link with your athletes instead.
            </p>
          </div>
          <Button variant="secondary" onClick={() => router.replace('/dashboard')} className="w-full">
            Go to dashboard
          </Button>
        </div>
      </Card>
    )
  }

  // -- Email mismatch --
  if (phase === 'email_mismatch') {
    return (
      <Card>
        <div className="space-y-5">
          <IconCircle color="red">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636l-12.728 12.728M5.636 5.636l12.728 12.728" />
            </svg>
          </IconCircle>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold text-white">Wrong account</h1>
            <p className="text-sm text-slate-400">
              {mismatchMessage || 'This invitation was sent to a different email address. You are currently signed in with a different account.'}
            </p>
          </div>
          <Button onClick={handleSwitchAccount} className="w-full">
            Switch account
          </Button>
        </div>
      </Card>
    )
  }

  // -- Preview --
  return (
    <Card>
      <div className="space-y-6">
        <IconCircle color="blue">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-[#c8f135]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </IconCircle>

        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-white">
            Join {preview?.team_name}
          </h1>
          <div className="space-y-0.5 text-sm text-slate-400">
            {preview?.coach_name && (
              <p>Coach: {preview.coach_name}</p>
            )}
            <p>Role: Athlete</p>
            {preview?.email && (
              <p>Invited: {preview.email}</p>
            )}
          </div>
          {preview?.expires_at && (
            <p className="pt-1 text-xs text-slate-500">
              {formatRelativeExpiry(preview.expires_at)}
            </p>
          )}
        </div>

        {isLoggedIn ? (
          <Button
            onClick={handleAccept}
            disabled={accepting}
            loading={accepting}
            className="w-full"
          >
            {accepting ? 'Joining...' : 'Join team'}
          </Button>
        ) : (
          <div className="space-y-3">
            <Button onClick={handleLogin} className="w-full">
              Log in to join this team
            </Button>
            <p className="text-xs text-slate-500">
              You need to log in or create an account to join this team.
            </p>
          </div>
        )}
      </div>
    </Card>
  )
}
