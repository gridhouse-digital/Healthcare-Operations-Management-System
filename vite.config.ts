import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Strip all console.* and debugger statements from production builds so that
  // no PII (applicant data, AI assessments, etc.) is ever written to the
  // browser console in production. Dev builds keep them for debugging.
  esbuild: {
    drop: ['console', 'debugger'],
  },
})
