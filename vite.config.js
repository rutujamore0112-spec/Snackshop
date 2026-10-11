import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig(({ mode }) => {
  const { DEV_API_TARGET } = loadEnv(mode, process.cwd(), 'DEV_')
  return {
    plugins: [react()],
    server: {
      proxy: DEV_API_TARGET ? {
        '/api': { target: DEV_API_TARGET, changeOrigin: true },
      } : undefined,
    },
  }
})
