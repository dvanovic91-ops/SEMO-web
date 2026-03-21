import type { Area } from 'react-easy-crop';

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (err) => reject(err));
    // blob/data URL은 crossOrigin을 쓰면 일부 브라우저에서 캔버스 그리기가 실패할 수 있음
    if (url.startsWith('http://') || url.startsWith('https://')) {
      image.setAttribute('crossOrigin', 'anonymous');
    }
    image.src = url;
  });
}

/** 크롭 영역을 JPEG Blob으로 (업로드용). 긴 변 최대 maxEdge 로 리사이즈해 용량 절감 */
export async function getCroppedImageBlob(
  imageSrc: string,
  pixelCrop: Area,
  maxEdge = 1600,
  quality = 0.92,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  let { width: cw, height: ch } = pixelCrop;
  const scale = Math.min(1, maxEdge / Math.max(cw, ch));
  cw = Math.round(cw * scale);
  ch = Math.round(ch * scale);

  canvas.width = cw;
  canvas.height = ch;

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    cw,
    ch,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/jpeg', quality);
  });
}
