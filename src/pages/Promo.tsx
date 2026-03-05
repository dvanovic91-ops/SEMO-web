import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

type PromoItem = {
  id: string;
  title: string;
  image_url: string | null;
  end_at: string | null;
  sort_order: number;
};

/** 한 화면에 보이는 배너 개수 (Shop과 동일하게 transform 캐러셀, 스크롤바 없음) */
const VISIBLE = 3;
const itemWidthPercent = 100 / VISIBLE;

/**
 * Promo 전용 페이지 — 모바일 메뉴 등에서 진입 시 현재 진행 중인 이벤트 배너를 캐러셀로 표시.
 * Shop과 동일하게 overflow-hidden + transform으로 스크롤바 없음.
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
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Текущие акции
      </h1>
      <p className="mb-2 text-slate-600">
        Специальные предложения и события SEMO box
      </p>

      {loading ? (
        <p className="py-12 text-center text-slate-500">Загрузка…</p>
      ) : promos.length === 0 ? (
        <p className="py-12 text-center text-slate-500">Нет активных акций.</p>
      ) : (
        /* 검은 사각형 영역: 올린 값(8rem)의 절반(4rem)만큼 아래로 */
        <section className="relative mt-0 pt-16">
          <div
            className="overflow-hidden px-12 md:px-16"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div
              className="flex transition-[transform] duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
              style={{ transform: `translateX(-${carouselIndex * itemWidthPercent}%)` }}
            >
              {promos.map((p) => (
                <div
                  key={p.id}
                  className="flex shrink-0 flex-col px-2 sm:px-3"
                  style={{ width: `${itemWidthPercent}%` }}
                >
                  <h2 className="mb-1 text-center text-sm font-semibold text-slate-900 sm:text-base">{p.title}</h2>
                  <div className="relative h-[38vh] max-h-[220px] w-full overflow-hidden rounded-2xl bg-slate-100 sm:max-h-[260px]">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-400">Изображение</div>
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
                className="absolute left-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30 md:flex md:items-center md:justify-center"
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
                className="absolute right-0 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 rounded-full border border-slate-200 bg-white shadow-md transition hover:bg-slate-50 disabled:opacity-30 md:flex md:items-center md:justify-center"
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
      )}
    </main>
  );
};
