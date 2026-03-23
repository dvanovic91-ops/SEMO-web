import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/* ─── 히어로 이미지 타입 ─── */
type HeroSlide = { image_url: string; link_url?: string };

/* ─── 히어로 캐러셀 — 좌측 슬라이드 애니메이션, 100vh, contain, white bg ─── */
function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [animating, setAnimating] = useState(false);
  const touchStartX = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const len = slides.length;

  const goTo = useCallback(
    (idx: number, dir: 'left' | 'right' = 'left') => {
      if (animating) return;
      const next = ((idx % len) + len) % len;
      if (next === current) return;
      setDirection(dir);
      setAnimating(true);
      setCurrent(next);
      setTimeout(() => setAnimating(false), 1000);
    },
    [len, current, animating],
  );

  // 자동 슬라이드 (5초)
  useEffect(() => {
    if (len <= 1) return;
    timerRef.current = setInterval(() => {
      setDirection('left');
      setAnimating(true);
      setCurrent((c) => (c + 1) % len);
      setTimeout(() => setAnimating(false), 1000);
    }, 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [len]);

  const resetTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (len > 1) timerRef.current = setInterval(() => {
      setDirection('left');
      setAnimating(true);
      setCurrent((c) => (c + 1) % len);
      setTimeout(() => setAnimating(false), 1000);
    }, 5000);
  };

  const prev = () => { goTo(current - 1, 'right'); resetTimer(); };
  const next = () => { goTo(current + 1, 'left'); resetTimer(); };

  if (len === 0) return null;

  return (
    <section
      className="relative w-full select-none overflow-hidden bg-white"
      style={{ height: 'calc(100dvh - var(--semo-mobile-header-h, 3.5rem))' }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 40) { diff < 0 ? next() : prev(); }
      }}
    >
      {/* 슬라이드 — CSS transition으로 좌/우 슬라이드 */}
      <div
        className="flex h-full transition-transform duration-1000 ease-[cubic-bezier(0.25,0.1,0.25,1)]"
        style={{
          width: `${len * 100}%`,
          transform: `translateX(-${current * (100 / len)}%)`,
        }}
      >
        {slides.map((slide, i) => {
          const inner = (
            <img
              src={slide.image_url}
              alt={`SEMO box ${i + 1}`}
              className="h-full w-full object-contain"
              draggable={false}
            />
          );
          return (
            <div
              key={i}
              className="flex h-full shrink-0 items-center justify-center bg-white"
              style={{ width: `${100 / len}%` }}
            >
              {slide.link_url ? (
                <Link to={slide.link_url} className="flex h-full w-full items-center justify-center">{inner}</Link>
              ) : (
                inner
              )}
            </div>
          );
        })}
      </div>

      {/* 좌우 화살표 — 데스크톱, 미니멀 */}
      {len > 1 && (
        <>
          <button
            type="button"
            onClick={prev}
            aria-label="이전"
            className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/60 p-2.5 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white/90 md:flex"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="다음"
            className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/60 p-2.5 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white/90 md:flex"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}

      {/* 인디케이터 — 미니멀 */}
      {len > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => { goTo(i, i > current ? 'left' : 'right'); resetTimer(); }}
              className={`rounded-full transition-all duration-300 ${
                i === current
                  ? 'h-2.5 w-6 bg-brand shadow-sm'
                  : 'h-2.5 w-2.5 bg-slate-300/60 hover:bg-slate-400/80'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── 주문 과정 시각화 (4단계) ─── */
function OrderProcess() {
  return (
    <section className="w-full bg-slate-50 py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4">
        <h2 className="mb-10 text-center text-lg font-semibold text-slate-900 sm:text-2xl">
          Как заказать SEMO Box
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {[
            {
              step: 1,
              title: 'Тест кожи',
              desc: 'Пройдите тест и узнайте свой тип',
              icon: (
                <svg className="h-10 w-10 sm:h-12 sm:w-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="24" cy="18" r="8" />
                  <path d="M14 38c0-5.5 4.5-10 10-10s10 4.5 10 10" />
                </svg>
              ),
            },
            {
              step: 2,
              title: 'Заказ и оплата',
              desc: 'Выберите бокс и оплатите',
              icon: (
                <svg className="h-10 w-10 sm:h-12 sm:w-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="8" y="14" width="32" height="22" rx="2" />
                  <path d="M8 22h32" />
                  <path d="M16 30h8" />
                </svg>
              ),
            },
            {
              step: 3,
              title: 'Доставка',
              desc: 'Из Кореи в Россию — таможня на нас',
              icon: (
                <svg className="h-10 w-10 sm:h-12 sm:w-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 30h28V14H6z" />
                  <path d="M34 22h6l4 8v6h-10" />
                  <circle cx="14" cy="36" r="3" />
                  <circle cx="38" cy="36" r="3" />
                  <path d="M17 36h17" />
                  <path d="M6 36h5" />
                </svg>
              ),
            },
            {
              step: 4,
              title: 'Получение',
              desc: 'Распакуйте свой персональный бокс!',
              icon: (
                <svg className="h-10 w-10 sm:h-12 sm:w-12" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <rect x="10" y="16" width="28" height="22" rx="1.5" />
                  <path d="M10 24h28" />
                  <path d="M24 16v22" />
                  <path d="M18 16l6-6 6 6" />
                </svg>
              ),
            },
          ].map((item) => (
            <div key={item.step} className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-sm sm:p-6">
              <span className="text-3xl font-light tabular-nums text-brand sm:text-4xl">{item.step}</span>
              <div className="text-brand/70">{item.icon}</div>
              <p className="text-center text-sm font-semibold text-slate-800 sm:text-base">{item.title}</p>
              <p className="text-center text-xs leading-relaxed text-slate-500 sm:text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
        {/* 화살표 연결선 — 데스크톱만 */}
        <div className="mt-6 hidden items-center justify-center gap-2 text-brand/40 sm:flex">
          {[1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              <div className="h-px w-16 bg-brand/20 lg:w-24" />
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 상품 쇼케이스 (카테고리별 탭) ─── */
type ShowcaseItem = {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  imageUrl: string | null;
};

const SHOWCASE_TABS = [
  { key: 'beauty', label: 'Beauty Box', category: 'beauty' },
  { key: 'inner', label: 'Inner Beauty', category: 'inner_beauty' },
  { key: 'hair', label: 'Hair Beauty', category: 'hair_beauty' },
  { key: 'promo', label: 'Promo', category: 'promo' },
] as const;

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

function ProductShowcase() {
  const [activeTab, setActiveTab] = useState<string>('beauty');
  const [products, setProducts] = useState<Record<string, ShowcaseItem[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    // 카테고리별 상품을 main_layout_slots에서 로드
    (async () => {
      setLoading(true);
      try {
        // beauty = 기존 main_layout_slots (category IS NULL 또는 'beauty')
        const { data: slotData } = await supabase
          .from('main_layout_slots')
          .select('slot_index, title, image_url, product_id, category')
          .order('slot_index', { ascending: true });

        const slots = (slotData ?? []) as {
          slot_index: number;
          title: string | null;
          image_url: string | null;
          product_id: string | null;
          category: string | null;
        }[];

        // product_id로 가격 조회
        const productIds = slots.filter((s) => s.product_id).map((s) => s.product_id!);
        let priceMap: Record<string, { rrp_price: number; prp_price: number | null; image_url: string | null }> = {};
        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('id, rrp_price, prp_price, image_url')
            .in('id', productIds);
          if (prods) {
            for (const p of prods as { id: string; rrp_price: number; prp_price: number | null; image_url: string | null }[]) {
              priceMap[p.id] = p;
            }
          }
        }

        const grouped: Record<string, ShowcaseItem[]> = {};
        for (const slot of slots) {
          const cat = slot.category || 'beauty';
          if (!grouped[cat]) grouped[cat] = [];
          const prod = slot.product_id ? priceMap[slot.product_id] : null;
          grouped[cat].push({
            id: slot.product_id ?? `slot-${slot.slot_index}`,
            name: slot.title ?? `Слот ${slot.slot_index + 1}`,
            price: prod?.prp_price ?? prod?.rrp_price ?? 0,
            originalPrice: prod?.rrp_price && prod?.prp_price && prod.rrp_price !== prod.prp_price ? prod.rrp_price : null,
            imageUrl: slot.image_url ?? prod?.image_url ?? null,
          });
        }

        setProducts(grouped);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentItems = products[activeTab] ?? [];

  return (
    <section className="w-full py-12 sm:py-16">
      <div className="mx-auto max-w-6xl px-4">
        <h2 className="mb-6 text-center text-lg font-semibold text-slate-900 sm:text-2xl">
          SEMO Box
        </h2>

        {/* 탭 */}
        <div className="mb-8 flex items-center justify-center gap-2 sm:gap-4">
          {SHOWCASE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.category)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition sm:px-5 ${
                activeTab === t.category
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 상품 그리드 */}
        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-brand" />
          </div>
        ) : currentItems.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">Скоро здесь появятся товары!</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {currentItems.slice(0, 4).map((item) => (
              <Link
                key={item.id}
                to={`/product/${item.id}`}
                className="group flex flex-col items-center rounded-2xl border border-slate-100 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5"
              >
                <div className="mb-3 flex h-32 w-full items-center justify-center overflow-hidden rounded-xl bg-slate-50 sm:h-44">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-slate-400">Нет фото</span>
                  )}
                </div>
                <p className="mb-2 line-clamp-2 text-center text-sm font-medium text-slate-800 group-hover:text-brand sm:text-base">
                  {item.name}
                </p>
                <div className="flex flex-col items-center gap-0.5">
                  {item.originalPrice != null && (
                    <span className="text-xs text-slate-400 line-through">{formatPrice(item.originalPrice)}</span>
                  )}
                  <span className="text-sm font-semibold text-slate-900">{formatPrice(item.price)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* 더보기 링크 */}
        <div className="mt-8 flex justify-center">
          <Link
            to={activeTab === 'beauty' ? '/shop' : activeTab === 'inner_beauty' ? '/inner-beauty' : activeTab === 'hair_beauty' ? '/hair-beauty' : '/promo'}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-brand hover:text-brand"
          >
            Смотреть все
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Home 메인 ─── */
export const Home: React.FC = () => {
  // 히어로 이미지 캐러셀: site_settings에서 hero_images (JSON array) 로드
  const [heroSlides, setHeroSlides] = useState<HeroSlide[]>([]);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('site_settings')
          .select('key, value')
          .eq('key', 'hero_images')
          .maybeSingle();
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed)) setHeroSlides(parsed.filter((s: HeroSlide) => s.image_url));
          } catch {
            // invalid JSON
          }
        }
      } catch {
        // site_settings 테이블이 없으면 무시
      }
    })();
  }, []);

  return (
    <>
      {/* 히어로 이미지 캐러셀 — 100vh 풀스크린 */}
      {heroSlides.length > 0 && (
        <HeroCarousel slides={heroSlides} />
      )}

      {/* 주문 과정 시각화 (4단계) */}
      <OrderProcess />

      {/* 상품 쇼케이스 — 카테고리별 탭 */}
      <ProductShowcase />
    </>
  );
};
