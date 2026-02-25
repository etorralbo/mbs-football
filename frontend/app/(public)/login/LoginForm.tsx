'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { setToken } from '@/app/_shared/auth/tokenStorage'

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
        <label htmlFor="token" className="block text-sm font-medium text-gray-700">
          Access token
        </label>
        <textarea
          id="token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Paste your JWT here"
        />
      </div>
      <button
        type="submit"
        disabled={!value.trim()}
        className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        Sign in
      </button>
    </form>
  )
}
