import Image from 'next/image'
import Link from 'next/link'
import { SignupForm } from './SignupForm'

export default function SignupPage() {
  return (
    <div className="flex min-h-screen bg-[#0a0f1a]">
      {/* ── Left hero panel (desktop only) ── */}
      <div className="relative hidden overflow-hidden lg:flex lg:flex-1 lg:flex-col lg:justify-between lg:p-12">
        {/* Gradient background */}
        <div className="absolute inset-0 bg-[#0a0f1a]">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/25 via-transparent to-transparent" />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle, rgba(255,255,255,0.15) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
        </div>

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-2.5">
          <Image src="/favicon.svg" alt="Mettle Performance" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold text-white">Mettle Performance</span>
        </div>

        {/* Hero content */}
        <div className="relative z-10">
          <h1 className="text-4xl font-black leading-tight tracking-tight text-white">
            Train with purpose.<br />
            <span className="text-indigo-400">Every session, measured.</span>
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400">
            The platform that connects coaches and athletes to plan, log, and review every workout.
          </p>
        </div>

        {/* Footer links */}
        <div className="relative z-10 flex gap-6 text-xs text-slate-600">
          <Link href="#" className="hover:text-slate-400 transition-colors">Privacy Policy</Link>
          <Link href="#" className="hover:text-slate-400 transition-colors">Terms of Service</Link>
        </div>
      </div>

      {/* ── Right form side ── */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <Image src="/favicon.svg" alt="Mettle Performance" width={32} height={32} className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-bold text-white">Mettle Performance</span>
        </div>

        <div className="w-full max-w-[400px]">
          <div className="rounded-2xl border border-white/8 bg-[#141d2b] p-8 shadow-2xl">
            <h1 className="text-2xl font-bold text-white">Create your account</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Sign up to get started as a coach or athlete.
            </p>
            <SignupForm />
          </div>
        </div>
      </div>
    </div>
  )
}
