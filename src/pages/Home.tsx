import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/* ─── 히어로 이미지 타입 ─── */
type HeroSlide = { image_url: string; mobile_image_url?: string; link_url?: string };

/* ─── 히어로 캐러셀 — 무한 루프, object-cover 풀 와이드 ─── */
function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const len = slides.length;
  const extSlides = len > 1 ? [slides[len - 1], ...slides, slides[0]] : slides;
  const extLen = extSlides.length;

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

  useEffect(() => {
    startAutoSlide();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startAutoSlide]);

  useEffect(() => {
    if (len <= 1) return;
    if (current === extLen - 1) {
      jumpingRef.current = true;
      const timeout = setTimeout(() => {
        setNoTransition(true);
        setCurrent(1);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { setNoTransition(false); jumpingRef.current = false; });
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
    if (current === 0) {
      jumpingRef.current = true;
      const timeout = setTimeout(() => {
        setNoTransition(true);
        setCurrent(len);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => { setNoTransition(false); jumpingRef.current = false; });
        });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [current, len, extLen]);

  const goNext = () => { if (jumpingRef.current) return; setCurrent((c) => c + 1); startAutoSlide(); };
  const goPrev = () => { if (jumpingRef.current) return; setCurrent((c) => c - 1); startAutoSlide(); };
  const goToReal = (realIdx: number) => { if (jumpingRef.current) return; setCurrent(len > 1 ? realIdx + 1 : realIdx); startAutoSlide(); };

  const realIndex = len > 1 ? (current === 0 ? len - 1 : current === extLen - 1 ? 0 : current - 1) : 0;

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
      <div
        className={`flex h-full ${noTransition ? '' : 'transition-transform duration-1000 ease-[cubic-bezier(0.25,0.1,0.25,1)]'}`}
        style={{ width: `${extLen * 100}%`, transform: `translateX(-${current * (100 / extLen)}%)` }}
      >
        {extSlides.map((slide, i) => {
          const inner = (
            <>
              {/* 데스크톱 이미지 */}
              <img src={slide.image_url} alt={`SEMO box ${i + 1}`} className={`h-full w-full object-cover object-center ${slide.mobile_image_url ? 'hidden md:block' : ''}`} draggable={false} />
              {/* 모바일 전용 — 세로 비율 깨짐 완화: contain + 배경 */}
              {slide.mobile_image_url && (
                <img src={slide.mobile_image_url} alt={`SEMO box ${i + 1}`} className="h-full w-full object-contain object-center bg-white md:hidden" draggable={false} />
              )}
            </>
          );
          return (
            <div key={i} className="relative h-full shrink-0" style={{ width: `${100 / extLen}%` }}>
              {slide.link_url ? <Link to={slide.link_url} className="block h-full w-full">{inner}</Link> : inner}
            </div>
          );
        })}
      </div>
      {len > 1 && (
        <>
          <button type="button" onClick={goPrev} aria-label="이전" className="absolute left-4 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/60 p-2.5 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white/90 md:flex">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <button type="button" onClick={goNext} aria-label="다음" className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 items-center justify-center rounded-full bg-white/60 p-2.5 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white/90 md:flex">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </>
      )}
      {len > 1 && (
        <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2.5">
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => goToReal(i)}
              className={`rounded-full transition-all duration-300 ${i === realIndex ? 'h-2.5 w-6 bg-brand shadow-sm' : 'h-2.5 w-2.5 bg-white/60 hover:bg-white/80'}`}
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

/* ─── 주문 과정 — PPT 스타일 비정형 사선 '띠' (clip-path) ─── */
const ORDER_STEPS = [
  {
    num: '01',
    title: 'Тест кожи',
    desc: 'Пройдите тест и узнайте свой тип кожи',
    icon: (
      <svg className="h-8 w-8 sm:h-10 sm:w-10" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <circle cx="24" cy="17" r="7" /><path d="M13 38c0-6 5-11 11-11s11 5 11 11" />
      </svg>
    ),
  },
  {
    num: '02',
    title: 'Заказ и оплата',
    desc: 'Выберите бокс и оплатите удобным способом',
    icon: (
      <svg className="h-8 w-8 sm:h-10 sm:w-10" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <rect x="8" y="14" width="32" height="22" rx="2" /><path d="M8 22h32" /><path d="M16 30h8" />
      </svg>
    ),
  },
  {
    num: '03',
    title: 'Доставка',
    desc: 'Из Кореи в Россию — таможня на нас',
    icon: (
      <svg className="h-8 w-8 sm:h-10 sm:w-10" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 30h28V14H6z" /><path d="M34 22h6l4 8v6h-10" />
        <circle cx="14" cy="36" r="3" /><circle cx="38" cy="36" r="3" />
        <path d="M17 36h17" /><path d="M6 36h5" />
      </svg>
    ),
  },
  {
    num: '04',
    title: 'Получение',
    desc: 'Распакуйте свой персональный бокс!',
    icon: (
      <svg className="h-8 w-8 sm:h-10 sm:w-10" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <rect x="10" y="16" width="28" height="22" rx="1.5" />
        <path d="M10 24h28" /><path d="M24 16v22" /><path d="M18 16l6-6 6 6" />
      </svg>
    ),
  },
];

/* 데스크톱: 슬라이스마다 다른 사선·꺾임으로 PPT처럼 비정형 느낌 (간격은 얇은 흰 gap) */
const STEP_CLIP_PATHS = [
  'polygon(0 0, 100% 1.5%, calc(100% - min(4.5vw, 40px)) 100%, 0 96%)',
  'polygon(min(3.2vw, 18px) 0, 100% 0, calc(100% - min(2.2vw, 14px)) 97%, 0 100%)',
  'polygon(min(2.8vw, 14px) 2.5%, 100% 0, calc(100% - min(5vw, 44px)) 100%, 0 100%)',
  'polygon(min(4vw, 22px) 0, 100% 0, 100% 100%, 0 calc(100% - min(1.8vw, 10px)))',
] as const;

/* brand #E65427 — 오른쪽으로 갈수록 투명도 ↑; 2번째부터는 글자는 어두운 톤으로 대비 유지 */
const STEP_COLORS = [
  'rgba(230, 84, 39, 0.97)',
  'rgba(230, 84, 39, 0.72)',
  'rgba(230, 84, 39, 0.38)',
  'rgba(230, 84, 39, 0.1)',
];

function OrderProcess() {
  const { ref: sectionRef, visible } = useScrollFadeIn(0.05);

  /** 01: 흰 글자 / 02~04: 배경이 옅어져 slate 계열 */
  const textOnLight = (idx: number) => idx >= 1;

  return (
    <section ref={sectionRef} className="relative w-full overflow-hidden bg-white">
      {/* ── 데스크톱(md+) ── */}
      <div className="hidden md:block bg-white">
        <div className="px-4 pt-14 pb-6">
          <h2
            className={`text-center font-light tracking-[0.18em] uppercase text-slate-900 transition-all duration-700 text-2xl lg:text-[1.7rem] ${
              visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            Как заказать SEMO Box
          </h2>
          <div
            className={`mx-auto mt-4 h-px w-10 bg-gradient-to-r from-transparent via-brand/35 to-transparent transition-all duration-700 delay-200 ${
              visible ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
            }`}
          />
        </div>
        {/* 좌우 끝까지 풀블리드, 도형 사이 간격 최소화 */}
        <div className="bg-white pb-14">
          <div
            className="flex w-full gap-px bg-white"
            style={{ height: 'clamp(17rem, 30vw, 27rem)' }}
          >
            {ORDER_STEPS.map((step, idx) => (
              <div
                key={step.num}
                className={`relative min-w-0 flex-1 overflow-hidden transition-all duration-[900ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
                }`}
                style={{
                  clipPath: STEP_CLIP_PATHS[idx],
                  background: STEP_COLORS[idx],
                  transitionDelay: visible ? `${200 + idx * 120}ms` : '0ms',
                }}
              >
                <div
                  className={`flex h-full flex-col items-center justify-center gap-1.5 px-1.5 py-3 text-center sm:gap-2 sm:px-3 md:gap-3 ${
                    textOnLight(idx) ? '' : '[&_svg]:drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]'
                  }`}
                >
                  <span
                    className={`block font-serif text-[2.35rem] font-extralight leading-none tracking-wider sm:text-[3rem] lg:text-[3.75rem] ${
                      textOnLight(idx) ? 'text-slate-800/35' : 'text-white/40 [text-shadow:0_1px_3px_rgba(0,0,0,0.2)]'
                    }`}
                  >
                    {step.num}
                  </span>
                  <div
                    className={
                      textOnLight(idx)
                        ? 'text-slate-800'
                        : 'text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]'
                    }
                  >
                    {step.icon}
                  </div>
                  <p
                    className={`text-[11px] font-semibold tracking-wide sm:text-sm lg:text-[0.95rem] ${
                      textOnLight(idx) ? 'text-slate-900' : 'text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.25)]'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p
                    className={`max-w-[11.5rem] text-[9px] leading-snug sm:text-[10px] lg:text-xs ${
                      textOnLight(idx) ? 'text-slate-700' : 'text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.2)]'
                    }`}
                  >
                    {step.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 모바일(<md): 흰 배경 + 심플 카드 ── */}
      <div className="bg-white px-4 py-12 md:hidden">
        <h2
          className={`mb-8 text-center text-lg font-light tracking-[0.12em] uppercase text-slate-800 transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          Как заказать SEMO Box
        </h2>
        <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
          {ORDER_STEPS.map((step, idx) => (
            <div
              key={step.num}
              className={`relative flex flex-col items-center gap-2 rounded-2xl p-5 text-center transition-all duration-700 ${
                visible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
              }`}
              style={{
                background: STEP_COLORS[idx],
                transitionDelay: visible ? `${200 + idx * 120}ms` : '0ms',
              }}
            >
              <span
                className={`font-serif text-[2rem] font-extralight leading-none tracking-wider ${idx >= 1 ? 'text-slate-800/35' : 'text-white/40'}`}
              >
                {step.num}
              </span>
              <div className={idx >= 1 ? 'text-slate-800' : 'text-white'}>{step.icon}</div>
              <p className={`text-xs font-semibold tracking-wide ${idx >= 1 ? 'text-slate-900' : 'text-white'}`}>
                {step.title}
              </p>
              <p className={`text-[10px] leading-relaxed ${idx >= 1 ? 'text-slate-700' : 'text-white/90'}`}>
                {step.desc}
              </p>
            </div>
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
  secondImageUrl: string | null;
};

const SHOWCASE_TABS = [
  { key: 'beauty', label: 'Beauty Box', category: 'beauty' },
  { key: 'inner', label: 'Inner Beauty Box', category: 'inner_beauty' },
  { key: 'hair', label: 'Hair Beauty Box', category: 'hair_beauty' },
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
        let priceMap: Record<string, { rrp_price: number; prp_price: number | null; image_url: string | null; image_urls: string[] | null }> = {};
        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('id, rrp_price, prp_price, image_url, image_urls')
            .in('id', productIds);
          if (prods) {
            for (const p of prods as { id: string; rrp_price: number; prp_price: number | null; image_url: string | null; image_urls: string[] | null }[]) {
              priceMap[p.id] = p;
            }
          }
        }

        const grouped: Record<string, ShowcaseItem[]> = {};
        for (const slot of slots) {
          const cat = slot.category || 'beauty';
          if (!grouped[cat]) grouped[cat] = [];
          const prod = slot.product_id ? priceMap[slot.product_id] : null;
          const primaryImg = slot.image_url ?? prod?.image_url ?? null;
          const imgUrls = prod?.image_urls ?? [];
          // 두번째 이미지: image_urls에서 첫번째 이미지와 다른 것 선택
          const secondImg = imgUrls.find((u) => u && u !== primaryImg) ?? (imgUrls.length > 1 ? imgUrls[1] : null);
          grouped[cat].push({
            id: slot.product_id ?? `slot-${slot.slot_index}`,
            name: slot.title ?? `Слот ${slot.slot_index + 1}`,
            price: prod?.prp_price ?? prod?.rrp_price ?? 0,
            originalPrice: prod?.rrp_price && prod?.prp_price && prod.rrp_price !== prod.prp_price ? prod.rrp_price : null,
            imageUrl: primaryImg,
            secondImageUrl: secondImg,
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

        {/* 탭 — 세 라인 모두 pill; 모바일 한 줄(clamp + nowrap) */}
        <div
          className={`mb-10 flex w-full items-stretch justify-center gap-1 transition-all duration-700 sm:gap-2 md:gap-3 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '100ms' : '0ms' }}
        >
          {SHOWCASE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.category)}
              className={`min-w-0 flex-1 rounded-full border px-1.5 py-2 text-center font-semibold leading-tight tracking-tight transition-all sm:px-4 sm:py-2.5 sm:tracking-wide md:px-6 whitespace-nowrap text-[length:clamp(0.5rem,2.15vw+0.2rem,0.875rem)] sm:text-sm ${
                activeTab === t.category
                  ? 'border-brand bg-brand text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-800'
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
                {/* 이미지 — hover 시 두번째 이미지로 전환 */}
                <div className="relative mb-4 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-50/80 sm:h-52">
                  {item.imageUrl ? (
                    <>
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-500 ${
                          item.secondImageUrl ? 'group-hover:opacity-0' : ''
                        }`}
                      />
                      {item.secondImageUrl && (
                        <img
                          src={item.secondImageUrl}
                          alt={item.name}
                          className="absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                        />
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-slate-300">Нет фото</span>
                  )}
                </div>
                <p className="mb-3 line-clamp-2 text-center text-sm font-medium tracking-wide text-slate-700 transition-colors group-hover:text-brand sm:text-base">
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

        {/* 더보기 */}
        <div
          className={`mt-10 flex justify-center transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '600ms' : '0ms' }}
        >
          <Link
            to={activeTab === 'beauty' ? '/shop' : activeTab === 'inner_beauty' ? '/inner-beauty' : '/hair-beauty'}
            className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-slate-200 px-8 py-3 text-sm font-medium tracking-wide text-slate-600 transition-all hover:border-brand hover:text-brand"
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
        // ignore
      }
    })();
  }, []);

  return (
    <>
      {heroSlides.length > 0 && <HeroCarousel slides={heroSlides} />}
      <OrderProcess />
      <ProductShowcase />
    </>
  );
};
