import React, { useState } from 'react';
import { PRODUCT_DETAIL_WHITE_CARD_INNER } from '../lib/productDetailSectionClasses';

/** 상세·피부테스트 결과에서 동일하게 쓰는 구성품 한 줄 */
export type ProductCompositionItem = {
  id: string;
  name: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  description?: string | null;
};

function getComponentImageUrls(comp: ProductCompositionItem): string[] {
  if (comp.image_urls && Array.isArray(comp.image_urls) && comp.image_urls.length > 0) return comp.image_urls;
  return comp.image_url ? [comp.image_url] : [];
}

type Props = {
  components: ProductCompositionItem[];
  /** 바깥 흰 카드에 붙는 여백 등 (기본 mt-6, 상세 헤더 카드와 동일) */
  className?: string;
  /** true일 때만 «Состав набора» 제목을 모바일에서 1pt 작게 (데스크톱은 text-xs 유지) */
  tighterMobileComposeTitle?: boolean;
};

/**
 * «Состав набора» + 키 인그리디언트 토글 — ProductDetail·SkinTest 동일 UX.
 * 모바일: «Ключевые ингредиенты» + 펼침/접힘 화살표(한 줄) · sm+: 기존 «Смотреть/Скрыть…» 문구.
 */
export function ProductCompositionGrid({ components, className, tighterMobileComposeTitle = false }: Props) {
  const [ingredientPanelOpen, setIngredientPanelOpen] = useState(false);

  if (components.length === 0) return null;

  const outer = className ?? 'mt-6';
  const shown = components.slice(0, 8);
  const n = shown.length;
  /** 6: sm+ 한 줄(6열) · 7: 4+3 · 8: md까지 4+4, lg+ 한 줄 8열 */
  const compactGridClass =
    n <= 6
      ? 'grid grid-cols-3 gap-2.5 sm:grid-cols-6 sm:gap-3'
      : n === 7
        ? 'grid grid-cols-4 gap-2.5 sm:gap-3'
        : 'grid grid-cols-4 gap-2.5 sm:gap-3 lg:grid-cols-8 lg:gap-2';

  return (
    <div
      className={`${outer} overflow-hidden rounded-2xl bg-white shadow-[0_1px_10px_-6px_rgba(15,23,42,0.2)] ring-1 ring-slate-200/70`}
    >
      <div className={`bg-white ${PRODUCT_DETAIL_WHITE_CARD_INNER}`}>
        <div className="relative mb-6">
          <p
            className={`text-left font-medium uppercase tracking-wider text-slate-500 ${
              tighterMobileComposeTitle ? 'text-[calc(0.75rem-1pt)] sm:text-xs' : 'text-xs'
            }`}
          >
            Состав набора
          </p>
          <button
            type="button"
            onClick={() => setIngredientPanelOpen((v) => !v)}
            aria-expanded={ingredientPanelOpen}
            className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center justify-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium leading-none text-slate-500 transition hover:border-slate-400 hover:text-slate-600 max-sm:max-w-[min(100%,14rem)] max-sm:min-h-[2.5rem] max-sm:px-3 max-sm:py-2 max-sm:whitespace-nowrap sm:w-[17rem] sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-xs sm:leading-snug sm:whitespace-nowrap"
          >
            {/* 모바일: «Ключевые ингредиенты» + 펼침/접힘 화살표만 (한 줄) */}
            <span className="inline-flex items-center gap-1 sm:hidden">
              <span>Ключевые ингредиенты</span>
              {ingredientPanelOpen ? (
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </span>
            {/* 태블릿+: 기존 문구 유지 */}
            <span className="hidden text-center sm:inline">
              {ingredientPanelOpen ? 'Скрыть ключевые ингредиенты' : 'Смотреть ключевые ингредиенты'}
            </span>
          </button>
        </div>

        {!ingredientPanelOpen ? (
          <div className={compactGridClass}>
            {shown.map((comp) => {
              const imgs = getComponentImageUrls(comp);
              const firstImg = imgs[0];
              return (
                <div key={comp.id} className="flex flex-col items-center">
                  <div className="aspect-square w-full overflow-hidden rounded-xl bg-slate-50">
                    {firstImg ? (
                      <img src={firstImg} alt={comp.name ?? ''} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300 text-xs">—</div>
                    )}
                  </div>
                  {comp.name && (
                    <p className="mt-1.5 line-clamp-2 text-center text-[calc(11px-1pt)] font-medium text-slate-700 sm:text-xs">
                      {comp.name}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2.5">
              {components.slice(0, 8).map((comp) => {
                const imgs = getComponentImageUrls(comp);
                const firstImg = imgs[0];
                const fallbackText = comp.description?.trim()
                  ? comp.description
                  : 'Описание появится позже.';
                const isLongFallback = fallbackText.length > 90;
                const useTopAlign = isLongFallback;
                return (
                  <div
                    key={`row-${comp.id}`}
                    className="grid grid-cols-[102px_1fr] items-start gap-3 sm:grid-cols-[128px_1fr] md:grid-cols-[176px_1fr]"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-slate-50">
                      {firstImg ? (
                        <img src={firstImg} alt={comp.name ?? ''} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300 text-xs">—</div>
                      )}
                    </div>
                    {/* 모바일: 박스(테두리) 없음 · 제목/설명: 모바일 +1vw · sm+ 데스크톱 +2vw */}
                    <article className="grid h-full min-h-[6.25rem] grid-rows-[auto_1fr] translate-x-[1vw] p-0 sm:min-h-[7rem] md:min-h-[6.75rem] md:translate-x-[2vw]">
                      <p className="text-[calc(13px-1pt)] font-semibold text-slate-900 sm:text-sm">{comp.name ?? 'Компонент'}</p>
                      <div className={`mt-3 flex ${useTopAlign ? 'items-start' : 'items-center'}`}>
                        <p className="whitespace-pre-line text-[calc(0.75rem-1pt)] leading-relaxed text-slate-500 sm:text-xs">
                          {fallbackText}
                        </p>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
