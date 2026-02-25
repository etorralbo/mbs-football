'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setToken } from '@/app/_shared/auth/tokenStorage'
import { Button } from '@/app/_shared/components/Button'

export function LoginForm() {
  const [value, setValue] = useState('')
  const router = useRouter()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    setToken(trimmed)
    router.push('/templates')
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="token" className="block text-sm font-medium text-zinc-700">
          Access token
        </label>
        <textarea
          id="token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          className="mt-1.5 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="Paste your JWT here"
        />
      </div>
      <Button type="submit" disabled={!value.trim()} className="w-full">
        Sign in
      </Button>
    </form>
  )
}
