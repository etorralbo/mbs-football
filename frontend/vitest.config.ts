import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key-for-vitest',
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:8000',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
})
