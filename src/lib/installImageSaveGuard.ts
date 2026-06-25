const PROTECTED_MEDIA_SELECTOR = 'img, picture, video, canvas';

function closestProtectedMedia(target: EventTarget | null): Element | null {
  if (!(target instanceof Element)) return null;
  if (target.matches(PROTECTED_MEDIA_SELECTOR)) return target;
  return target.closest(PROTECTED_MEDIA_SELECTOR);
}

/**
 * 사이트 전역: 이미지·영상 우클릭 저장, 드래그 저장, 선택 완화.
 * (개발자 도구·스크린샷 등은 웹 한계상 막을 수 없음)
 */
export function installImageSaveGuard(): void {
  if (typeof document === 'undefined') return;

  const blockIfMedia = (event: Event) => {
    if (closestProtectedMedia(event.target)) {
      event.preventDefault();
    }
  };

  document.addEventListener('contextmenu', blockIfMedia, { capture: true });
  document.addEventListener('dragstart', blockIfMedia, { capture: true });
  document.addEventListener('selectstart', blockIfMedia, { capture: true });
}
