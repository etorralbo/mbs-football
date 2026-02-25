import Link from 'next/link'

export function NavBar() {
  return (
    <nav className="flex items-center gap-6 px-6 py-4 border-b border-gray-200">
      <span className="font-semibold text-gray-900">MBS Football</span>
      <Link href="/templates" className="text-sm text-gray-600 hover:text-gray-900">
        Templates
      </Link>
      <Link href="/sessions" className="text-sm text-gray-600 hover:text-gray-900">
        Sessions
      </Link>
    </nav>
  )
}
