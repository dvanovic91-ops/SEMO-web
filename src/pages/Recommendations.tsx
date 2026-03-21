import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { BackArrow } from '../components/BackArrow';
import { getSlotIndexForSkinType } from '../lib/skinTypeSlotMapping';
import { supabase } from '../lib/supabase';

/**
 * 피부 타입별 추천 상품 페이지. DB(skin_type_slot_mapping) 우선, 없으면 config.
 * 매칭된 슬롯의 상품이 있으면 즉시 해당 상품 상세로 리다이렉트.
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
        const slotIndex = await getSlotIndexForSkinType(typeLabel);
        if (cancelled) return;
        if (slotIndex == null || slotIndex < 1) {
          setNone(true);
          setLoading(false);
          return;
        }
        if (!supabase) {
          setNone(true);
          setLoading(false);
          return;
        }

        const { data: slotRows, error: slotErr } = await supabase
          .from('main_layout_slots')
          .select('slot_index, product_id')
          .order('slot_index', { ascending: true });

        if (cancelled) return;
        if (slotErr) {
          console.warn('[Recommendations] main_layout_slots:', slotErr.message);
          setNone(true);
          setLoading(false);
          return;
        }

        const rows = ((slotRows ?? []) as { slot_index: number; product_id: string | null }[])
          .slice()
          .sort((a, b) => a.slot_index - b.slot_index);
        if (rows.length === 0) {
          setNone(true);
          setLoading(false);
          return;
        }
        if (slotIndex > rows.length) {
          setNone(true);
          setLoading(false);
          return;
        }
        const row = rows[slotIndex - 1];
        const pid = row?.product_id ?? null;

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
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-slate-500">Загрузка…</p>
      </div>
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
            ? 'По результату теста типа кожи подобран товар из каталога Beauty Box.'
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
          Весь каталог Beauty Box
        </Link>
      </p>
    </main>
  );
};
