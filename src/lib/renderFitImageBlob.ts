export type FitImageTransform = {
  /** 출력 캔버스 기준 중심에서의 X 오프셋 (px) */
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export const DEFAULT_FIT_TRANSFORM: FitImageTransform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
};

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (err) => reject(err));
    if (url.startsWith('http://') || url.startsWith('https://')) {
      image.setAttribute('crossOrigin', 'anonymous');
    }
    image.src = url;
  });
}

function baseFitScale(iw: number, ih: number, outputSize: number, fitPadding: number): number {
  return Math.min(outputSize / iw, outputSize / ih) * fitPadding;
}

/** 드래그·가로/세로 늘리기 결과를 정사각 JPEG로 렌더 */
export async function renderFitImageBlob(
  imageSrc: string,
  transform: FitImageTransform,
  outputSize = 800,
  background = '#ffffff',
  fitPadding = 0.92,
  quality = 0.92,
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const iw = image.naturalWidth;
  const ih = image.naturalHeight;
  const fit = baseFitScale(iw, ih, outputSize, fitPadding);

  const drawW = iw * fit * transform.scaleX;
  const drawH = ih * fit * transform.scaleY;
  const cx = outputSize / 2 + transform.x;
  const cy = outputSize / 2 + transform.y;

  const canvas = document.createElement('canvas');
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, outputSize, outputSize);
  ctx.drawImage(image, cx - drawW / 2, cy - drawH / 2, drawW, drawH);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob failed'));
    }, 'image/jpeg', quality);
  });
}

export function computeFitDrawSize(
  iw: number,
  ih: number,
  transform: FitImageTransform,
  outputSize: number,
  fitPadding = 0.92,
): { width: number; height: number } {
  const fit = baseFitScale(iw, ih, outputSize, fitPadding);
  return {
    width: iw * fit * transform.scaleX,
    height: ih * fit * transform.scaleY,
  };
}
