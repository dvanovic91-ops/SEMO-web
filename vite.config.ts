import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
  },
  // npm run share(빌드+미리보기) 시 ngrok으로 iPhone 등에서 접속 허용
  preview: {
    port: 4173,
    allowedHosts: true,
    host: true,
  },
});
