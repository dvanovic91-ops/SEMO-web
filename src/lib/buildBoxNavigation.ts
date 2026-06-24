import type { BuildProduct } from './buildBoxCatalog';

export const BUILD_BOX_REVIEW_PATH = '/shop/build?review=1';

/** box-image.png (1336×1496) — 금색 프레임 내부(약 6% inset) */
export const BOX_REVIEW_IMAGE_SLOTS = [
  { left: '9.1%', top: '28.4%', width: '16.3%', height: '22.1%', labelLeft: '8.1%', labelWidth: '18.4%', labelTop: '52.0%' },
  { left: '35.6%', top: '31.1%', width: '17.7%', height: '19.3%', labelLeft: '34.4%', labelWidth: '20.1%', labelTop: '52.0%' },
  { left: '63.7%', top: '30.9%', width: '17.6%', height: '19.5%', labelLeft: '62.5%', labelWidth: '20.0%', labelTop: '52.0%' },
  { left: '9.1%', top: '48.9%', width: '16.4%', height: '22.1%', labelLeft: '8.0%', labelWidth: '18.5%', labelTop: '72.5%' },
  { left: '35.6%', top: '49.1%', width: '17.7%', height: '21.9%', labelLeft: '34.4%', labelWidth: '20.1%', labelTop: '72.5%' },
  { left: '63.7%', top: '49.1%', width: '17.6%', height: '21.9%', labelLeft: '62.5%', labelWidth: '20.0%', labelTop: '72.5%' },
] as const;

export function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//')) return null;
  return decoded;
}

export function buildBuildProductDetailHref(
  product: BuildProduct,
  returnPath: string = BUILD_BOX_REVIEW_PATH,
): string | null {
  const from = encodeURIComponent(returnPath);
  if (product.skuId) {
    return `/sku/${product.skuId}?from=${from}`;
  }
  if (product.productId) {
    return `/product/${product.productId}?from=${from}`;
  }
  return null;
}

export function resolveDetailBackNavigation(
  fromParam: string | null,
  fallbackPath: string,
  fallbackLabel: string,
  isEn: boolean,
): { path: string; label: string } {
  const returnPath = safeReturnPath(fromParam);
  if (returnPath === BUILD_BOX_REVIEW_PATH) {
    return {
      path: BUILD_BOX_REVIEW_PATH,
      label: isEn ? 'Back to your box' : 'К твоему боксу',
    };
  }
  if (returnPath?.startsWith('/shop/build')) {
    return {
      path: returnPath,
      label: isEn ? 'Back to box' : 'К боксу',
    };
  }
  if (returnPath) {
    return { path: returnPath, label: isEn ? 'Back' : 'Назад' };
  }
  return { path: fallbackPath, label: fallbackLabel };
}
