/** 바우만 4글자 타입(D/O · S/R · P/N · W/T). 각 글자는 축마다 하나만 나온다. */
export const AXIS_PAIRS = [
  ['D', 'O'],
  ['S', 'R'],
  ['P', 'N'],
  ['W', 'T'],
] as const;

export function normalizeBaumann(type: string | null | undefined): string | null {
  const t = type?.trim().toUpperCase();
  if (!t || t.length !== 4) return null;
  return t;
}

export function countBaumannAxes(types: { type: string; n: number }[]) {
  const axes: Record<string, number> = { D: 0, O: 0, S: 0, R: 0, P: 0, N: 0, W: 0, T: 0 };
  for (const { type, n } of types) {
    const t = normalizeBaumann(type);
    if (!t) continue;
    for (const ch of t) {
      if (axes[ch] != null) axes[ch] += n;
    }
  }
  return axes;
}
