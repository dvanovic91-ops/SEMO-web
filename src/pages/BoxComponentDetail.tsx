import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';
import { BackArrow } from '../components/BackArrow';
import {
  fetchIngredientLibraryMap,
  lookupIngredientLibraryRow,
  normalizeInciKey,
  type IngredientLibraryRow,
} from '../lib/ingredientLibrary';
import { formatInciNameForDisplay, parseSkuIngredientsJson, type SkuIngredientLine } from '../lib/skuIngredientsParse';
import { formatProductTypeForLanguage } from '../lib/productTypeStoreLabels';
import { mergeSkuLocalizedDescriptions, stripHeroBulletLines } from '../lib/skuMarketingDescriptions';
import { formatStorefrontLineTitle, resolveSkuStorefrontName } from '../lib/skuStorefrontTitle';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';

const KEY_SPOTLIGHT_MAX = 5;

/** 키 하이라이트 자동 보충 시 제외 — 물·베이스 보습제·다용도 글리콜 등 */
const SPOTLIGHT_SKIP_INCI_BASE = new Set([
  'aqua',
  'water',
  'eau',
  'h2o',
  'glycerin',
  'glycerol',
  'butylene glycol',
  'propylene glycol',
  'dipropylene glycol',
  'pentylene glycol',
  'hexylene glycol',
  'isopentyldiol',
]);

function isInciBulkBaseSkipForSpotlight(line: SkuIngredientLine): boolean {
  const k = line.name_lower.trim().toLowerCase();
  const base = k.split(/\s*\(/)[0]?.trim().toLowerCase() ?? '';
  if (!base) return false;
  if (SPOTLIGHT_SKIP_INCI_BASE.has(base)) return true;
  if (/^(purified|distilled|deionized)\s+water$/.test(base)) return true;
  if (k.startsWith('정제수') || /\b정제수\b/.test(k)) return true;
  return false;
}

function storefrontLibRole(
  row: IngredientLibraryRow | undefined,
  isEn: boolean,
  language: string,
): string {
  if (!row) return '';
  let text = '';
  if (isEn) text = row.description_en?.trim() || row.description_ko?.trim() || '';
  else if (language === 'ru') text = row.description_ru?.trim() || row.description_en?.trim() || row.description_ko?.trim() || '';
  else text = row.description_ko?.trim() || row.description_en?.trim() || '';
  if (text) return text;
  const tags = row.benefit_tags?.filter(Boolean) ?? [];
  if (tags.length > 0) return tags.join(' · ');
  return '';
}

type TabKey = 'info' | 'ingredients' | 'usage';

type SkuHeroRow = { name: string; ko: string; en: string; ru: string };

type SkuStorefrontRow = {
  id: string;
  name: string;
  display_name: string | null;
  image_url: string | null;
  volume_label: string | null;
  how_to_use: string | null;
  how_to_use_en: string | null;
  how_to_use_ru: string | null;
  ingredients_json: unknown[] | null;
  ingredients_raw: string | null;
  key_ingredients_desc: SkuHeroRow[] | null;
  description: string | null;
  description_en: string | null;
  description_ru: string | null;
  brand: string | null;
  name_en: string | null;
  product_type: string | null;
  /** 생산지/원산지 — 비어 있으면 EN: Made in Korea, RU: Сделано в Корее */
  country_of_origin: string | null;
  is_active: boolean;
};

function normalizeHeroDesc(raw: unknown): SkuHeroRow[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) arr = p;
    } catch {
      return [];
    }
  } else return [];
  const out: SkuHeroRow[] = [];
  for (const x of arr) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.name !== 'string') continue;
    out.push({
      name: o.name,
      ko: typeof o.ko === 'string' ? o.ko : '',
      en: typeof o.en === 'string' ? o.en : '',
      ru: typeof o.ru === 'string' ? o.ru : '',
    });
  }
  return out;
}

const WIDE_MAIN_CLASS =
  'relative mx-auto min-h-0 min-w-0 max-w-[min(100%,46rem)] bg-gradient-to-b from-slate-50 via-white to-slate-50/80 px-4 py-8 sm:px-6 sm:py-10';
const WIDE_CARD_INNER = 'box-border px-4 py-5 sm:px-6 sm:py-6';
const CARD_SHELL =
  'overflow-hidden rounded-2xl bg-white shadow-[0_2px_24px_-12px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/40';
const SECTION_KICKER = 'text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-slate-400';

export const BoxComponentDetail: React.FC = () => {
  const { productId, skuId } = useParams<{ productId: string; skuId: string }>();
  const { language } = useI18n();
  const isEn = language === 'en';
  const tr = useCallback((en: string, ru: string) => (isEn ? en : ru), [isEn]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(null);
  const [sku, setSku] = useState<SkuStorefrontRow | null>(null);
  const [tab, setTab] = useState<TabKey>('info');
  const [showAllHeroes, setShowAllHeroes] = useState(false);
  /** false: 전체 INCI 블록 접힘(버튼만). true: 나머지 전체 목록 표시 */
  const [fullInciExpanded, setFullInciExpanded] = useState(false);
  const [ingredientLibMap, setIngredientLibMap] = useState<Map<string, IngredientLibraryRow>>(() => new Map());

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const pid = (productId ?? '').trim();
      const sid = (skuId ?? '').trim();
      if (!pid || !sid || !supabase) {
        setError(isEn ? 'Invalid link.' : 'Неверная ссылка.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const { data: linkRow, error: linkErr } = await supabase
          .from('product_components')
          .select('id')
          .eq('product_id', pid)
          .eq('sku_id', sid)
          .maybeSingle();
        if (cancelled) return;
        if (linkErr || !linkRow) {
          setError(isEn ? 'This item is not part of this set.' : 'Этот товар не входит в данный набор.');
          setSku(null);
          setLoading(false);
          return;
        }

        const { data: prodRow } = await supabase.from('products').select('name').eq('id', pid).maybeSingle();
        if (!cancelled && prodRow && typeof (prodRow as { name?: string }).name === 'string') {
          setProductName((prodRow as { name: string }).name);
        }

        const { data: skuRow, error: skuErr } = await supabase
          .from('sku_items')
          .select(
            'id, name, display_name, image_url, volume_label, how_to_use, how_to_use_en, how_to_use_ru, ingredients_json, ingredients_raw, key_ingredients_desc, description, description_en, description_ru, brand, name_en, product_type, country_of_origin, is_active',
          )
          .eq('id', sid)
          .maybeSingle();

        if (cancelled) return;
        if (skuErr || !skuRow || !(skuRow as { is_active?: boolean }).is_active) {
          setError(isEn ? 'Product is unavailable.' : 'Товар недоступен.');
          setSku(null);
        } else {
          const r = skuRow as Record<string, unknown>;
          setSku({
            id: String(r.id),
            name: String(r.name ?? ''),
            display_name: (r.display_name as string | null) ?? null,
            image_url: (r.image_url as string | null) ?? null,
            volume_label: (r.volume_label as string | null) ?? null,
            how_to_use: (r.how_to_use as string | null) ?? null,
            how_to_use_en: (r.how_to_use_en as string | null) ?? null,
            how_to_use_ru: (r.how_to_use_ru as string | null) ?? null,
            ingredients_json: Array.isArray(r.ingredients_json) ? (r.ingredients_json as unknown[]) : null,
            ingredients_raw: (r.ingredients_raw as string | null) ?? null,
            key_ingredients_desc: normalizeHeroDesc(r.key_ingredients_desc),
            description: (r.description as string | null) ?? null,
            description_en: (r.description_en as string | null) ?? null,
            description_ru: (r.description_ru as string | null) ?? null,
            brand: (r.brand as string | null) ?? null,
            name_en: (r.name_en as string | null) ?? null,
            product_type: (r.product_type as string | null) ?? null,
            country_of_origin: (r.country_of_origin as string | null) ?? null,
            is_active: Boolean(r.is_active),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [productId, skuId, isEn]);

  useEffect(() => {
    setShowAllHeroes(false);
    setFullInciExpanded(false);
  }, [skuId]);

  const ingredientLines = useMemo(() => {
    if (!sku?.ingredients_json) return [];
    return parseSkuIngredientsJson(sku.ingredients_json).sort((a, b) => a.position - b.position);
  }, [sku]);

  useEffect(() => {
    let cancelled = false;
    if (!supabase || ingredientLines.length === 0) {
      setIngredientLibMap(new Map());
      return () => {
        cancelled = true;
      };
    }
    const keys = ingredientLines.map((l) => normalizeInciKey(l.name, l.name_lower));
    void (async () => {
      const map = await fetchIngredientLibraryMap(supabase, keys);
      if (!cancelled) setIngredientLibMap(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [sku?.id, ingredientLines]);

  /** 대제목: 상품명만 — 브랜드는 아래 소제목 */
  const title = useMemo(() => {
    const raw = resolveSkuStorefrontName({
      display_name: sku?.display_name,
      name_en: sku?.name_en,
      name: sku?.name,
      language,
    });
    return formatStorefrontLineTitle(raw);
  }, [sku?.display_name, sku?.name_en, sku?.name, language]);

  const brandSubtitle = useMemo(() => {
    const b = (sku?.brand ?? '').trim();
    return b ? formatStorefrontLineTitle(b) : null;
  }, [sku?.brand]);

  const mergedDesc = useMemo(() => {
    if (!sku) return { ko: null as string | null, en: null as string | null, ru: null as string | null };
    return mergeSkuLocalizedDescriptions({
      description: sku.description,
      description_en: sku.description_en,
      description_ru: sku.description_ru,
      key_ingredients_desc: sku.key_ingredients_desc,
    });
  }, [sku]);

  const descForLangRaw = isEn ? mergedDesc.en ?? mergedDesc.ko : mergedDesc.ru ?? mergedDesc.ko;
  const descForLangAbout = useMemo(() => {
    const t = (descForLangRaw ?? '').trim();
    if (!t) return '';
    return stripHeroBulletLines(t);
  }, [descForLangRaw]);

  const heroRows = useMemo(
    () => (sku?.key_ingredients_desc ?? []).filter((h) => h.name && h.name !== '__claim__'),
    [sku],
  );

  const supplementalInciLines = useMemo(() => {
    if (ingredientLines.length === 0) return [] as SkuIngredientLine[];
    if (heroRows.length >= KEY_SPOTLIGHT_MAX) return [];
    const used = new Set(heroRows.map((h) => h.name.trim().toLowerCase()));
    const need = KEY_SPOTLIGHT_MAX - heroRows.length;
    const out: SkuIngredientLine[] = [];
    for (const line of ingredientLines) {
      if (out.length >= need) break;
      if (isInciBulkBaseSkipForSpotlight(line)) continue;
      const k = line.name_lower.trim().toLowerCase();
      if (used.has(k)) continue;
      used.add(k);
      out.push(line);
    }
    return out;
  }, [heroRows, ingredientLines]);

  type SpotlightItem = { kind: 'hero'; hero: SkuHeroRow } | { kind: 'inci'; line: SkuIngredientLine };

  const spotlightAllItems = useMemo((): SpotlightItem[] => {
    const fromHeroes: SpotlightItem[] = heroRows.map((h) => ({ kind: 'hero' as const, hero: h }));
    if (heroRows.length >= KEY_SPOTLIGHT_MAX) return fromHeroes;
    const fromInci: SpotlightItem[] = supplementalInciLines.map((line) => ({ kind: 'inci' as const, line }));
    return [...fromHeroes, ...fromInci];
  }, [heroRows, supplementalInciLines]);

  const spotlightNeedsExpand = heroRows.length > KEY_SPOTLIGHT_MAX;
  const spotlightVisibleItems = useMemo(() => {
    if (!spotlightNeedsExpand || showAllHeroes) return spotlightAllItems;
    return spotlightAllItems.slice(0, KEY_SPOTLIGHT_MAX);
  }, [spotlightAllItems, spotlightNeedsExpand, showAllHeroes]);

  const heroBlurb = useCallback(
    (h: SkuHeroRow) => {
      if (isEn) return (h.en?.trim() || h.ko?.trim() || '').trim();
      return (h.ru?.trim() || h.ko?.trim() || '').trim();
    },
    [isEn],
  );

  /** 상단 스포트라이트에 올린 성분은 전체 목록에서 제외(중복 방지) */
  const fullListExcludeLowerSet = useMemo(() => {
    const s = new Set<string>();
    for (const h of heroRows) s.add(h.name.trim().toLowerCase());
    for (const line of supplementalInciLines) s.add(line.name_lower.trim().toLowerCase());
    return s;
  }, [heroRows, supplementalInciLines]);

  const ingredientLinesFullDisplay = useMemo(() => {
    if (ingredientLines.length === 0) return [];
    return ingredientLines.filter((line) => !fullListExcludeLowerSet.has(line.name_lower.trim().toLowerCase()));
  }, [ingredientLines, fullListExcludeLowerSet]);

  const howToText = useMemo(() => {
    if (!sku) return '';
    if (isEn) return (sku.how_to_use_en ?? sku.how_to_use ?? '').trim();
    if (language === 'ru') return (sku.how_to_use_ru ?? sku.how_to_use ?? '').trim();
    return (sku.how_to_use ?? '').trim();
  }, [sku, isEn, language]);

  const shelfLifeLine = useMemo(() => {
    if (language === 'en') {
      return '3 years from the manufacturing date (1 year after opening).';
    }
    if (language === 'ru') {
      return '3 года с даты изготовления (1 год после вскрытия).';
    }
    return '제조일 이후 3년 (개봉 후 1년)';
  }, [language]);

  if (loading) {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }

  if (error || !sku) {
    return (
      <main className={WIDE_MAIN_CLASS}>
        <p className="text-slate-600">{error ?? tr('Not found.', 'Не найдено.')}</p>
        <p className="mt-4">
          <Link
            to={`/product/${productId ?? ''}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"
          >
            <BackArrow /> {tr('Back to set', 'К набору')}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className={WIDE_MAIN_CLASS}>
      <p className="mb-8">
        <Link
          to={`/product/${productId ?? ''}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-brand"
        >
          <BackArrow />{' '}
          {productName ? (isEn ? `Back to «${productName}»` : `«${productName}»`) : tr('Back to set', 'К набору')}
        </Link>
      </p>

      <article className="space-y-6">
        <header className="text-center">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
          {brandSubtitle ? (
            <p className="mt-2 text-[13px] leading-snug text-slate-500">{brandSubtitle}</p>
          ) : null}
        </header>

        <div className={`mx-auto w-full max-w-sm ${CARD_SHELL}`}>
          <div className="aspect-square w-full bg-gradient-to-br from-slate-100 to-slate-50">
            {sku.image_url ? (
              <img src={sku.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-slate-300">—</div>
            )}
          </div>
        </div>

        {descForLangAbout && (
          <div className={CARD_SHELL}>
            <div className={`bg-white ${WIDE_CARD_INNER}`}>
              <p className={SECTION_KICKER}>{tr('About this item', 'О продукте')}</p>
              <p className="mt-3 max-w-none whitespace-pre-line text-[15px] leading-[1.65] text-slate-600 text-pretty">
                {descForLangAbout}
              </p>
            </div>
          </div>
        )}

        <div className={CARD_SHELL}>
          <div className={`bg-white ${WIDE_CARD_INNER}`}>
            <div
              className="mb-6 flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1 ring-1 ring-slate-200/50"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'info'}
                onClick={() => setTab('info')}
                className={`min-h-[2.5rem] flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-[13px] ${
                  tab === 'info'
                    ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr('Basics', 'Основное')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'ingredients'}
                onClick={() => setTab('ingredients')}
                className={`min-h-[2.5rem] flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-[13px] ${
                  tab === 'ingredients'
                    ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr('Ingredients', 'Состав')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'usage'}
                onClick={() => setTab('usage')}
                className={`min-h-[2.5rem] flex-1 rounded-lg px-3 py-2 text-center text-xs font-semibold transition sm:text-[13px] ${
                  tab === 'usage'
                    ? 'bg-white text-brand shadow-sm ring-1 ring-slate-200/80'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {tr('How to use', 'Применение')}
              </button>
            </div>

            {tab === 'info' && (
              <div className="space-y-3">
                <section className="rounded-xl bg-slate-50/90 px-4 py-4 ring-1 ring-slate-100">
                  <h3 className={SECTION_KICKER}>{tr('Volume', 'Объём')}</h3>
                  <p className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
                    {sku.volume_label?.trim() ? sku.volume_label.trim() : tr('—', '—')}
                  </p>
                </section>
                <section className="rounded-xl bg-slate-50/90 px-4 py-4 ring-1 ring-slate-100">
                  <h3 className={SECTION_KICKER}>{tr('Shelf life', 'Срок годности')}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-600">{shelfLifeLine}</p>
                </section>
                <section className="rounded-xl bg-slate-50/90 px-4 py-4 ring-1 ring-slate-100">
                  <h3 className={SECTION_KICKER}>{tr('Product', 'Продукт')}</h3>
                  <dl className="mt-3 space-y-3.5">
                    {sku.brand?.trim() ? (
                      <div className="grid gap-0.5 sm:grid-cols-[minmax(0,6.5rem)_1fr] sm:items-baseline sm:gap-x-5">
                        <dt className="text-[11px] font-medium text-slate-400">{tr('Brand', 'Бренд')}</dt>
                        <dd className="text-sm font-medium text-slate-800">{sku.brand.trim()}</dd>
                      </div>
                    ) : null}
                    {sku.product_type?.trim() ? (
                      <div className="grid gap-0.5 sm:grid-cols-[minmax(0,6.5rem)_1fr] sm:items-baseline sm:gap-x-5">
                        <dt className="text-[11px] font-medium text-slate-400">{tr('Type', 'Тип')}</dt>
                        <dd className="text-sm font-medium text-slate-800">
                          {formatProductTypeForLanguage(sku.product_type, language)}
                        </dd>
                      </div>
                    ) : null}
                    {sku.name_en?.trim() ? (
                      <div className="grid gap-0.5 sm:grid-cols-[minmax(0,6.5rem)_1fr] sm:items-baseline sm:gap-x-5">
                        <dt className="text-[11px] font-medium text-slate-400">{tr('Name (EN)', 'Название (EN)')}</dt>
                        <dd className="text-sm font-medium text-slate-800">{sku.name_en.trim()}</dd>
                      </div>
                    ) : null}
                    <div className="grid gap-0.5 sm:grid-cols-[minmax(0,6.5rem)_1fr] sm:items-baseline sm:gap-x-5">
                      <dt className="text-[11px] font-medium text-slate-400">
                        {tr('Place of origin', 'Страна производства')}
                      </dt>
                      <dd className="text-sm font-medium text-slate-800">
                        {sku.country_of_origin?.trim()
                          ? sku.country_of_origin.trim()
                          : tr('Made in Korea', 'Сделано в Корее')}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>
            )}

            {tab === 'ingredients' && (
              <div className="space-y-7">
                {spotlightAllItems.length > 0 ? (
                  <section className="rounded-2xl bg-gradient-to-b from-amber-50/50 via-white to-white px-1 pb-1 pt-1 ring-1 ring-amber-100/60 sm:px-2">
                    <h3 className={`${SECTION_KICKER} px-3 pt-3 sm:px-4 sm:pt-4`}>
                      {tr('Key highlights', 'Ключевые акценты')}
                    </h3>
                    <ul className="mt-3 space-y-2.5 px-2 pb-3 sm:px-3 sm:pb-4">
                      {spotlightVisibleItems.map((item) => {
                        if (item.kind === 'hero') {
                          const h = item.hero;
                          const blurb =
                            heroBlurb(h) ||
                            storefrontLibRole(
                              lookupIngredientLibraryRow(ingredientLibMap, h.name, h.name.toLowerCase()),
                              isEn,
                              language,
                            );
                          return (
                            <li
                              key={`hero-${h.name}`}
                              className="rounded-xl bg-white/90 px-3.5 py-3.5 shadow-sm ring-1 ring-slate-100/90 backdrop-blur-[2px]"
                            >
                              <div className="flex gap-3">
                                <span
                                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100/90 text-[15px] leading-none shadow-inner shadow-amber-200/30"
                                  aria-hidden
                                >
                                  ✨
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[15px] font-semibold tracking-tight text-slate-900">
                                    {formatInciNameForDisplay(h.name)}
                                  </p>
                                  {blurb ? (
                                    <p className="mt-2 text-[13px] leading-relaxed text-slate-600 text-pretty">
                                      {blurb}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        }
                        const { line } = item;
                        const libRow = lookupIngredientLibraryRow(ingredientLibMap, line.name, line.name_lower);
                        const role = storefrontLibRole(libRow, isEn, language);
                        return (
                          <li
                            key={`inci-${line.position}-${line.name_lower}`}
                            className="rounded-xl bg-white/90 px-3.5 py-3.5 shadow-sm ring-1 ring-slate-100/90 backdrop-blur-[2px]"
                          >
                            <div className="flex gap-3">
                              <span
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100/90 text-[15px] leading-none shadow-inner shadow-amber-200/30"
                                aria-hidden
                              >
                                ✨
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-semibold tracking-tight text-slate-900">
                                  {formatInciNameForDisplay(line.name)}
                                </p>
                                {role ? (
                                  <p className="mt-2 text-[13px] leading-relaxed text-slate-600 text-pretty">{role}</p>
                                ) : null}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {spotlightNeedsExpand ? (
                      <div className="px-3 pb-3 sm:px-4">
                        <button
                          type="button"
                          onClick={() => setShowAllHeroes((v) => !v)}
                          className="w-full rounded-full bg-white py-2.5 text-center text-xs font-semibold text-brand ring-1 ring-brand/20 transition hover:bg-brand/5 sm:w-auto sm:px-5"
                        >
                          {showAllHeroes ? tr('Show less', 'Свернуть') : tr('Show more', 'Показать ещё')}
                        </button>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                <section className="rounded-xl bg-slate-50/80 px-4 py-4 ring-1 ring-slate-100">
                  <h3 className={SECTION_KICKER}>{tr('Full ingredient list', 'Полный состав')}</h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                    {tr('Expand below to see the rest of the formula.', 'Ниже можно развернуть остальной состав.')}
                  </p>
                  {ingredientLinesFullDisplay.length > 0 ? (
                    <>
                      {!fullInciExpanded ? (
                        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-white px-4 py-4 ring-1 ring-slate-200/60 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                          <p className="text-sm text-slate-600">
                            {tr(
                              `${ingredientLinesFullDisplay.length} more ingredients hidden.`,
                              `Ещё ${ingredientLinesFullDisplay.length} компонентов скрыто.`,
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => setFullInciExpanded(true)}
                            className="shrink-0 rounded-full bg-brand px-5 py-2.5 text-center text-xs font-semibold text-white shadow-sm transition hover:opacity-90"
                          >
                            {tr('Show full list', 'Показать полный состав')}
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setFullInciExpanded(false)}
                            className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50"
                          >
                            {tr('Hide full list', 'Свернуть список')}
                          </button>
                          <ul className="mt-4 list-none space-y-1.5 pl-0">
                            {ingredientLinesFullDisplay.map((line) => {
                              const libRow = lookupIngredientLibraryRow(ingredientLibMap, line.name, line.name_lower);
                              const role = storefrontLibRole(libRow, isEn, language);
                              return (
                                <li
                                  key={`${line.position}-${line.name_lower}`}
                                  className="flex gap-3 rounded-lg py-2 pl-1 pr-2 text-sm leading-snug transition hover:bg-white/80"
                                >
                                  <span
                                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand/50"
                                    aria-hidden
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-900">
                                      {formatInciNameForDisplay(line.name)}
                                    </p>
                                    {role ? (
                                      <p className="mt-1 text-[12px] leading-relaxed text-slate-500 text-pretty">
                                        {role}
                                      </p>
                                    ) : null}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}
                    </>
                  ) : ingredientLines.length > 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      {tr(
                        'The full formula is already shown in the highlights above.',
                        'Весь состав уже показан в блоке выше.',
                      )}
                    </p>
                  ) : sku.ingredients_raw?.trim() ? (
                    <p className="mt-4 max-w-none whitespace-pre-wrap break-words rounded-lg bg-white/80 px-3 py-3 font-mono text-xs leading-relaxed text-slate-600 ring-1 ring-slate-100">
                      {sku.ingredients_raw.trim()}
                    </p>
                  ) : spotlightAllItems.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">
                      {tr('Ingredient list will be added soon.', 'Состав будет добавлен позже.')}
                    </p>
                  ) : null}
                </section>
              </div>
            )}

            {tab === 'usage' && (
              <div className="rounded-xl bg-slate-50/90 px-4 py-4 ring-1 ring-slate-100">
                {howToText ? (
                  <p className="whitespace-pre-line text-[15px] leading-[1.65] text-slate-600 text-pretty">
                    {howToText}
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    {tr(
                      'Usage instructions will be added soon.',
                      'Инструкция по применению будет добавлена позже.',
                    )}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </article>
    </main>
  );
};
