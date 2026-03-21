# `/profile` 등에서 새로고침 시 흰 화면

React(Vite) + `BrowserRouter`는 **주소만 바뀌고 실제 파일은 항상 `index.html` 하나**입니다.  
서버가 **`/profile` 경로를 파일로 찾다가 404**를 내면 JS가 안 뜨고 흰 화면만 보입니다.

## 이미 설정된 것

- **Vercel**: 저장소 루트 `vercel.json`에 `rewrites` → 모든 경로를 `/index.html`로 보냄.
- **Netlify 등**: `public/_redirects`가 빌드 시 `dist`에 복사됩니다.

## 직접 서버(Nginx)를 쓰는 경우

```nginx
location / {
  root /var/www/beautybox/dist;
  try_files $uri $uri/ /index.html;
}
```

## Apache

`.htaccess` (또는 VirtualHost):

```apache
FallbackResource /index.html
```

## S3 + CloudFront

- S3 정적 웹사이트: **오류 문서**를 `index.html`로 (403/404 → index.html).  
- 또는 CloudFront **오류 페이지** 규칙으로 403/404를 `/index.html`로.

## 로컬 `vite preview`

Vite 미리보기는 보통 SPA 폴백을 지원합니다. 그래도 흰 화면이면 실제 배포 환경의 위 규칙을 확인하세요.
