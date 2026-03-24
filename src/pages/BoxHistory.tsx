import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { SemoPageSpinner } from '../components/SemoPageSpinner';
import { ShopProductCard, type ShopItem, type ShopLayoutCategory } from './Shop';
import { BOX_HISTORY_SEASON_LABELS_KEY, HISTORY_SEASON_COUNT } from '../lib/catalogSlotRooms';

const BEAUTY: ShopLayoutCategory = 'beauty';

type SeasonGroup = {
  seasonIndex: 1 | 2 | 3;
  label: string;
  items: ShopItem[];
};

/**
 * 과거 시즌 뷰티박스 — 시즌 N-1(상단) … N-3(하단), 관리자 시즌명 표시.
 */
export const BoxHistory: React.FC = () => {
  const [groups, setGroups] = useState<SeasonGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setGroups([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: labelRow }, res] = await Promise.all([
        supabase.from('site_settings').select('value').eq('key', BOX_HISTORY_SEASON_LABELS_KEY).maybeSingle(),
        supabase
          .from('products')
          .select(
            'id, category, name, rrp_price, prp_price, image_url, image_urls, box_theme, box_history, history_season_index, history_order',
          )
          .eq('box_history', true)
          .order('name'),
      ]);
      if (cancelled) return;
      if (res.error) {
        console.warn('[BoxHistory]', res.error.message);
        setGroups([]);
        setLoading(false);
        return;
      }
      let labels: Record<string, string> = { '1': 'N-1', '2': 'N-2', '3': 'N-3' };
      if (labelRow?.value != null) {
        try {
          const raw = labelRow.value;
          const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (v && typeof v === 'object') {
            const o = v as Record<string, unknown>;
            labels = {
              '1': String(o['1'] ?? labels['1']),
              '2': String(o['2'] ?? labels['2']),
              '3': String(o['3'] ?? labels['3']),
            };
          }
        } catch {
          /* ignore */
        }
      }
      const rows = (res.data ?? []) as {
        id: string;
        category?: string | null;
        name?: string | null;
        rrp_price: number | null;
        prp_price: number | null;
        image_url: string | null;
        image_urls?: string[] | null;
        box_theme?: 'brand' | 'sky' | null;
        history_season_index?: number | null;
        history_order?: number | null;
      }[];
      const beautyRows = rows.filter((p) => {
        const c = String(p.category ?? '')
          .trim()
          .toLowerCase();
        if (!c || c === 'null') return true;
        if (c === 'inner_beauty' || c === 'hair_beauty') return false;
        return c === 'beauty' || c === 'beautybox' || c === 'beauty_box' || c === 'beauty-box';
      });
      const toShopItem = (p: (typeof beautyRows)[0]): ShopItem => {
        const prp = p.prp_price != null ? Number(p.prp_price) : null;
        const rrp = p.rrp_price != null ? Number(p.rrp_price) : null;
        const price = prp ?? rrp ?? 0;
        const imageUrls =
          Array.isArray(p.image_urls) && p.image_urls.length ? p.image_urls : p.image_url ? [p.image_url] : [];
        return {
          id: p.id,
          name: p.name?.trim() || '—',
          price,
          originalPrice: prp != null && rrp != null ? rrp : null,
          imageUrl: imageUrls[0] ?? null,
          imageUrls,
          productId: p.id,
          linkUrl: null,
          boxTheme: p.box_theme ?? 'brand',
          boxHistory: true,
        };
      };
      const bySeason: Record<1 | 2 | 3, ShopItem[]> = { 1: [], 2: [], 3: [] };
      beautyRows.forEach((p) => {
        const si = Math.min(3, Math.max(1, Number(p.history_season_index) || 1)) as 1 | 2 | 3;
        bySeason[si].push(toShopItem(p));
      });
      ([1, 2, 3] as const).forEach((si) => {
        bySeason[si].sort((a, b) => {
          const pa = beautyRows.find((r) => r.id === a.id);
          const pb = beautyRows.find((r) => r.id === b.id);
          return (pa?.history_order ?? 0) - (pb?.history_order ?? 0);
        });
      });
      const next: SeasonGroup[] = [];
      for (let s = 1; s <= HISTORY_SEASON_COUNT; s++) {
        const si = s as 1 | 2 | 3;
        next.push({
          seasonIndex: si,
          label: labels[String(si)] ?? `N-${si}`,
          items: bySeason[si],
        });
      }
      setGroups(next);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const noopCart = () => {};

  return (
    <main className="mx-auto min-w-0 w-full max-w-[96rem] px-3 py-5 sm:px-6 sm:py-10 md:px-8 md:py-14">
      <header className="mb-10">
        <nav className="mb-6 text-center text-sm text-slate-500">
          <Link to="/shop" className="font-medium text-brand underline-offset-4 hover:underline">
            ← Beauty box
          </Link>
        </nav>
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">
          История боксов
        </h1>
      </header>

      {loading ? (
        <div className="py-16">
          <SemoPageSpinner />
        </div>
      ) : groups.every((g) => g.items.length === 0) ? (
        <p className="py-16 text-center text-sm text-slate-500">Пока нет архивных боксов.</p>
      ) : (
        <div className="flex w-full flex-col gap-12 md:gap-14">
          {groups.map((g) =>
            g.items.length === 0 ? null : (
              <section
                key={g.seasonIndex}
                className="w-full rounded-2xl border border-slate-200/90 bg-white px-3 py-6 shadow-[0_1px_12px_-4px_rgba(15,23,42,0.12)] sm:px-6 sm:py-8 md:px-10"
                aria-labelledby={`season-${g.seasonIndex}`}
              >
                <h2
                  id={`season-${g.seasonIndex}`}
                  className="prose-ru mb-6 text-center text-lg font-semibold tracking-tight text-slate-900 sm:text-xl"
                >
                  {g.label}
                </h2>
                {/* 데스크톱: 한 줄 4개 / 태블릿 2개 / 모바일 1개 — 카드 폭은 열에 맞춤 */}
                <div className="mx-auto grid w-full max-w-[88rem] grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-5">
                  {g.items.map((product) => (
                    <div key={product.id} className="min-w-0">
                      <ShopProductCard
                        product={product}
                        onAddToCart={noopCart}
                        layoutCategory={BEAUTY}
                        layout="mobile-stack"
                        archiveMode
                      />
                    </div>
                  ))}
                </div>
              </section>
            ),
          )}
        </div>
      )}
    </main>
  );
};
