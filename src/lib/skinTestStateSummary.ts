type SkinMetricsLike = {
  redness_index?: number;
  pigment_unevenness?: number;
  texture_roughness?: number;
  oiliness_index?: number;
} | null | undefined;

function band01(v: number): 'low' | 'mid' | 'high' {
  if (v < 38) return 'low';
  if (v > 62) return 'high';
  return 'mid';
}

function selfieBandPhrase(
  key: 'redness' | 'pigment' | 'texture' | 'oil',
  v: number,
  isEn: boolean,
): string {
  const b = band01(v);
  if (isEn) {
    const m = {
      redness: { low: 'redness looks mild in the photo', mid: 'moderate redness in the photo', high: 'noticeable redness in the photo' },
      pigment: { low: 'uneven pigmentation looks mild in the photo', mid: 'some uneven tone visible in the photo', high: 'uneven pigmentation stands out in the photo' },
      texture: { low: 'surface texture looks relatively smooth in the photo', mid: 'texture is moderately uneven in the photo', high: 'texture looks rougher in the photo' },
      oil: { low: 'T-zone shine looks mild in the photo', mid: 'moderate oil shine in the photo', high: 'stronger oil shine in the photo' },
    } as const;
    return m[key][b];
  }
  const m = {
    redness: { low: 'покраснение на фото выглядит слабым', mid: 'покраснение на фото умеренное', high: 'покраснение на фото заметное' },
    pigment: { low: 'неровность пигмента на фото небольшая', mid: 'на фото видна умеренная неровность тона', high: 'на фото заметна выраженная неровность пигмента' },
    texture: { low: 'текстура на фото относительно ровная', mid: 'текстура на фото умеренно неровная', high: 'текстура на фото выглядит более грубой' },
    oil: { low: 'блеск T-зоны на фото слабый', mid: 'блеск на фото умеренный', high: 'блеск на фото выраженный' },
  } as const;
  return m[key][b];
}

/**
 * 차트 아래에 붙이는 짧은 서술형 요약(의학 진단 아님). 바우만 축 + 선택적 셀피 신호.
 */
export function buildSkinStateSummaryParagraph(
  scores: Record<1 | 2 | 3 | 4, number>,
  skinMetrics: SkinMetricsLike,
  isEn: boolean,
  concernText?: string,
): string {
  const c = (n: unknown) => {
    const x = Number(n);
    return Math.max(-10, Math.min(10, Number.isFinite(x) ? x : 0));
  };
  const s1 = c(scores[1]);
  const s2 = c(scores[2]);
  const s3 = c(scores[3]);
  const s4 = c(scores[4]);

  // SkinResultMetricsCharts: ось 1 — слева Dry, справа Oily; положительный raw подсвечивает Dry.
  const dryOil =
    s1 > 1.5
      ? isEn
        ? 'Your answers lean drier on the dry–oily axis.'
        : 'По ответам сдвиг в сторону более сухой кожи (шкала сухость–жирность).'
      : s1 < -1.5
        ? isEn
          ? 'Your answers lean oilier on the dry–oily axis (including T-zone shine).'
          : 'По ответам сдвиг в сторону более жирной кожи (включая блеск T-зоны).'
        : isEn
          ? 'Dry–oil balance from the questionnaire sits around the middle.'
          : 'По опроснику баланс сухость–жирность ближе к середине.';

  const sens =
    s2 > 1.5
      ? isEn
        ? ' Sensitivity signals are relatively strong—favor gentle, barrier-friendly steps.'
        : ' Признаки чувствительности заметнее — бережный уход и барьер важны.'
      : s2 < -1.5
        ? isEn
          ? ' Sensitivity scores are on the lower side—skin may tolerate actives a bit more easily (still introduce slowly).'
          : ' Чувствительность по опросу ниже — кожа может терпимее относиться к активам (всё равно вводите постепенно).'
        : isEn
          ? ' Sensitivity sits in a moderate range.'
          : ' Чувствительность в умеренном диапазоне.';

  const pig =
    s3 > 1.5
      ? isEn
        ? ' Pigment-related answers suggest tone unevenness or spots are on your radar—SPF and steady brightening support help.'
        : ' По пигментному блоку заметен акцент на неровный тон/пятна — SPF и ровный уход с осветлением уместны.'
      : isEn
        ? ' Pigment axis from the questionnaire is not strongly shifted.'
        : ' Пигментная ось по опроснику без сильного сдвига.';

  const wr =
    s4 > 1.5
      ? isEn
        ? ' Lines and firmness answers lean toward more age-related change—consistency and protection matter.'
        : ' По блоку морщин/упругости есть сдвиг к возрастным изменениям — регулярность и защита важны.'
      : isEn
        ? ' Wrinkle/firmness scores are mild to moderate from the questionnaire.'
        : ' По морщинам/упругости по опроснику картина умеренная.';

  let selfie = '';
  let rPhoto = 0;
  let oPhoto = 0;
  if (skinMetrics && typeof skinMetrics === 'object') {
    rPhoto = Math.max(0, Math.min(100, Number(skinMetrics.redness_index) || 0));
    const p = Math.max(0, Math.min(100, Number(skinMetrics.pigment_unevenness) || 0));
    const t = Math.max(0, Math.min(100, Number(skinMetrics.texture_roughness) || 0));
    oPhoto = Math.max(0, Math.min(100, Number(skinMetrics.oiliness_index) || 0));
    if (isEn) {
      selfie = ` From your selfie, ${selfieBandPhrase('redness', rPhoto, true)}, ${selfieBandPhrase('pigment', p, true)}, ${selfieBandPhrase('texture', t, true)}, and ${selfieBandPhrase('oil', oPhoto, true)}—together with the Baumann chart above, not as a standalone diagnosis.`;
    } else {
      selfie = ` По селфи: ${selfieBandPhrase('redness', rPhoto, false)}, ${selfieBandPhrase('pigment', p, false)}, ${selfieBandPhrase('texture', t, false)}, ${selfieBandPhrase('oil', oPhoto, false)} — вместе с диаграммой Baumann выше, не как отдельный диагноз.`;
    }
  }

  const concern = String(concernText ?? '').toLowerCase().trim();
  let concernBlock = '';
  if (concern) {
    const wantsWrinkle = /морщин|wrinkle|line|aging|탄력|주름/.test(concern);
    const wantsPigment = /пигмент|пятн|melasma|freckle|spot|tone|기미|색소|잡티/.test(concern);
    const notes: string[] = [];
    if (wantsWrinkle) {
      if (s4 > 1.5) {
        notes.push(
          isEn
            ? 'Your concern about lines is supported by the wrinkle/firmness axis trend.'
            : 'Ваш запрос по морщинам подтверждается тенденцией по оси морщины/упругость.',
        );
      } else {
        notes.push(
          isEn
            ? 'Your concern about lines is understandable, though the questionnaire does not show a strong wrinkle tendency yet.'
            : 'Ваш запрос по морщинам понятен, хотя опросник пока не показывает сильного сдвига по этой оси.',
        );
      }
    }
    if (wantsPigment) {
      if (s3 > 1.5) {
        notes.push(
          isEn
            ? 'Pigment-related concern is also reflected by the pigmentation axis in your answers.'
            : 'Запрос по пигментации также отражён в пигментной оси по вашим ответам.',
        );
      } else {
        notes.push(
          isEn
            ? 'Pigmentation concern is noted, but the questionnaire shift on that axis is moderate.'
            : 'Запрос по пигментации учтён, но сдвиг по этой оси в опроснике умеренный.',
        );
      }
    }
    if (notes.length > 0) {
      concernBlock = isEn ? ` Concern note: ${notes.join(' ')}` : ` По вашему запросу: ${notes.join(' ')}`;
    }
  }

  return `${dryOil}${sens} ${pig} ${wr}${selfie}${concernBlock}`.replace(/\s+/g, ' ').trim();
}
