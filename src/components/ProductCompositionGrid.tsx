import React, { useState } from 'react';

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
};

/**
 * «Состав набора» + «Смотреть ключевые ингредиенты» 토글 — ProductDetail과 동일 UX.
 */
export function ProductCompositionGrid({ components, className }: Props) {
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
      <div className="border-t border-slate-100 bg-white px-2.5 py-3 sm:px-6 sm:py-5">
        {/* 섹션 제목·토글: 가운데 정렬(모바일 세로 / sm+ 한 줄) */}
        <div className="mb-3 flex flex-col items-center gap-2.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-4 sm:gap-y-2">
          <p className="text-center text-xs font-medium uppercase tracking-wider text-slate-500">
            Состав набора
          </p>
          <button
            type="button"
            onClick={() => setIngredientPanelOpen((v) => !v)}
            className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1.5 text-center text-[11px] font-medium leading-tight text-slate-500 transition hover:border-slate-400 hover:text-slate-600 sm:w-auto sm:px-3 sm:text-xs sm:leading-snug"
          >
            <span className="block sm:hidden">
              {ingredientPanelOpen ? (
                <>
                  Скрыть ключевые
                  <br />
                  ингредиенты
                </>
              ) : (
                <>
                  Смотреть ключевые
                  <br />
                  ингредиенты
                </>
              )}
            </span>
            <span className="hidden sm:inline">
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
                    <p className="mt-1.5 line-clamp-2 text-center text-[11px] font-medium text-slate-700 sm:text-xs">
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
                    className="grid grid-cols-[minmax(4.5rem,5.25rem)_1fr] items-start gap-2 sm:grid-cols-[128px_1fr] sm:gap-3 md:grid-cols-[176px_1fr]"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-slate-50">
                      {firstImg ? (
                        <img src={firstImg} alt={comp.name ?? ''} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-slate-300 text-xs">—</div>
                      )}
                    </div>
                    <article className="grid h-full min-h-[6.25rem] grid-rows-[auto_1fr] rounded-xl border border-slate-200 bg-white p-2.5 sm:min-h-[7rem] md:min-h-[6.75rem]">
                      <p className="text-[13px] font-semibold text-slate-900 sm:text-sm">{comp.name ?? 'Компонент'}</p>
                      <div className={`mt-3 flex ${useTopAlign ? 'items-start' : 'items-center'}`}>
                        <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">{fallbackText}</p>
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
