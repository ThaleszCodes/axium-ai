import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Carrega variáveis de ambiente (como API_KEY) do sistema ou arquivo .env
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Isso permite que o código 'process.env.API_KEY' continue funcionando
      // substituindo-o pelo valor real durante o build no Vercel.
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})