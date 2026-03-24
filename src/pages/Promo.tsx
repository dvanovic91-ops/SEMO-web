import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../components/SemoPageSpinner';

type PromoItem = {
  id: string;
  title: string;
  image_url: string | null;
  end_at: string | null;
  sort_order: number;
};

function PromoCard({
  p,
  className = '',
}: {
  p: PromoItem;
  className?: string;
}) {
  return (
    <article
      className={`flex flex-col ${className}`}
    >
      <h2 className="mb-1 px-1 pt-1 text-center text-sm font-semibold text-slate-900 sm:text-base">{p.title}</h2>
      {/* 업로드 비율 그대로 표시 — 고정 프레임·object-contain으로 생기던 회색 여백 제거 */}
      <div className="relative mb-1.5 w-full overflow-hidden rounded-xl bg-slate-100">
        {p.image_url ? (
          <img src={p.image_url} alt="" className="block h-auto w-full" />
        ) : (
          <div className="flex min-h-[140px] w-full items-center justify-center text-slate-400">Изображение</div>
        )}
      </div>
      <p className="px-1 pb-1 text-center text-xs text-slate-500">
        {p.end_at
          ? `До ${new Date(p.end_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}`
          : 'Без срока'}
      </p>
    </article>
  );
}

/** Promo 페이지 — 한 화면 최대 6개(3열 x 2행), 캐러셀/화살표 없이 고정 그리드 */
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

  const visiblePromos = promos.slice(0, 6);
  const desktopColsClass =
    visiblePromos.length <= 1
      ? 'md:grid-cols-1 md:max-w-[24rem]'
      : visiblePromos.length === 2
      ? 'md:grid-cols-2 md:max-w-4xl'
      : 'md:grid-cols-3 md:max-w-6xl';

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-8 md:py-10">
      <header className="mb-8 text-center">
        <h1 className="text-center text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl md:text-5xl">
          Текущие акции
        </h1>
        <p className="mt-4 text-lg text-slate-600">Специальные предложения и события SEMO box</p>
      </header>

      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : visiblePromos.length === 0 ? (
        <p className="py-12 text-center text-slate-500">Нет активных акций.</p>
      ) : (
        <section className="flex justify-center">
          <div className={`grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 ${desktopColsClass}`}>
            {visiblePromos.map((p) => (
              <PromoCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
