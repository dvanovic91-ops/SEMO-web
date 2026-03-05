import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackArrow } from '../../components/BackArrow';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type ReviewRow = { id: string; product_id: string; product: string; text: string; date: string; rating: number };

export const ProfileReviews: React.FC = () => {
  const { isLoggedIn, initialized, userId } = useAuth();
  const [list, setList] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (reviewId: string) => {
    if (!supabase) return;
    if (!window.confirm('Удалить этот отзыв?')) return;
    setDeletingId(reviewId);
    try {
      await supabase.from('review_photos').delete().eq('review_id', reviewId);
      const { error } = await supabase.from('product_reviews').delete().eq('id', reviewId);
      if (error) throw error;
      setList((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (e) {
      console.error(e);
      window.alert(e instanceof Error ? e.message : 'Не удалось удалить отзыв.');
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!supabase || !userId) {
      setList([]);
      setLoading(false);
      return;
    }
    supabase
      .from('product_reviews')
      .select('id, product_id, rating, body, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(async ({ data: reviews }) => {
        if (!reviews?.length) {
          setList([]);
          return;
        }
        const ids = [...new Set((reviews as { product_id: string }[]).map((r) => r.product_id).filter(Boolean))];
        let names: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: products } = await supabase.from('products').select('id, name').in('id', ids);
          (products ?? []).forEach((p: { id: string; name: string | null }) => {
            names[p.id] = p.name ?? '';
          });
        }
        setList(
          (reviews as { id: string; product_id: string; rating: number; body: string; created_at: string }[]).map((r) => ({
            id: r.id,
            product_id: r.product_id ?? '',
            product: names[r.product_id] ?? '',
            text: r.body ?? '',
            date: r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU') : '',
            rating: r.rating ?? 0,
          }))
        );
      })
      .catch(() => setList([]))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-xl px-4 py-6 sm:px-6 sm:py-10 md:py-14">
      <p className="mb-6">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> Profile</Link>
      </p>
      <header className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
          Мои отзывы
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Оставленные вами отзывы о товарах
        </p>
      </header>

      {loading ? (
        <p className="text-center text-slate-500">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-8 text-center text-slate-500">
          Пока нет отзывов. Оформите заказ и оставьте отзыв — вам начислят баллы.
        </p>
      ) : (
        <ul className="space-y-4">
          {list.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-100 bg-white p-4 transition hover:border-slate-200">
              <div className="flex items-start justify-between gap-3">
                <Link
                  to={r.product_id ? `/product/${r.product_id}#product-reviews` : '/profile/reviews'}
                  className="min-w-0 flex-1"
                >
                  <p className="text-sm font-medium text-slate-800">{r.product}</p>
                  <p className="mt-1 text-sm text-slate-600">{r.text}</p>
                  <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span>{r.date}</span>
                    <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                  </p>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleDelete(r.id);
                  }}
                  disabled={deletingId === r.id}
                  className="shrink-0 rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  title="Удалить"
                  aria-label="Удалить"
                >
                  {deletingId === r.id ? (
                    <span className="text-xs">…</span>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
};
