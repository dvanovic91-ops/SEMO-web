import React from 'react';
import { Link } from 'react-router-dom';
import {
  PRODUCT_DETAIL_SECTION_KICKER_BASE,
  PRODUCT_DETAIL_SECTION_KICKER_SIZE,
  PRODUCT_DETAIL_WHITE_CARD_INNER,
} from '../lib/productDetailSectionClasses';
import { formatProductTypeForLanguage } from '../lib/productTypeStoreLabels';
import { formatStorefrontLineTitle } from '../lib/skuStorefrontTitle';
import { useI18n } from '../context/I18nContext';

/** 상세·피부테스트 결과에서 동일하게 쓰는 구성품 한 줄 */
export type ProductCompositionItem = {
  id: string;
  name: string | null;
  /** 펼침 카드 대제목 — 브랜드만 표시 */
  brand?: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  /** 한국어 설명 (관리탭·기본 fallback) */
  description?: string | null;
  /** 영문 설명 — language==='en' 일 때 우선 사용 */
  description_en?: string | null;
  /** 러시아어 설명 — language==='ru' 일 때 우선 사용 */
  description_ru?: string | null;
  /** 스토어 구성품 상세로 이동할 때 사용 */
  sku_id?: string | null;
  /** key_ingredients_desc.__claim__ — 핵심 마케팅 한 줄 */
  marketing_claim?: string | null;
  marketing_claim_en?: string | null;
  marketing_claim_ru?: string | null;
  /** sku_items.product_type — 썸네일 위 소형 유형 라벨 */
  product_type?: string | null;
  /** 관리자 구성에서 커스터마이징 여부 (AI 프롬프트 컨텍스트용) */
  is_customized?: boolean;
  /** 핵심 성분 요약 (AI 프롬프트 컨텍스트용) */
  key_ingredients?: string | null;
};

function getComponentImageUrls(comp: ProductCompositionItem): string[] {
  if (comp.image_urls && Array.isArray(comp.image_urls) && comp.image_urls.length > 0) return comp.image_urls;
  return comp.image_url ? [comp.image_url] : [];
}

type Props = {
  components: ProductCompositionItem[];
  /** 바깥 흰 카드에 붙는 여백 등 (기본 mt-6, 상세 헤더 카드와 동일) */
  className?: string;
  /** true일 때만 «Состав набора» 제목을 모바일에서 1pt 작게 (데스크톱은 text-xs 유지) */
  tighterMobileComposeTitle?: boolean;
  /** 설정 시 구성품 타일이 `/product/:id/component/:skuId` 로 연결됨 */
  parentProductId?: string;
};

/** 유형 라벨 — 썸네일 아래 (컴팩트 그리드용). 이미지–텍스트 간격은 썸네일 하단 ~ 라벨 상단 margin */
function ProductTypeLabel({ label }: { label: string }) {
  return (
    <span className="mt-[0.825rem] block max-w-full text-center text-[0.7rem] font-medium leading-tight tracking-tight text-slate-500 line-clamp-2 sm:mt-[1.1rem] sm:text-[0.8125rem] md:mt-[0.825rem] md:text-[0.75rem]">
      {label}
    </span>
  );
}

/**
 * «Состав набора» — 유형 라벨 + 썸네일만. md 이상 한 행 6칸 그리드.
 */
export function ProductCompositionGrid({
  components,
  className,
  tighterMobileComposeTitle = false,
  parentProductId,
}: Props) {
  const { language } = useI18n();
  const isEn = language === 'en';

  if (components.length === 0) return null;

  const outer = className ?? 'mt-6';
  /** 예전 slice(0,8)는 9번째 이후 구성품이 “삭제된 것처럼” 보이게 함 — DB·관리자는 최대 8개 권장이나 전량 표시 */
  const rows = components;
  const titleClass = `min-w-0 text-left ${PRODUCT_DETAIL_SECTION_KICKER_BASE} ${
    tighterMobileComposeTitle ? 'text-[0.6875rem] sm:text-[0.7rem]' : PRODUCT_DETAIL_SECTION_KICKER_SIZE
  }`;

  const focusRing =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2';

  return (
    <div
      className={`${outer} overflow-hidden rounded-2xl bg-white shadow-[0_2px_16px_-8px_rgba(15,23,42,0.12)] ring-1 ring-slate-200/60`}
    >
      <div className={`bg-white ${PRODUCT_DETAIL_WHITE_CARD_INNER}`}>
        <div className="mb-3 sm:mb-4">
          <p className={titleClass}>{isEn ? 'Box composition' : 'Состав набора'}</p>
        </div>

        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 sm:gap-2.5 md:grid-cols-6 md:gap-2 lg:gap-2.5">
          {rows.map((comp) => {
            const imgs = getComponentImageUrls(comp);
            const firstImg = imgs[0];
            const typeLabelRow = formatProductTypeForLanguage(comp.product_type, language);
            const skuId = comp.sku_id?.trim();
            const brandLine = (comp.brand ?? '').trim() ? formatStorefrontLineTitle((comp.brand ?? '').trim()) : null;
            const productTitle = (comp.name ?? '').trim() ? formatStorefrontLineTitle((comp.name ?? '').trim()) : null;
            const imgAlt = [brandLine, productTitle].filter(Boolean).join(' — ') || (isEn ? 'Component' : 'Компонент');
            const tileInner = (
              <div className="flex min-w-0 flex-col items-center">
                <div className="aspect-square w-full min-w-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200/60 shadow-sm sm:rounded-xl md:rounded-lg">
                  {firstImg ? (
                    <img src={firstImg} alt={imgAlt} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-300 sm:text-xs">—</div>
                  )}
                </div>
                {typeLabelRow ? (
                  <ProductTypeLabel label={typeLabelRow} />
                ) : (
                  <div className="mt-[0.825rem] h-4 shrink-0 sm:mt-[1.1rem] md:h-3.5" />
                )}
              </div>
            );
            if (parentProductId && skuId) {
              return (
                <li key={`tile-${comp.id}`} className="min-w-0 p-0">
                  <Link
                    to={`/product/${parentProductId}/component/${skuId}`}
                    className={`block rounded-lg p-0.5 transition hover:opacity-90 sm:p-1 md:p-0.5 ${focusRing}`}
                  >
                    {tileInner}
                  </Link>
                </li>
              );
            }
            return (
              <li key={`tile-${comp.id}`} className="min-w-0 p-0">
                {tileInner}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
