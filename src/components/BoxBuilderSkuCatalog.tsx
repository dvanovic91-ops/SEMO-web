import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { supabase } from '../lib/supabase';
import { BOX_SLOT_ORDER, type BoxSlotKey } from '../lib/buildBoxCatalog';
import { loadBoxBuilderShopSkus, type BoxBuilderShopItem } from '../lib/boxBuilderShopCatalog';
import { SemoPageSpinner, SEMO_SECTION_LOADING_CLASS } from './SemoPageSpinner';
import { ShopCardImage } from '../pages/ShopCardImage';

// 카드 고정 크기 (px)
const CARD_W = 260;
const CARD_GAP = 14;
const CARD_STEP = CARD_W + CARD_GAP; // 한 칸 이동 거리
const SCROLL_SPEED = 0.45; // px / rAF frame (≈ 27px/s at 60fps — 천천히)
const PAUSE_MS = 2000;

function SkuCard({ item, language }: { item: BoxBuilderShopItem; language: string }) {
  const name = language === 'en' ? (item.nameEn || item.name) : item.name;

  const inner = (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_6px_-2px_rgba(15,23,42,0.10)] transition hover:shadow-md"
      style={{ width: CARD_W }}
    >
      <ShopCardImage
        embedded
        images={item.imageUrl ? [item.imageUrl] : []}
        name={name}
      />
      <div className="flex flex-1 flex-col items-center px-2 py-2 text-center">
        {item.brand && (
          <p className="mb-0.5 w-full truncate text-[9px] font-semibold uppercase tracking-wide text-slate-400">
            {item.brand}
          </p>
        )}
        <p className="line-clamp-2 min-h-[2.25rem] w-full text-center text-[11px] font-medium leading-snug text-slate-800">
          {name}
        </p>
      </div>
    </div>
  );

  return (
    <Link to={`/sku/${item.id}`} className="shrink-0 block">
      {inner}
    </Link>
  );
}

function InfiniteSkuScroll({ items, language }: { items: BoxBuilderShopItem[]; language: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollXRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const rafRef = useRef<number>(0);

  const n = items.length;
  const singleSetW = n * CARD_STEP;

  // 아이템 3배 복제 → 끊김 없는 무한 루프
  const displayItems = useMemo(() => [...items, ...items, ...items], [items]);

  useEffect(() => {
    if (n === 0) return;
    const animate = () => {
      if (Date.now() >= pauseUntilRef.current) {
        scrollXRef.current += SCROLL_SPEED;
        // 1세트 끝나면 처음으로 (시각적으로 티 안 남)
        if (scrollXRef.current >= singleSetW) {
          scrollXRef.current -= singleSetW;
        }
      }
      if (trackRef.current) {
        trackRef.current.style.transform = `translateX(-${scrollXRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [n, singleSetW]);

  const nav = (dir: 1 | -1) => {
    pauseUntilRef.current = Date.now() + PAUSE_MS;
    scrollXRef.current += dir * CARD_STEP;
    if (scrollXRef.current < 0) scrollXRef.current += singleSetW;
    if (scrollXRef.current >= singleSetW * 2) scrollXRef.current -= singleSetW;
    if (trackRef.current) {
      trackRef.current.style.transform = `translateX(-${scrollXRef.current}px)`;
    }
  };

  if (n === 0) return null;

  return (
    <div className="relative select-none">
      {/* 좌측 페이드 + < 버튼 */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-white to-transparent" />
      <button
        type="button"
        onClick={() => nav(-1)}
        className="absolute left-0 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm text-slate-500 hover:bg-slate-50 transition"
        aria-label="이전"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      {/* 스크롤 트랙 */}
      <div className="overflow-hidden mx-10">
        <div
          ref={trackRef}
          className="flex will-change-transform"
          style={{ gap: CARD_GAP, width: displayItems.length * CARD_STEP }}
        >
          {displayItems.map((item, i) => (
            <SkuCard key={`${item.id}-${i}`} item={item} language={language} />
          ))}
        </div>
      </div>

      {/* 우측 페이드 + > 버튼 */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-white to-transparent" />
      <button
        type="button"
        onClick={() => nav(1)}
        className="absolute right-0 top-1/2 z-20 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm text-slate-500 hover:bg-slate-50 transition"
        aria-label="다음"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

type BoxBuilderSkuCatalogProps = {
  compact?: boolean;
  showEmptyMessage?: boolean;
};

export function BoxBuilderSkuCatalog({ showEmptyMessage = true }: BoxBuilderSkuCatalogProps) {
  const { language, currency } = useI18n();
  const [grouped, setGrouped] = useState<Partial<Record<BoxSlotKey, BoxBuilderShopItem[]>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void loadBoxBuilderShopSkus(supabase, currency).then((g) => {
      setGrouped(g);
      setLoading(false);
    });
  }, [currency]);

  // 카테고리 무시하고 전체 SKU 하나의 배열로
  const allItems = BOX_SLOT_ORDER.flatMap((s) => grouped[s] ?? []);

  if (loading) {
    return (
      <div className={SEMO_SECTION_LOADING_CLASS} aria-busy="true">
        <SemoPageSpinner />
      </div>
    );
  }

  if (allItems.length === 0) {
    if (!showEmptyMessage) return null;
    return (
      <p className="py-12 text-center text-sm text-slate-400">
        {language === 'en' ? 'Products coming soon.' : 'Продукты скоро появятся.'}
      </p>
    );
  }

  return <InfiniteSkuScroll items={allItems} language={language} />;
}
