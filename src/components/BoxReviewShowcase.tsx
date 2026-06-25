import React from 'react';
import { Link } from 'react-router-dom';
import type { BuildCategory, BuildProduct, BoxSlotKey } from '../lib/buildBoxCatalog';
import { BOX_SLOT_LABELS } from '../lib/buildBoxCatalog';
import { buildBuildProductDetailHref } from '../lib/buildBoxNavigation';

type Props = {
  selected: (BuildProduct | null)[];
  categories: BuildCategory[];
  isEn: boolean;
  isPremium?: boolean;
  premiumAddons?: BuildProduct[];
};

function ProductFallback({ brand }: { brand: string }) {
  const initials = brand
    .split(/[\s']+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
      {initials || '?'}
    </div>
  );
}

function ShowcaseItem({
  product,
  slotKey,
  isEn,
  isPremiumItem = false,
}: {
  product: BuildProduct;
  slotKey: BoxSlotKey;
  isEn: boolean;
  isPremiumItem?: boolean;
}) {
  const name = isEn ? product.nameEn : product.nameRu;
  const slotLabel = BOX_SLOT_LABELS[slotKey]?.[isEn ? 'en' : 'ru'] ?? slotKey;
  const href = buildBuildProductDetailHref(product);

  const inner = (
    <>
      <span className="mb-2 text-center text-[8px] font-semibold uppercase tracking-[0.15em] text-brand/80 sm:text-[9px]">
        {slotLabel}
      </span>
      <div className="flex h-20 w-full items-center justify-center sm:h-24">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt=""
            className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <ProductFallback brand={product.brand} />
        )}
      </div>
      <p className="mt-2.5 w-full truncate text-center text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {product.brand}
      </p>
      <p className="mt-0.5 line-clamp-2 min-h-[2rem] w-full text-center text-[10px] font-medium leading-snug text-slate-800 sm:text-[11px]">
        {name}
      </p>
    </>
  );

  const className =
    `group flex min-w-0 flex-col items-center rounded-xl border bg-white p-2.5 shadow-sm transition duration-300 sm:p-3 ${
      isPremiumItem
        ? 'border-amber-300/80 hover:border-amber-400/60 hover:shadow-md'
        : 'border-slate-200/90 hover:border-brand/25 hover:shadow-md'
    }`;

  if (!href) {
    return <div className={className}>{inner}</div>;
  }

  return (
    <Link
      to={href}
      className={`${className} focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand/50`}
      title={name}
      aria-label={name}
    >
      {inner}
    </Link>
  );
}

export function BoxReviewShowcase({
  selected,
  categories,
  isEn,
  isPremium = false,
  premiumAddons = [],
}: Props) {
  const baseItems = selected
    .map((product, i) => ({
      product,
      slotKey: categories[i]?.key,
    }))
    .filter((item): item is { product: BuildProduct; slotKey: BoxSlotKey } =>
      Boolean(item.product && item.slotKey),
    );

  const premiumItems = isPremium ? premiumAddons : [];

  const itemCount = baseItems.length + premiumItems.length;

  return (
    <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-soft/80 via-white to-white"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"
        aria-hidden
      />

      <div className="relative px-3 py-5 sm:px-5 sm:py-6">
        <div className="mb-4 text-center sm:mb-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand">
            {isPremium ? 'SEMO Premium Box' : 'SEMO Box'}
          </p>
          <p className="mt-1.5 text-sm font-medium tracking-wide text-slate-600">
            {isPremium
              ? isEn
                ? `${itemCount} items · 6 curated + 2 premium`
                : `${itemCount} продуктов · 6 подобранных + 2 премиум`
              : isEn
                ? '6 items curated for you'
                : '6 продуктов, подобранных для тебя'}
          </p>
          <div
            className="mx-auto mt-3 h-px w-20 bg-gradient-to-r from-transparent via-brand/30 to-transparent"
            aria-hidden
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
          {baseItems.map(({ product, slotKey }) => (
            <ShowcaseItem
              key={slotKey}
              product={product}
              slotKey={slotKey}
              isEn={isEn}
            />
          ))}
        </div>

        {premiumItems.length > 0 && (
          <>
            <div className="my-4 flex items-center gap-2 sm:my-5">
              <div className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-300/50" />
              <p className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.15em] text-amber-600">
                {isEn ? 'Premium add-ons' : 'Премиум дополнения'}
              </p>
              <div className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-300/50" />
            </div>
            <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
              {premiumItems.map((product) => (
                <div
                  key={product.id}
                  className="w-[calc(50%-0.3125rem)] sm:w-[calc((100%-1.5rem)/3)]"
                >
                  <ShowcaseItem
                    product={product}
                    slotKey="premium"
                    isEn={isEn}
                    isPremiumItem
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
