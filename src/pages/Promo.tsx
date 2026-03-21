import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type PromoItem = {
  id: string;
  title: string;
  image_url: string | null;
  end_at: string | null;
  sort_order: number;
};

/** 데스크톱 캐러셀: 한 화면에 보이는 배너 개수 */
const VISIBLE = 3;
const itemWidthPercent = 100 / VISIBLE;

function PromoCard({
  p,
  className = '',
}: {
  p: PromoItem;
  className?: string;
}) {
  return (
    <article
      className={`flex flex-col rounded-2xl border border-slate-100 bg-white shadow-sm ${className}`}
    >
      <h2 className="mb-2 px-3 pt-4 text-center text-sm font-semibold text-slate-900 sm:text-base">{p.title}</h2>
      {/* 업로드 비율 그대로 표시 — 고정 프레임·object-contain으로 생기던 회색 여백 제거 */}
      <div className="relative mb-3 w-full overflow-hidden rounded-xl bg-slate-100">
        {p.image_url ? (
          <img src={p.image_url} alt="" className="block h-auto w-full" />
        ) : (
          <div className="flex min-h-[140px] w-full items-center justify-center text-slate-400">Изображение</div>
        )}
      </div>
      <p className="px-3 pb-4 text-center text-xs text-slate-500">
        {p.end_at
          ? `До ${new Date(p.end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
          : 'Без срока'}
      </p>
    </article>
  );
}

/**
 * Promo 페이지 — 모바일: 세로 카드 스택 / md+: 가로 캐러셀 (스크롤바 숨김)
 */
export const Promo: React.FC = () => {
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (!supabase) {
      setPromos([]);
      setLoading(false);
      return;
    }
    supabase
      .from('promos')
      .select('id, title, image_url, end_at, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        setPromos((data as PromoItem[]) ?? []);
      })
      .catch(() => setPromos([]))
      .finally(() => setLoading(false));
  }, []);

  const maxIndex = Math.max(0, promos.length - VISIBLE);
  const goPrev = () => setCarouselIndex((i) => Math.max(0, i - 1));
  const goNext = () => setCarouselIndex((i) => Math.min(maxIndex, i + 1));

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) goPrev();
    else if (dx < -50) goNext();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 sm:py-12 sm:pb-12 sm:pt-8">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Текущие акции
      </h1>
      <p className="mb-6 text-slate-600">Специальные предложения и события SEMO box</p>

      {loading ? (
        <p className="py-12 text-center text-slate-500">Загрузка…</p>
      ) : promos.length === 0 ? (
        <p className="py-12 text-center text-slate-500">Нет активных акций.</p>
      ) : (
        <>
          {/* 모바일·소형 태블릿: 세로 카드 (캐러셀 깨짐 방지) */}
          <section className="flex flex-col gap-6 md:hidden">
            {promos.map((p) => (
              <PromoCard key={p.id} p={p} />
            ))}
          </section>

          {/* md 이상: 기존 캐러셀 */}
          <section className="relative hidden pt-4 md:block md:pt-8">
            <div className="overflow-hidden px-8 lg:px-12" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
              <div
                className="flex transition-[transform] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
                style={{ transform: `translateX(-${carouselIndex * itemWidthPercent}%)` }}
              >
                {promos.map((p) => (
                  <div
                    key={p.id}
                    className="flex shrink-0 flex-col px-[calc(0.5rem*1.15)] lg:px-[calc(0.75rem*1.15)]"
                    style={{ width: `${itemWidthPercent}%` }}
                  >
                    <h2 className="mb-1 text-center text-sm font-semibold text-slate-900 lg:text-base">{p.title}</h2>
                    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-100">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.title} className="block h-auto w-full" />
                      ) : (
                        <div className="flex min-h-[120px] w-full items-center justify-center text-slate-400">Изображение</div>
                      )}
                    </div>
                    <p className="mt-1.5 text-center text-xs text-slate-500">
                      {p.end_at
                        ? `До ${new Date(p.end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
                        : 'Без срока'}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {promos.length > VISIBLE && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={carouselIndex === 0}
                  className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30 lg:flex lg:items-center lg:justify-center"
                  aria-label="Предыдущие"
                >
                  <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={carouselIndex >= maxIndex}
                  className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30 lg:flex lg:items-center lg:justify-center"
                  aria-label="Следующие"
                >
                  <svg className="h-5 w-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </>
            )}

            {promos.length > VISIBLE && (
              <div className="mt-6 flex justify-center gap-2">
                {Array.from({ length: maxIndex + 1 }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCarouselIndex(i)}
                    className={`h-2 rounded-full transition ${
                      i === carouselIndex ? 'w-6 bg-brand' : 'w-2 bg-slate-200'
                    }`}
                    aria-label={`Слайд ${i + 1}`}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
};
