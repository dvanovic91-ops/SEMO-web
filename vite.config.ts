import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

/**
 * 모바일에서 `http://172.x.x.x:5173` 로 접속할 때 새로고침만 흰 화면이 되는 경우:
 * - dev 서버가 localhost에만 바인딩되면 폰에서 접속이 불안정할 수 있음 → host: true
 * - HMR(WebSocket)이 PC의 localhost 기준으로만 붙으면 폰에서는 연결 실패·스크립트 꼬임 가능
 *   → `npm run dev:mobile` 또는 `NO_HMR=1 npm run dev` 로 HMR 끄고 새로고침만 테스트
 */
const disableHmr = process.env.NO_HMR === '1' || process.env.VITE_NO_HMR === '1';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /** 0.0.0.0 에 바인딩 — 같은 Wi-Fi의 폰에서 PC IP:5173 접속 가능 */
    host: true,
    strictPort: true,
    allowedHosts: true,
    ...(disableHmr ? { hmr: false as const } : {}),
  },
  // npm run share(빌드+미리보기) 시 ngrok으로 iPhone 등에서 접속 허용
  preview: {
    port: 4173,
    allowedHosts: true,
    host: true,
  },
});
