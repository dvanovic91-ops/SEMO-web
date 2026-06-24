const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 장바구니 커스텀 박스 등 — /product/:uuid 상세로 연결 불가 */
export function isNonProductCartItemId(id: string): boolean {
  return id.startsWith('custom-') || !UUID_RE.test(id);
}
