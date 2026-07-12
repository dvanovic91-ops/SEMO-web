import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n } from '../context/I18nContext';
import { formatStorefrontDate } from '../lib/formatStorefrontDate';
import { JourneyStepArt } from '../components/JourneyStepArt';
import { JOURNEY_INTRO_SUBLINE_CLASS, JOURNEY_STEPS } from '../data/journeySteps';
import { BoxBuilderSkuCatalog } from '../components/BoxBuilderSkuCatalog';

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
              ? 'Perfect Korean skincare — already picked for you.'
              : 'Идеальный корейский уход — мы уже всё подобрали за вас.'}
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
                  <div className={`overflow-hidden rounded-2xl ${isImageLeft ? '' : 'md:order-2'}`}>
                    <JourneyStepArt index={index} compact />
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

/* ─── 상품 쇼케이스 (뷰티박스 SKU) ─── */
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

function ProductShowcase() {
  const { ref: sectionRef, visible } = useScrollFadeIn(0.1);
  const { language } = useI18n();

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

        <div
          className={`transition-all duration-700 ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '100ms' : '0ms' }}
        >
          <BoxBuilderSkuCatalog compact showEmptyMessage={false} />
        </div>

        <div
          className={`mt-8 flex justify-center transition-all duration-700 sm:hidden ${
            visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
          }`}
          style={{ transitionDelay: visible ? '500ms' : '0ms' }}
        >
          <Link
            to="/shop"
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
