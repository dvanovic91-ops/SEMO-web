import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n } from '../context/I18nContext';
import type { AppCurrency } from '../context/I18nContext';
import { formatCurrencyAmount } from '../lib/market';
import { formatStorefrontDate } from '../lib/formatStorefrontDate';
import { loadProductMarketPrices } from '../lib/productMarketPrices';
import {
  CATALOG_ROOM_SLOTS_TABLE,
  CATALOG_SLOT_ROW_PERSIST,
  CATALOG_SLOT_VISIBLE_BY_ROOM_KEY,
  clampCatalogVisibleCount,
  parseCatalogVisibleByRoom,
  type CatalogSlotRoom,
} from '../lib/catalogSlotRooms';
import { isLegacyMockCatalogProductName } from '../lib/legacyMockContent';
import { JourneyStepImage } from '../components/JourneyStepImage';
import { JOURNEY_INTRO_SUBLINE_CLASS, JOURNEY_STEPS } from '../data/journeySteps';

/* ─── 히어로 이미지 타입 ─── */
type HeroSlide = { image_url: string; mobile_image_url?: string; link_url?: string };

/** 높이는 index.css `--semo-hero-h` (100svh − 헤더) — 모바일 주소창에 따른 dvh 리플로우 최소화 */
const HERO_SECTION_HEIGHT_STYLE: React.CSSProperties = {
  height: 'var(--semo-hero-h)',
};

const heroImgBlockClass =
  'h-full w-full select-none [-webkit-touch-callout:none] [touch-action:pan-y]';

/* ─── 히어로 캐러셀 — 무한 루프 / null=로딩 스켈레톤(레이아웃 유지) ─── */
function HeroCarousel({ slides }: { slides: HeroSlide[] | null }) {
  const len = slides?.length ?? 0;
  const extSlides = len > 1 && slides ? [slides[len - 1], ...slides, slides[0]] : slides ?? [];
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
      if (typeof document !== 'undefined' && document.hidden) return;
      setCurrent((c) => c + 1);
    }, 5000);
  }, [len]);

  useEffect(() => {
    startAutoSlide();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startAutoSlide]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        startAutoSlide();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
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

  /** site_settings 로딩 중 — 히어로 자리 확보(주문법이 위로 밀리지 않음) */
  if (slides === null) {
    return (
      <section
        className="relative w-full overflow-hidden bg-white"
        style={HERO_SECTION_HEIGHT_STYLE}
        aria-busy
        aria-label="Загрузка баннера"
      >
        <div className="h-full w-full animate-pulse bg-gradient-to-br from-slate-100 via-white to-slate-50" />
      </section>
    );
  }

  if (len === 0) {
    return (
      <section
        className="relative w-full overflow-hidden bg-gradient-to-b from-slate-50 to-white"
        style={HERO_SECTION_HEIGHT_STYLE}
        aria-hidden
      />
    );
  }

  return (
    <section
      className="relative w-full select-none overflow-hidden bg-white"
      style={HERO_SECTION_HEIGHT_STYLE}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const diff = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(diff) > 40) { diff < 0 ? goNext() : goPrev(); }
      }}
    >
      <div
        className={`flex h-full ${noTransition ? '' : 'transition-transform duration-1000 ease-[cubic-bezier(0.25,0.1,0.25,1)] md:will-change-transform'}`}
        style={{ width: `${extLen * 100}%`, transform: `translateX(-${current * (100 / extLen)}%)` }}
      >
        {extSlides.map((slide, i) => {
          const isLcp = i === (len > 1 ? 1 : 0);
          const inner = (
            <>
              <img
                src={slide.image_url}
                alt={`SEMO box ${i + 1}`}
                className={`${heroImgBlockClass} object-cover object-center ${slide.mobile_image_url ? 'hidden md:block' : ''}`}
                draggable={false}
                decoding="async"
                fetchpriority={isLcp ? 'high' : 'low'}
              />
              {slide.mobile_image_url && (
                <img
                  src={slide.mobile_image_url}
                  alt={`SEMO box ${i + 1}`}
                  className={`${heroImgBlockClass} object-cover object-center md:hidden`}
                  draggable={false}
                  decoding="async"
                  fetchpriority={isLcp ? 'high' : 'low'}
                />
              )}
            </>
          );
          return (
            <div key={i} className="relative h-full shrink-0" style={{ width: `${100 / extLen}%` }}>
              {slide.link_url ? (
                <Link to={slide.link_url} className="block h-full w-full" draggable={false}>
                  {inner}
                </Link>
              ) : (
                inner
              )}
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
        <div className="absolute bottom-[max(3rem,calc(0.35rem+env(safe-area-inset-bottom,0px)))] left-1/2 z-10 flex -translate-x-1/2 gap-2.5 md:bottom-6">
          {slides.map((_, i) => (
            <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => goToReal(i)}
              className={`rounded-full transition-all duration-300 ${i === realIndex ? 'h-2.5 w-6 bg-brand shadow-sm' : 'h-2.5 w-2.5 bg-white/70 shadow-sm ring-1 ring-black/10 hover:bg-white md:ring-0'}`}
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

/** 뷰포트에 처음 들어올 때만 등장 (Journey 스텝·쇼케이스 등) — 고정 헤더와 겹칠 때마다 깜빡이지 않음 */
function OrderStepReveal({
  children,
  className = '',
  style,
  staggerIndex = 0,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  staggerIndex?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transform-gpu transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-auto md:duration-[800ms] md:will-change-transform ${
        shown ? 'translate-y-0 opacity-100 scale-100' : 'max-md:translate-y-4 max-md:scale-[0.99] translate-y-9 opacity-0 scale-[0.97]'
      } ${className}`}
      style={{
        ...style,
        transitionDelay: shown ? `${staggerIndex * 95}ms` : '0ms',
      }}
    >
      {children}
    </div>
  );
}

/* ─── 홈: Journey to SEMO (/journey와 동일 데이터, 스텝마다 스크롤 등장) ─── */
function JourneyHomeSection() {
  const { language } = useI18n();
  const isEn = language === 'en';
  const { ref: titleRef, visible: titleVisible } = useScrollFadeIn(0.08);

  return (
    <section className="relative w-full overflow-hidden bg-white">
      <div className="mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 md:pb-20 md:pt-16 lg:pb-24 lg:pt-20">
        <div
          ref={titleRef}
          className="mb-12 overflow-x-auto text-center [-ms-overflow-style:none] [scrollbar-width:none] md:mb-16 [&::-webkit-scrollbar]:hidden"
        >
          <h2
            className={`text-xl font-semibold tracking-tight text-slate-900 transition-all duration-700 sm:text-2xl md:text-3xl ${
              titleVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
          >
            Journey to SEMO
          </h2>
          <p
            className={`${JOURNEY_INTRO_SUBLINE_CLASS} transition-all delay-150 duration-700 ${
              titleVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            }`}
          >
            {isEn
              ? 'From AI Skin Testing to Direct Korea Delivery—Complete Your Skincare in 4 Easy Steps.'
              : 'От AI-теста кожи до прямой доставки из Кореи — идеальный уход в 4 простых шага.'}
          </p>
          <div
            className={`mx-auto mt-5 h-px w-10 bg-gradient-to-r from-transparent via-brand/35 to-transparent transition-all delay-200 duration-700 ${
              titleVisible ? 'scale-x-100 opacity-100' : 'scale-x-0 opacity-0'
            }`}
          />
        </div>

        <div className="space-y-16 md:space-y-24">
          {JOURNEY_STEPS.map((step, index) => {
            const isImageLeft = index % 2 === 0;
            const stepNum = index + 1;
            const titleText = isEn ? step.title.en : step.title.ru;
            return (
              <OrderStepReveal key={step.title.en} staggerIndex={index} className="block w-full">
                <article className="grid gap-8 md:grid-cols-2 md:items-center md:gap-10 lg:gap-14">
                  <div className={`overflow-hidden rounded-2xl bg-slate-100 ${isImageLeft ? '' : 'md:order-2'}`}>
                    {step.imageUrl ? (
                      <JourneyStepImage src={step.imageUrl} alt={titleText} loading="lazy" />
                    ) : (
                      <div className="flex min-h-[220px] w-full items-center justify-center bg-gradient-to-br from-brand-soft/30 to-slate-100 sm:min-h-[280px] md:min-h-[320px]">
                        <span className="text-4xl font-semibold text-slate-300">{step.imagePlaceholder}</span>
                      </div>
                    )}
                  </div>
                  <div className={`flex min-w-0 flex-col justify-center ${isImageLeft ? '' : 'md:order-1'}`}>
                    <span className="text-sm font-semibold tracking-wide text-brand">Step {stepNum}</span>
                    <h3
                      className={`mt-2 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl ${
                        step.titleSingleLineMd
                          ? 'md:whitespace-nowrap md:text-base lg:text-xl xl:text-2xl 2xl:text-3xl'
                          : ''
                      }`}
                    >
                      {titleText}
                    </h3>
                    <p className="prose-ru mt-4 text-base leading-relaxed text-slate-600 sm:mt-5">
                      {isEn ? step.description.en : step.description.ru}
                    </p>
                  </div>
                </article>
              </OrderStepReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** 쇼케이스 카드: 스크롤로 구간 진입 시 아래에서 위로 한 번 등장 */
function ShowcaseItemReveal({
  children,
  staggerIndex,
}: {
  children: React.ReactNode;
  staggerIndex: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -4% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`transform-gpu transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-auto md:duration-[780ms] md:will-change-transform ${
        shown ? 'translate-y-0 opacity-100' : 'max-md:translate-y-6 translate-y-14 opacity-0'
      }`}
      style={{ transitionDelay: shown ? `${staggerIndex * 95}ms` : '0ms' }}
    >
      {children}
    </div>
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

type MarketPriceRow = {
  product_id: string;
  currency: AppCurrency;
  rrp_price: number | null;
  prp_price: number | null;
};

type MarketPriceMap = Record<string, Partial<Record<AppCurrency, { rrp_price: number | null; prp_price: number | null }>>>;

function resolveDisplayPrices(
  baseRrp: number | null,
  basePrp: number | null,
  marketPrice?: { rrp_price: number | null; prp_price: number | null },
) {
  const hasMarket = marketPrice != null &&
    (marketPrice.rrp_price != null || marketPrice.prp_price != null);
  const useRrp = hasMarket ? (marketPrice!.rrp_price ?? baseRrp) : baseRrp;
  const usePrp = hasMarket ? (marketPrice!.prp_price ?? marketPrice!.rrp_price ?? basePrp) : basePrp;
  return {
    price: usePrp ?? useRrp ?? 0,
    originalPrice: usePrp != null && useRrp != null && usePrp !== useRrp ? useRrp : null,
  };
}

type HomeReviewItem = {
  id: string;
  body: string | null;
  rating: number;
  created_at: string;
  user_id: string;
  product_id: string | null;
  product_name?: string;
  author_name?: string;
  /** 리뷰 첨부 사진 (랜딩 카드 썸네일) */
  review_photos?: { image_url: string }[];
};

const SHOWCASE_TABS = [
  { key: 'beauty', label: 'Beauty box', category: 'beauty' },
  { key: 'inner', label: 'Fit box', category: 'inner_beauty' },
  { key: 'hair', label: 'Hair box', category: 'hair_beauty' },
] as const;

function formatPrice(price: number, currency: 'RUB' | 'USD' | 'KZT' | 'UZS'): string {
  return formatCurrencyAmount(price, currency);
}

function ShowcaseImageWithIndicator({
  imageUrl,
  secondImageUrl,
  alt,
}: {
  imageUrl: string | null;
  secondImageUrl: string | null;
  alt: string;
}) {
  const images = [imageUrl, secondImageUrl].filter(Boolean) as string[];
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [imageUrl, secondImageUrl]);

  const canSlide = images.length > 1;

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canSlide) return;
    touchStartXRef.current = e.touches[0].clientX;
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!canSlide) return;
    const diff = e.changedTouches[0].clientX - touchStartXRef.current;
    if (Math.abs(diff) < 28) return;
    if (diff < 0) {
      setActiveIndex((prev) => (prev + 1) % images.length);
      return;
    }
    setActiveIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  return (
    <div
      className="relative mb-4 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl bg-transparent sm:h-52"
      onMouseEnter={() => {
        if (canSlide) setActiveIndex(1);
      }}
      onMouseLeave={() => {
        setActiveIndex(0);
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {images.length > 0 ? (
        images.map((src, idx) => (
          <img
            key={`${src}-${idx}`}
            src={src}
            alt={alt}
            className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
              idx === activeIndex ? 'opacity-100' : 'opacity-0'
            }`}
          />
        ))
      ) : (
        <span className="text-xs text-slate-300">Нет фото</span>
      )}

      {canSlide && (
        <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1">
          {images.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${
                idx === activeIndex ? 'w-4 bg-brand/90' : 'w-1.5 bg-slate-300/90'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProductShowcase() {
  const { language, currency } = useI18n();
  const { ref: sectionRef, visible } = useScrollFadeIn(0.1);
  const [activeTab, setActiveTab] = useState<string>('beauty');
  const [products, setProducts] = useState<Record<string, ShowcaseItem[]>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: slotRowsRaw }, { data: visRow }] = await Promise.all([
          supabase
            .from(CATALOG_ROOM_SLOTS_TABLE)
            .select('catalog_room, slot_index, title, image_url, product_id')
            .in('catalog_room', ['beauty', 'inner_beauty', 'hair_beauty'])
            .order('catalog_room', { ascending: true })
            .order('slot_index', { ascending: true }),
          supabase.from('site_settings').select('value').eq('key', CATALOG_SLOT_VISIBLE_BY_ROOM_KEY).maybeSingle(),
        ]);

        const visMap = parseCatalogVisibleByRoom(visRow?.value);
        const ROOMS: CatalogSlotRoom[] = ['beauty', 'inner_beauty', 'hair_beauty'];
        const byRoom = new Map<
          CatalogSlotRoom,
          { catalog_room: CatalogSlotRoom; slot_index: number; title: string | null; image_url: string | null; product_id: string | null }[]
        >();
        for (const r of ROOMS) byRoom.set(r, []);
        for (const row of (slotRowsRaw ?? []) as {
          catalog_room: CatalogSlotRoom;
          slot_index: number;
          title: string | null;
          image_url: string | null;
          product_id: string | null;
        }[]) {
          byRoom.get(row.catalog_room)?.push(row);
        }

        type SlotRow = {
          slot_index: number;
          title: string | null;
          image_url: string | null;
          product_id: string | null;
          groupKey: CatalogSlotRoom;
        };
        const slots: SlotRow[] = [];
        for (const r of ROOMS) {
          const arr = (byRoom.get(r) ?? []).slice().sort((a, b) => a.slot_index - b.slot_index);
          const fallbackCap = Math.min(CATALOG_SLOT_ROW_PERSIST, Math.max(1, arr.length));
          const catalogVisible = clampCatalogVisibleCount(visMap[r] ?? fallbackCap, fallbackCap);
          const n = Math.min(arr.length, catalogVisible);
          for (const row of arr.slice(0, n)) {
            slots.push({
              slot_index: row.slot_index,
              title: row.title,
              image_url: row.image_url,
              product_id: row.product_id,
              groupKey: r,
            });
          }
        }

        const productIds = [...new Set(slots.map((s) => s.product_id).filter(Boolean))] as string[];
        const marketPriceMap: MarketPriceMap = {};
        if (productIds.length > 0) {
          const resultMap = await loadProductMarketPrices(supabase, productIds);
          resultMap.forEach((rows, productId) => {
            marketPriceMap[productId] = {};
            rows.forEach((r) => {
              marketPriceMap[productId][r.currency as AppCurrency] = {
                rrp_price: r.rrp_price != null ? Number(r.rrp_price) : null,
                prp_price: r.prp_price != null ? Number(r.prp_price) : null,
              };
            });
          });
        }
        let priceMap: Record<
          string,
          {
            name?: string | null;
            rrp_price: number;
            prp_price: number | null;
            image_url: string | null;
            image_urls: string[] | null;
            category: string | null;
          }
        > = {};
        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from('products')
            .select('id, name, category, rrp_price, prp_price, image_url, image_urls')
            .in('id', productIds);
          if (prods) {
            for (const p of prods as {
              id: string;
              name?: string | null;
              category: string | null;
              rrp_price: number;
              prp_price: number | null;
              image_url: string | null;
              image_urls: string[] | null;
            }[]) {
              priceMap[p.id] = p;
            }
          }
        }

        const grouped: Record<string, ShowcaseItem[]> = {};
        for (const slot of slots) {
          const cat = slot.groupKey;
          if (!grouped[cat]) grouped[cat] = [];
          const prod = slot.product_id ? priceMap[slot.product_id] : null;
          // 슬롯의 catalog_room 이 진실 소스 — products.category 문자열과 다르더라도 노출 (구버전 불일치 필터로 일부 칸이 사라지던 문제 제거)
          // 상품에 연결된 경우 대표 이미지는 상품 기준 우선 — 슬롯 image_url이 남아 있으면 관리자가 상품만 갱신해도 메인에 안 보이는 문제(헤어 등) 방지
          const imgUrls =
            prod && Array.isArray(prod.image_urls) && prod.image_urls.length > 0
              ? prod.image_urls.filter((u): u is string => !!u)
              : prod?.image_url
                ? [prod.image_url]
                : [];
          const productPrimary = imgUrls[0] ?? prod?.image_url ?? null;
          const slotImg = slot.image_url?.trim() || null;
          const primaryImg = productPrimary ?? slotImg ?? null;
          // 두번째 이미지: image_urls에서 첫번째 이미지와 다른 것 선택
          const secondImg = imgUrls.find((u) => u && u !== primaryImg) ?? (imgUrls.length > 1 ? imgUrls[1] : null);
          const displayName = (
            prod?.name?.trim() ||
            slot.title ||
            (language === 'en' ? `Slot ${slot.slot_index + 1}` : `Слот ${slot.slot_index + 1}`)
          ).trim();
          if (isLegacyMockCatalogProductName(displayName)) continue;
          grouped[cat].push({
            id: slot.product_id ?? `slot-${slot.slot_index}`,
            name: displayName,
            price: resolveDisplayPrices(
              prod?.rrp_price ?? null,
              prod?.prp_price ?? null,
              slot.product_id ? marketPriceMap[slot.product_id]?.[currency] : undefined,
            ).price,
            originalPrice: resolveDisplayPrices(
              prod?.rrp_price ?? null,
              prod?.prp_price ?? null,
              slot.product_id ? marketPriceMap[slot.product_id]?.[currency] : undefined,
            ).originalPrice,
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
  }, [currency, language]);

  const currentItems = products[activeTab] ?? [];

  return (
    <section ref={sectionRef} className="w-full py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2
          className={`mb-8 text-center text-lg font-medium tracking-normal text-slate-800 transition-all duration-700 sm:text-xl ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          SEMO Box
        </h2>

        {/* 탭 — 3열 동일 너비, 본문·네비와 맞는 Montserrat 계열 크기(모바일 과소 글자 제거) */}
        <div
          className={`mx-auto mb-10 grid w-full max-w-3xl grid-cols-3 gap-3 transition-all duration-700 sm:gap-6 md:gap-8 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '100ms' : '0ms' }}
        >
          {SHOWCASE_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.category)}
              className={`flex min-h-[44px] w-full min-w-0 items-center justify-center rounded-full border px-2 py-2.5 text-center text-sm font-medium leading-snug tracking-normal transition-all sm:min-h-11 sm:px-3 sm:text-sm md:text-[0.9375rem] ${
                activeTab === t.category
                  ? 'border-brand bg-brand text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:text-slate-800'
              }`}
            >
              <span className="block max-w-full hyphens-auto whitespace-normal [overflow-wrap:anywhere]">{t.label}</span>
            </button>
          ))}
        </div>

        {/* 상품 그리드 */}
        {loading ? (
          <div className="flex justify-center py-16">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
          </div>
        ) : currentItems.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{language === 'en' ? 'Products will appear here soon!' : 'Скоро здесь появятся товары!'}</p>
        ) : (
          /* w-full로 2열 유지 → sm+는 w-fit+고정 카드 너비로 한 줄 그룹을 mx-auto로 확실히 중앙 정렬 */
          <div className="flex w-full justify-center">
            <div className="flex w-full max-w-full flex-wrap justify-center gap-5 sm:w-auto sm:gap-6">
            {currentItems.slice(0, 5).map((item, idx) => (
              <div
                key={`${activeTab}-${item.id}`}
                className={`min-w-0 w-[calc((100%-1.25rem)/2)] sm:w-[12.75rem] sm:max-w-[12.75rem] sm:flex-shrink-0 ${idx >= 4 ? 'hidden sm:block' : ''}`}
              >
              <ShowcaseItemReveal staggerIndex={idx}>
                <Link
                  to={`/product/${item.id}`}
                  className="group flex flex-col items-center rounded-3xl border border-slate-100/80 bg-white p-5 shadow-[0_2px_20px_-4px_rgba(0,0,0,0.05)] transition-shadow duration-500 hover:shadow-[0_8px_30px_-6px_rgba(0,0,0,0.1)] sm:p-6"
                >
                  <ShowcaseImageWithIndicator
                    imageUrl={item.imageUrl}
                    secondImageUrl={item.secondImageUrl}
                    alt={item.name}
                  />
                  <p className="mb-3 line-clamp-2 text-center text-sm font-medium tracking-normal text-slate-700 transition-colors group-hover:text-brand sm:text-base">
                    {item.name}
                  </p>
                  <div className="flex flex-col items-center gap-0.5">
                    {item.originalPrice != null && (
                      <span className="text-xs text-slate-300 line-through">{formatPrice(item.originalPrice, currency)}</span>
                    )}
                    <span className="text-sm font-semibold text-slate-800">{formatPrice(item.price, currency)}</span>
                  </div>
                </Link>
              </ShowcaseItemReveal>
              </div>
            ))}
            </div>
          </div>
        )}

        <div
          className={`mt-8 flex justify-center transition-all duration-700 sm:hidden ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '500ms' : '0ms' }}
        >
          <Link
            to={activeTab === 'beauty' ? '/shop' : activeTab === 'inner_beauty' ? '/inner-beauty' : '/hair-beauty'}
            className="group inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-200 px-6 py-2.5 text-sm font-medium tracking-normal text-slate-600 transition-all hover:border-brand hover:text-brand"
          >
            {language === 'en' ? 'View all' : 'Смотреть все'}
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

      </div>
    </section>
  );
}

function HomeReviews() {
  const { language, country, currency } = useI18n();
  const { ref: sectionRef, visible } = useScrollFadeIn(0.1);
  const [reviews, setReviews] = useState<HomeReviewItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: reviewData } = await supabase
          .from('product_reviews')
          .select('id, body, rating, created_at, user_id, product_id')
          .order('created_at', { ascending: false })
          .limit(6);
        if (cancelled) return;
        const rows = (reviewData ?? []) as HomeReviewItem[];
        if (rows.length === 0) {
          setReviews([]);
          return;
        }

        const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))];
        const productIds = [...new Set(rows.map((r) => r.product_id).filter(Boolean))] as string[];

        let profileMap: Record<string, string> = {};
        let productMap: Record<string, string> = {};

        if (userIds.length > 0) {
          const { data: profileData } = await supabase
            .from('profiles')
            .select('id, name')
            .in('id', userIds);
          (profileData ?? []).forEach((p: { id: string; name: string | null }) => {
            profileMap[p.id] = p.name?.trim() || (language === 'en' ? 'SEMO customer' : 'Покупатель SEMO');
          });
        }

        if (productIds.length > 0) {
          const { data: productData } = await supabase
            .from('products')
            .select('id, name')
            .in('id', productIds);
          (productData ?? []).forEach((p: { id: string; name: string | null }) => {
            productMap[p.id] = p.name?.trim() || 'SEMO Box';
          });
        }

        const reviewIds = rows.map((r) => r.id);
        const photosMap: Record<string, { image_url: string }[]> = {};
        if (reviewIds.length > 0) {
          const { data: photoRows } = await supabase
            .from('review_photos')
            .select('review_id, image_url, sort_order')
            .in('review_id', reviewIds);
          const grouped: Record<string, { image_url: string; sort_order: number }[]> = {};
          (photoRows ?? []).forEach((ph: { review_id: string; image_url: string; sort_order?: number | null }) => {
            if (!ph.review_id || !ph.image_url?.trim()) return;
            if (!grouped[ph.review_id]) grouped[ph.review_id] = [];
            grouped[ph.review_id].push({
              image_url: ph.image_url.trim(),
              sort_order: Number(ph.sort_order) || 0,
            });
          });
          Object.keys(grouped).forEach((rid) => {
            grouped[rid].sort((a, b) => a.sort_order - b.sort_order);
            photosMap[rid] = grouped[rid].map((x) => ({ image_url: x.image_url }));
          });
        }

        setReviews(
          rows.map((r) => ({
            ...r,
            author_name: profileMap[r.user_id] ?? (language === 'en' ? 'SEMO customer' : 'Покупатель SEMO'),
            product_name: r.product_id ? productMap[r.product_id] ?? 'SEMO Box' : 'SEMO Box',
            review_photos: photosMap[r.id] ?? [],
          })),
        );
      } catch {
        if (!cancelled) setReviews([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section ref={sectionRef} className="w-full pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-4">
        <h2
          className={`mb-8 text-center text-lg font-medium tracking-normal text-slate-800 transition-all duration-700 sm:text-xl ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
          }`}
        >
          {language === 'en' ? 'Customer reviews' : 'Отзывы клиентов'}
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
          </div>
        ) : reviews.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">{language === 'en' ? 'Reviews will appear here soon!' : 'Скоро здесь появятся отзывы!'}</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((r, idx) => (
              <div
                key={r.id}
                className={`rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_2px_16px_-6px_rgba(0,0,0,0.08)] transition-all duration-700 ${
                  visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
                }`}
                style={{ transitionDelay: visible ? `${120 + idx * 70}ms` : '0ms' }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-800">{r.author_name ?? (language === 'en' ? 'SEMO customer' : 'Покупатель SEMO')}</p>
                  <p className="shrink-0 text-[11px] text-slate-400">
                    {formatStorefrontDate(r.created_at, { language, country, currency })}
                  </p>
                </div>
                <p className="mb-2 line-clamp-1 text-xs font-medium text-brand">{r.product_name ?? 'SEMO Box'}</p>
                <p className="mb-3 text-sm text-amber-500">{'★'.repeat(Math.max(1, Math.min(5, Math.round(r.rating || 0))))}</p>
                {r.review_photos && r.review_photos.length > 0 ? (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {r.review_photos.slice(0, 6).map((ph, i) => (
                      <a
                        key={`${r.id}-ph-${i}`}
                        href={ph.image_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/80 transition hover:opacity-95"
                      >
                        <img src={ph.image_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : null}
                <p className="line-clamp-4 text-sm leading-relaxed text-slate-600">
                  {r.body?.trim() || (language === 'en' ? 'Great box, I will order again!' : 'Отличный набор, буду заказывать еще!')}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Home 메인 ─── */
export const Home: React.FC = () => {
  /** null = site_settings 로딩 중(히어로 자리 스켈레톤), [] = 슬라이드 없음, [...] = 캐러셀 */
  const [heroSlides, setHeroSlides] = useState<HeroSlide[] | null>(null);

  useEffect(() => {
    if (!supabase) {
      setHeroSlides([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('site_settings')
          .select('key, value')
          .eq('key', 'hero_images')
          .maybeSingle();
        if (cancelled) return;
        if (data?.value) {
          try {
            const parsed = JSON.parse(data.value);
            if (Array.isArray(parsed)) {
              setHeroSlides(parsed.filter((s: HeroSlide) => s.image_url));
              return;
            }
          } catch {
            // invalid JSON
          }
        }
        setHeroSlides([]);
      } catch {
        if (!cancelled) setHeroSlides([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <HeroCarousel key={heroSlides === null ? 'hero-loading' : 'hero-ready'} slides={heroSlides} />
      <JourneyHomeSection />
      <ProductShowcase />
      <HomeReviews />
    </>
  );
};
