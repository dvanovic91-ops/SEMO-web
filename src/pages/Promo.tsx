import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from '../components/SemoPageSpinner';

type PromoItem = {
  id: string;
  title: string;
  image_url: string | null;
  start_at: string | null;
  end_at: string | null;
  sort_order: number;
  is_archived?: boolean | null;
};

/** ru-RU: день/месяц/год (цифры) */
function formatPromoDateRu(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

/** Период: начало — конец (если одна дата — многоточие с той стороны) */
function formatPromoPeriodRu(startAt: string | null | undefined, endAt: string | null | undefined): string {
  const s = formatPromoDateRu(startAt ?? null);
  const e = formatPromoDateRu(endAt ?? null);
  if (s && e) return `${s} — ${e}`;
  if (s && !e) return `${s} — …`;
  if (!s && e) return `… — ${e}`;
  return 'Без срока';
}

function PromoCard({
  p,
  className = '',
  archiveTab = false,
}: {
  p: PromoItem;
  className?: string;
  /** 아카이브 탭: 살짝 톤 다운 */
  archiveTab?: boolean;
}) {
  const periodLine = formatPromoPeriodRu(p.start_at, p.end_at);
  return (
    <article className={`flex flex-col ${archiveTab ? 'opacity-90' : ''} ${className}`}>
      <h2 className="mb-1 px-1 pt-1 text-center text-sm font-semibold text-slate-900 sm:text-base">{p.title}</h2>
      <div className="relative mb-1.5 w-full overflow-hidden rounded-xl bg-slate-100">
        {p.image_url ? (
          <img src={p.image_url} alt="" className="block h-auto w-full" />
        ) : (
          <div className="flex min-h-[140px] w-full items-center justify-center text-slate-400">Изображение</div>
        )}
      </div>
      <p className="px-1 pb-1 text-center text-xs text-slate-500">
        {archiveTab ? (periodLine === 'Без срока' ? 'Архив' : periodLine) : periodLine}
      </p>
    </article>
  );
}

type PublicPromoTab = 'active' | 'archive';

/** Promo — Актуальные / Архив 탭 */
export const Promo: React.FC = () => {
  const [promos, setPromos] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<PublicPromoTab>('active');

  useEffect(() => {
    if (!supabase) {
      setPromos([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const full = await supabase
        .from('promos')
        .select('id, title, image_url, start_at, end_at, sort_order, is_archived')
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      if (!full.error && full.data) {
        setPromos(
          (full.data as PromoItem[]).map((row) => ({
            ...row,
            start_at: row.start_at ?? null,
            is_archived: row.is_archived ?? false,
          })),
        );
        setLoading(false);
        return;
      }
      if (full.error) console.warn('[Promo]', full.error.message);
      const min = await supabase
        .from('promos')
        .select('id, title, image_url, end_at, sort_order')
        .order('sort_order', { ascending: true });
      if (cancelled) return;
      setPromos(
        ((min.data as (Omit<PromoItem, 'is_archived' | 'start_at'> & { start_at?: string | null })[]) ?? []).map(
          (r) => ({ ...r, start_at: r.start_at ?? null, is_archived: false }),
        ),
      );
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setPromos([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const list = promos.filter((p) => Boolean(p.is_archived) === (tab === 'archive'));
    return list.slice(0, 6);
  }, [promos, tab]);

  const desktopColsClass =
    filtered.length <= 1
      ? 'md:grid-cols-1 md:max-w-[24rem]'
      : filtered.length === 2
        ? 'md:grid-cols-2 md:max-w-4xl'
        : 'md:grid-cols-3 md:max-w-6xl';

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      {/* Заголовок → табы → баннеры: вертикальные отступы удвоены; ширина сегмента — половина от прежнего max-w-md */}
      <header className="mb-16 text-center sm:mb-20">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
          Акции
        </h1>
        <div className="mx-auto mt-12 grid w-full max-w-[14rem] grid-cols-2 gap-2 rounded-full border border-slate-200 bg-slate-50/80 p-1">
          <button
            type="button"
            onClick={() => setTab('active')}
            className={`min-h-10 min-w-0 w-full rounded-full px-2 text-center text-sm font-medium transition sm:min-h-9 sm:px-3 ${
              tab === 'active' ? 'bg-brand text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
          >
            Актуальные
          </button>
          <button
            type="button"
            onClick={() => setTab('archive')}
            className={`min-h-10 min-w-0 w-full rounded-full px-2 text-center text-sm font-medium transition sm:min-h-9 sm:px-3 ${
              tab === 'archive' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
          >
            Архив
          </button>
        </div>
      </header>

      {loading ? (
        <div className={SEMO_SECTION_LOADING_CLASS}>
          <SemoPageSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-slate-500">
          {tab === 'active' ? 'Нет активных акций.' : 'В архиве пока ничего нет.'}
        </p>
      ) : (
        <section className="flex justify-center">
          <div className={`grid w-full grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 ${desktopColsClass}`}>
            {filtered.map((p) => (
              <PromoCard key={p.id} p={p} archiveTab={tab === 'archive'} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
};
