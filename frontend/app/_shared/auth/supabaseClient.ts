import { createClient } from '@supabase/supabase-js'

// In Next.js, only env vars prefixed with NEXT_PUBLIC_ are exposed to the
// browser bundle. They are read via process.env (not import.meta.env, which
// is Vite-specific syntax and does not work in Next.js).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL')
}
if (!supabaseAnonKey) {
  throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
