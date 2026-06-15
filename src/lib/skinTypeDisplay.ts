export function formatSkinTypeShort(skinType: string | null | undefined, isEn: boolean): string {
  const code = String(skinType ?? '').trim().toUpperCase();
  if (code.length !== 4) return code || '—';

  const [oil, sensitivity, pigment, wrinkle] = code.split('');
  const en: Record<string, string> = {
    D: 'Dry',
    O: 'Oily',
    S: 'Sensitive',
    R: 'Resistant',
    P: 'Pigment',
    N: 'Clear tone',
    W: 'Wrinkle',
    T: 'Firm',
  };
  const ru: Record<string, string> = {
    D: 'Сухая',
    O: 'Жирная',
    S: 'Чувств.',
    R: 'Устойч.',
    P: 'Пигмент',
    N: 'Ровный тон',
    W: 'Возраст',
    T: 'Упругая',
  };
  const map = isEn ? en : ru;
  return [oil, sensitivity, pigment, wrinkle].map((key) => map[key] ?? key).join(' · ');
}
