import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // GitHub Pages 프로젝트 사이트에서도 동작하도록 상대 경로 사용
  base: './',
})