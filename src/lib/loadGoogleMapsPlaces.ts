/**
 * Maps JavaScript API + places 라이브러리 (Autocomplete).
 * 첫 로드 시 `language`가 스크립트 URL에 고정됨. 이후 같은 탭에서 언어만 바뀌면
 * 브라우저가 이미 로드한 스크립트를 재사용하므로 UI 언어가 완전히 맞지 않을 수 있음(새로고침으로 맞춤).
 */
let mapsLoadPromise: Promise<typeof google> | null = null;

export function loadGoogleMapsWithPlaces(apiKey: string, language?: string): Promise<typeof google> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps: no window'));
  }
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }
  if (mapsLoadPromise) return mapsLoadPromise;

  mapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const lang = language ? `&language=${encodeURIComponent(language)}` : '';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places${lang}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google?.maps?.places) resolve(window.google);
      else {
        mapsLoadPromise = null;
        reject(new Error('Google Maps loaded without places library'));
      }
    };
    script.onerror = () => {
      mapsLoadPromise = null;
      reject(new Error('Google Maps script failed to load'));
    };
    document.head.appendChild(script);
  });

  return mapsLoadPromise;
}
