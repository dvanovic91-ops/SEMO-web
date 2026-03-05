import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type PromoItem = {
  id: string;
  title: string;
  image_url: string | null;
  end_at: string | null;
  sort_order: number;
};

/**
 * Promo 전용 페이지 — 모바일 메뉴 등에서 진입 시 현재 진행 중인 이벤트 배너를 가로 스크롤로 표시.
 */
export const Promo: React.FC = () => {
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="mb-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Текущие акции
      </h1>
      <p className="mb-8 text-slate-600">
        Специальные предложения и события SEMO box
      </p>

      {loading ? (
        <p className="py-12 text-center text-slate-500">Загрузка…</p>
      ) : promos.length === 0 ? (
        <p className="py-12 text-center text-slate-500">Нет активных акций.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-6 scroll-smooth md:gap-6" style={{ scrollbarWidth: 'thin' }}>
          {promos.map((p) => (
            <div
              key={p.id}
              className="flex w-[90vw] min-w-[90vw] max-w-[360px] shrink-0 flex-col items-center sm:w-[300px] sm:min-w-[300px] md:w-[340px] md:min-w-[340px]"
            >
              <h2 className="mb-1 text-center text-sm font-semibold text-slate-900 sm:text-base">{p.title}</h2>
              <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl bg-slate-100">
                {p.image_url ? (
                  <img src={p.image_url} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">Изображение</div>
                )}
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                {p.end_at
                  ? `До ${new Date(p.end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
                  : 'Без срока'}
              </p>
            </div>
          ))}
        </div>
      )}
    </main>
  );
};
