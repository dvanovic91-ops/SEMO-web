import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/* ─── 히어로 이미지 타입 ─── */
type HeroSlide = { image_url: string; link_url?: string };

/* ─── 히어로 캐러셀 — 무한 루프, object-cover 풀 와이드, 고급스러운 슬라이드 ─── */
function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const len = slides.length;
  // 무한 루프: [clone-last, ...slides, clone-first]
  const extSlides = len > 1 ? [slides[len - 1], ...slides, slides[0]] : slides;
  const extLen = extSlides.length;

  // current는 extSlides 기준 인덱스 (1 = first real slide)
  const [current, setCurrent] = useState(len > 1 ? 1 : 0);
  const [noTransition, setNoTransition] = useState(false);
  const touchStartX = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const jumpingRef = useRef(false);

  const startAutoSlide = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (len <= 1) return;
    timerRef.current = setInterval(() => {
      if (jumpingRef.current) return;
      setCurrent((c) => c + 1);
    }, 5000);
  }, [len]);

  // 자동 슬라이드
  useEffect(() => {
    startAutoSlide();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startAutoSlide]);

  // 무한 루프 처리: 클론 슬라이드 도달 시 순간 이동
  useEffect(() => {
    if (len <= 1) return;
    // 마지막 클론 (forward loop)
    if (current === extLen - 1) {
      jumpingRef.current = true;
      const timeout = setTimeout(() => {
        setNoTransition(true);
        setCurrent(1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setNoTransition(false);
            jumpingRef.current = false;
          });
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
    // 첫번째 클론 (backward loop)
    if (current === 0) {
      jumpingRef.current = true;
      const timeout = setTimeout(() => {
        setNoTransition(true);
        setCurrent(len);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setNoTransition(false);
            jumpingRef.current = false;
          });
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [current, len, extLen]);

  const goNext = () => {
    if (jumpingRef.current) return;
    setCurrent((c) => c + 1);
    startAutoSlide();
  };
  const goPrev = () => {
    if (jumpingRef.current) return;
    setCurrent((c) => c - 1);
    startAutoSlide();
  };
  const goToReal = (realIdx: number) => {
    if (jumpingRef.current) return;
    setCurrent(len > 1 ? realIdx + 1 : realIdx);
    startAutoSlide();
  };

  // 실제 슬라이드 인덱스 (인디케이터용)
  const realIndex = len > 1
    ? current === 0 ? len - 1
      : current === extLen - 1 ? 0
      : current - 1
    : 0;

  if (len === 0) return null;

  return (
    <section
      className="relative w-full select-none overflow-hidden bg-white"
      style={{ height: 'calc(100dvh - var(--semo-mobile-header-h, 3.5rem))' }}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 40) { diff < 0 ? goNext() : goPrev(); }
      }}
    >
      {/* 슬라이드 트랙 */}
      <div
        className={`flex h-full ${noTransition ? '' : 'transition-transform duration-1000 ease-[cubic-bezier(0.25,0.1,0.25,1)]'}`}
        style={{
          width: `${extLen * 100}%`,
          transform: `translateX(-${current * (100 / extLen)}%)`,
        }}
      >
        {extSlides.map((slide, i) => {
          const inner = (
            <img
              src={slide.image_url}
              alt={`SEMO box ${i + 1}`}
              className="h-full w-full object-cover"
              draggable={false}
            />
          );
          return (
            <div
              key={i}
              className="relative h-full shrink-0"
              style={{ width: `${100 / extLen}%` }}
            >
              {slide.link_url ? (
                <Link to={slide.link_url} className="block h-full w-full">{inner}</Link>
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
            onClick={goPrev}
            aria-label="이전"
            className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/60 p-2.5 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white/90 md:flex"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button
            type="button"
            onClick={goNext}
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
              onClick={() => goToReal(i)}
              className={`rounded-full transition-all duration-300 ${
                i === realIndex
                  ? 'h-2.5 w-6 bg-brand shadow-sm'
                  : 'h-2.5 w-2.5 bg-white/60 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* ─── 스크롤 페이드인 훅 ─── */
function useScrollFadeIn(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
      { threshold },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── 주문 과정 시각화 (4단계) — 고급스러운 디자인 + 페이드인 애니메이션 ─── */
function OrderProcess() {
  const { ref: sectionRef, visible } = useScrollFadeIn(0.1);
  const steps = [
    {
      step: 1,
      title: 'Тест кожи',
      desc: 'Пройдите тест и узнайте свой тип',
      icon: (
        <svg className="h-12 w-12 sm:h-14 sm:w-14" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
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
        <svg className="h-12 w-12 sm:h-14 sm:w-14" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
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
        <svg className="h-12 w-12 sm:h-14 sm:w-14" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
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
        <svg className="h-12 w-12 sm:h-14 sm:w-14" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
          <rect x="10" y="16" width="28" height="22" rx="1.5" />
          <path d="M10 24h28" />
          <path d="M24 16v22" />
          <path d="M18 16l6-6 6 6" />
        </svg>
      ),
    },
  ];

  return (
    <section ref={sectionRef} className="w-full bg-gradient-to-b from-slate-50 to-white py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4">
        <h2
          className={`mb-12 text-center text-xl font-light tracking-wide text-slate-800 transition-all duration-700 sm:text-2xl lg:text-3xl ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          Как заказать SEMO Box
        </h2>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-8">
          {steps.map((item, idx) => (
            <div
              key={item.step}
              className={`group flex flex-col items-center gap-4 rounded-3xl border border-slate-100/80 bg-white p-6 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.06)] transition-all duration-700 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.1)] sm:p-8 ${
                visible ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0'
              }`}
              style={{ transitionDelay: visible ? `${idx * 120}ms` : '0ms' }}
            >
              <span className="text-4xl font-extralight tabular-nums text-brand/80 sm:text-5xl">{item.step}</span>
              <div className="text-brand/50 transition-colors group-hover:text-brand/70">{item.icon}</div>
              <p className="text-center text-sm font-semibold tracking-wide text-slate-800 sm:text-base">{item.title}</p>
              <p className="text-center text-xs leading-relaxed text-slate-400 sm:text-sm">{item.desc}</p>
            </div>
          ))}
        </div>
        {/* 화살표 연결선 — 데스크톱 */}
        <div
          className={`mt-8 hidden items-center justify-center gap-3 sm:flex transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '500ms' : '0ms' }}
        >
          {[1, 2, 3].map((i) => (
            <React.Fragment key={i}>
              <div className="h-px w-20 bg-gradient-to-r from-brand/10 via-brand/25 to-brand/10 lg:w-28" />
              <svg className="h-4 w-4 text-brand/30" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 상품 쇼케이스 (카테고리별 탭) — 고급스러운 디자인 + 페이드인 ─── */
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
  const { ref: sectionRef, visible } = useScrollFadeIn(0.1);
  const [activeTab, setActiveTab] = useState<string>('beauty');
  const [products, setProducts] = useState<Record<string, ShowcaseItem[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      try {
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
    <section ref={sectionRef} className="w-full py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2
          className={`mb-8 text-center text-xl font-light tracking-wide text-slate-800 transition-all duration-700 sm:text-2xl lg:text-3xl ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          SEMO Box
        </h2>

        {/* 탭 */}
        <div
          className={`mb-10 flex items-center justify-center gap-2 transition-all duration-700 sm:gap-3 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '100ms' : '0ms' }}
        >
          {SHOWCASE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.category)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium tracking-wide transition-all sm:px-6 ${
                activeTab === t.category
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 상품 그리드 */}
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
          </div>
        ) : currentItems.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">Скоро здесь появятся товары!</p>
        ) : (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4 sm:gap-8">
            {currentItems.slice(0, 4).map((item, idx) => (
              <Link
                key={item.id}
                to={`/product/${item.id}`}
                className={`group flex flex-col items-center rounded-3xl border border-slate-100/80 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] transition-all duration-700 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.1)] sm:p-6 ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
                }`}
                style={{ transitionDelay: visible ? `${200 + idx * 100}ms` : '0ms' }}
              >
                <div className="mb-4 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-50/80 sm:h-52">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <span className="text-xs text-slate-300">Нет фото</span>
                  )}
                </div>
                <p className="mb-3 line-clamp-2 text-center text-sm font-medium tracking-wide text-slate-700 transition-colors group-hover:text-slate-900 sm:text-base">
                  {item.name}
                </p>
                <div className="flex flex-col items-center gap-0.5">
                  {item.originalPrice != null && (
                    <span className="text-xs text-slate-300 line-through">{formatPrice(item.originalPrice)}</span>
                  )}
                  <span className="text-sm font-semibold text-slate-800">{formatPrice(item.price)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* 더보기 링크 */}
        <div
          className={`mt-10 flex justify-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '600ms' : '0ms' }}
        >
          <Link
            to={activeTab === 'beauty' ? '/shop' : activeTab === 'inner_beauty' ? '/inner-beauty' : activeTab === 'hair_beauty' ? '/hair-beauty' : '/promo'}
            className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 px-8 py-3 text-sm font-medium tracking-wide text-slate-600 transition-all hover:border-slate-900 hover:text-slate-900"
          >
            Смотреть все
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Home 메인 ─── */
export const Home: React.FC = () => {
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
      {heroSlides.length > 0 && (
        <HeroCarousel slides={heroSlides} />
      )}
      <OrderProcess />
      <ProductShowcase />
    </>
  );
};
