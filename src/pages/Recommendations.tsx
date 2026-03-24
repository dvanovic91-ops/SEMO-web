import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BackArrow } from '../components/BackArrow';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';
import { getRecommendedProductIdForSkinType } from '../lib/skinTypeSlotMapping';

/**
 * 피부 타입별 추천 → **뷰티박스** 슬롯·상품만 사용 (getRecommendedProductIdForSkinType).
 * 핏/헤어 카탈로그와 분리됨.
 */
export const Recommendations: React.FC = () => {
  const { skinType } = useParams<{ skinType?: string }>();
  const typeLabel = (skinType ?? '').trim().toUpperCase() || null;

  const [productId, setProductId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!typeLabel);
  const [none, setNone] = useState(false);

  useEffect(() => {
    if (!typeLabel) {
      setLoading(false);
      setNone(true);
      return;
    }
    setLoading(true);
    setNone(false);
    setProductId(null);
    let cancelled = false;

    (async () => {
      try {
        const pid = await getRecommendedProductIdForSkinType(typeLabel);
        if (cancelled) return;
        if (pid) {
          setProductId(pid);
        } else {
          setNone(true);
        }
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          console.warn('[Recommendations]', e);
          setNone(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [typeLabel]);

  if (typeLabel && productId) {
    return <Navigate to={`/product/${productId}`} replace />;
  }
  if (typeLabel && !loading && (none || !productId)) {
    return <Navigate to="/shop" replace />;
  }
  if (typeLabel && loading) {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      {typeLabel ? (
        <p className="mb-6">
          <Link
            to="/profile/test-results"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"
          >
            <BackArrow />
            Результаты тестов
          </Link>
        </p>
      ) : null}
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          {typeLabel
            ? `Рекомендуемый товар для типа ${typeLabel}`
            : 'Рекомендуемые товары'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {typeLabel
            ? 'По результату теста типа кожи подобран товар из каталога SEMO Box.'
            : 'Пройдите тест типа кожи, чтобы увидеть персональную рекомендацию.'}
        </p>
      </header>
      {!typeLabel ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-600">
          <p className="mb-4">Пройдите тест типа кожи для рекомендации.</p>
          <Link
            to="/skin-test"
            className="inline-block rounded-full bg-brand px-6 py-2.5 text-sm font-medium text-white hover:bg-brand/90"
          >
            Пройти тест типа кожи
          </Link>
        </div>
      ) : null}
      <p className="mt-8">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90">
          Весь каталог SEMO Box
        </Link>
      </p>
    </main>
  );
};
