/** 숫자만 남기고 길이 제한 (ИНН 12, серия 4, номер 6, индекс 6). */
export function clampDigits(value: string, maxLen: number): string {
  return value.replace(/\D/g, '').slice(0, maxLen);
}
