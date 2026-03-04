import React, { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { BackArrow } from '../components/BackArrow';

type Product = {
  id: string;
  name: string;
  description: string | null;
  detail_description: string | null;
  image_url: string | null;
  rrp_price: number | null;
  prp_price: number | null;
  stock: number | null;
};

type Component = {
  id: string;
  sort_order: number;
  name: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  description: string | null;
};

/** 구성품 이미지 URL 배열 (image_urls 우선, 없으면 [image_url]) */
function getComponentImageUrls(comp: Component): string[] {
  if (comp.image_urls && Array.isArray(comp.image_urls) && comp.image_urls.length > 0) return comp.image_urls;
  return comp.image_url ? [comp.image_url] : [];
}

type Review = {
  id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  profiles?: { name: string | null } | null;
  review_photos?: { image_url: string }[];
};

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

/** UUID 형식인지 (DB products.id는 UUID) */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** 뷰티박스 폴백 상품 (DB에 슬롯/상품 없을 때 Shop에서 링크하는 ID용) */
const FALLBACK_PRODUCTS: Record<string, Product> = {
  'type-1': { id: 'type-1', name: 'Тип 1', description: null, detail_description: null, image_url: null, rrp_price: 12000, prp_price: 11000, stock: null },
  'type-2': { id: 'type-2', name: 'Тип 2', description: null, detail_description: null, image_url: null, rrp_price: 12000, prp_price: 11000, stock: null },
  'type-3': { id: 'type-3', name: 'Тип 3', description: null, detail_description: null, image_url: null, rrp_price: 12000, prp_price: 11000, stock: null },
  'type-4': { id: 'type-4', name: 'Тип 4', description: null, detail_description: null, image_url: null, rrp_price: 12000, prp_price: 11000, stock: null },
  'family': { id: 'family', name: 'Family care', description: null, detail_description: null, image_url: null, rrp_price: 14000, prp_price: 13000, stock: null },
};
[0, 1, 2, 3, 4].forEach((i) => {
  const id = `slot-${i}`;
  if (!FALLBACK_PRODUCTS[id]) FALLBACK_PRODUCTS[id] = { id, name: `Слот ${i + 1}`, description: null, detail_description: null, image_url: null, rrp_price: 12000, prp_price: 11000, stock: null };
});

export const ProductDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { isLoggedIn, userId } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewPhotoUrls, setReviewPhotoUrls] = useState<string[]>([]);
  const [reviewPhotoFiles, setReviewPhotoFiles] = useState<File[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const BUCKET_REVIEW_PHOTOS = 'review-photos';

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    let cancelled = false;

    if (!isUuid(id) && FALLBACK_PRODUCTS[id]) {
      setProduct(FALLBACK_PRODUCTS[id]);
      setComponents([]);
      setReviews([]);
      setLoading(false);
      return;
    }

    if (!supabase) {
      setLoading(false);
      return;
    }

    const load = async () => {
      const currentId = id;
      const { data: prodData, error: prodErr } = await supabase
        .from('products')
        .select('id, name, description, detail_description, image_url, rrp_price, prp_price, stock')
        .eq('id', currentId)
        .single();

      if (cancelled || currentId !== id) return;
      if (prodErr || !prodData) {
        setLoading(false);
        return;
      }
      setProduct(prodData as Product);

      await supabase.from('product_views').insert({ product_id: currentId });

      const { data: compData } = await supabase
        .from('product_components')
        .select('id, sort_order, name, image_url, image_urls, description')
        .eq('product_id', currentId)
        .order('sort_order');
      if (cancelled || currentId !== id) return;
      setComponents((compData as Component[]) ?? []);

      const { data: reviewData } = await supabase
        .from('product_reviews')
        .select('id, user_id, rating, body, created_at')
        .eq('product_id', currentId)
        .order('created_at', { ascending: false });
      const reviewsList = (reviewData as Review[]) ?? [];
      const reviewIds = reviewsList.map((r) => r.id);
      let photosMap: Record<string, { image_url: string }[]> = {};
      if (reviewIds.length > 0) {
        const { data: photoData } = await supabase
          .from('review_photos')
          .select('review_id, image_url')
          .in('review_id', reviewIds);
        (photoData ?? []).forEach((ph: { review_id: string; image_url: string }) => {
          if (!photosMap[ph.review_id]) photosMap[ph.review_id] = [];
          photosMap[ph.review_id].push({ image_url: ph.image_url });
        });
      }
      if (cancelled || currentId !== id) return;
      setReviews(
        reviewsList.map((r) => ({ ...r, profiles: null, review_photos: photosMap[r.id] ?? [] })),
      );
      setLoading(false);
    };

    void load();
    return () => { cancelled = true; };
  }, [id]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !id || !supabase || !isUuid(id)) {
      setReviewError('Войдите, чтобы оставить отзыв.');
      return;
    }
    if (reviewBody.trim().length === 0) {
      setReviewError('Напишите текст отзыва.');
      return;
    }
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < reviewPhotoFiles.length; i++) {
        const file = reviewPhotoFiles[i];
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `${userId}/${Date.now()}_${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_REVIEW_PHOTOS)
          .upload(path, file, { cacheControl: '3600', upsert: false });
        if (upErr) {
          setReviewError('Не удалось загрузить фото.');
          setSubmittingReview(false);
          return;
        }
        const { data: urlData } = supabase.storage.from(BUCKET_REVIEW_PHOTOS).getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
      const allUrls = [...uploadedUrls, ...reviewPhotoUrls.filter(Boolean)];

      const { data: reviewRow, error: revErr } = await supabase
        .from('product_reviews')
        .insert({ product_id: id, user_id: userId, rating: reviewRating, body: reviewBody.trim() })
        .select('id')
        .single();
      if (revErr) throw revErr;
      if (reviewRow && allUrls.length > 0) {
        await supabase.from('review_photos').insert(
          allUrls.map((url, i) => ({
            review_id: reviewRow.id,
            image_url: url,
            sort_order: i,
          })),
        );
      }
      setReviewBody('');
      setReviewRating(5);
      setReviewPhotoUrls([]);
      setReviewPhotoFiles([]);
      const { data: reviewData } = await supabase
        .from('product_reviews')
        .select('id, user_id, rating, body, created_at')
        .eq('product_id', id)
        .order('created_at', { ascending: false });
      const reviewsList = (reviewData as Review[]) ?? [];
      const reviewIds = reviewsList.map((r) => r.id);
      let photosMap: Record<string, { image_url: string }[]> = {};
      if (reviewIds.length > 0) {
        const { data: photoData } = await supabase
          .from('review_photos')
          .select('review_id, image_url')
          .in('review_id', reviewIds);
        (photoData ?? []).forEach((ph: { review_id: string; image_url: string }) => {
          if (!photosMap[ph.review_id]) photosMap[ph.review_id] = [];
          photosMap[ph.review_id].push({ image_url: ph.image_url });
        });
      }
      setReviews(
        reviewsList.map((r) => ({ ...r, profiles: null, review_photos: photosMap[r.id] ?? [] })),
      );
    } catch (err) {
      setReviewError('Не удалось отправить отзыв.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    addItem({ id: product.id, name: product.name, price: Number(product.prp_price ?? product.rrp_price ?? 0) });
  };

  if (loading || !product) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        {!loading && !product && (
          <p className="text-slate-600">Товар не найден.</p>
        )}
        {loading && <p className="text-slate-500">Загрузка…</p>}
        <p className="mt-4">
          <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> В каталог</Link>
        </p>
      </main>
    );
  }

  const price = product.prp_price ?? product.rrp_price;
  const hasDiscount = product.prp_price != null && product.rrp_price != null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="mb-6">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> В каталог</Link>
      </p>

      <article className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {product.name}
          </h1>

          {/* 썸네일 + 그 밑 상세 설명 한 줄 */}
          <div className="mt-6">
            <div className="relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/50">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="h-full w-full object-contain p-4 sm:p-6"
                />
              ) : (
                <div className="absolute right-3 top-3 text-right text-[10px] text-slate-400 sm:text-xs">
                  Изображение не загружено
                </div>
              )}
            </div>
            {product.description && (
              <p className="mt-2 line-clamp-1 text-sm text-slate-600">{product.description}</p>
            )}
          </div>

          {/* 대표 설명 1~2줄 (관리자 description) + 줄긋는가격 밑 정가, 오른쪽 장바구니 */}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 sm:w-full">
              {product.description && (
                <p className="line-clamp-2 text-sm text-slate-700">{product.description}</p>
              )}
              <div className="mt-2 flex w-full flex-col gap-0.5 sm:items-center">
                {product.rrp_price != null && (
                  <span className={hasDiscount ? 'text-sm text-slate-500 line-through' : 'text-sm text-slate-500'}>
                    {formatPrice(Number(product.rrp_price))}
                  </span>
                )}
                <p className="w-full text-center text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                  {price != null ? formatPrice(Number(price)) : '—'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              className="shrink-0 rounded-full bg-brand py-2.5 px-6 text-sm font-semibold text-white transition hover:bg-brand/90"
            >
              В корзину
            </button>
          </div>

          {/* 구성품 그리드가 있으면 같은 카드 안에 */}
          <div className="mt-6 overflow-hidden rounded-2xl bg-slate-100 shadow-sm ring-1 ring-slate-200/50">
              {/* 3) 하단 박스: 상세 구성품 이미지 (관리자 product_components 연동) — 이미지·가격 행 아래 전체 너비 */}
              {components.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6 sm:py-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">Состав набора</p>
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 sm:grid-cols-6">
                    {components.slice(0, 6).map((comp, idx) => {
                      const imgs = getComponentImageUrls(comp);
                      const firstImg = imgs[0];
                      return (
                        <div
                          key={comp.id}
                          className="flex flex-col items-center rounded-xl bg-white p-2 shadow-sm ring-1 ring-slate-100"
                        >
                          <div className="aspect-square w-full overflow-hidden rounded-lg bg-slate-100">
                            {firstImg ? (
                              <img
                                src={firstImg}
                                alt={comp.name ?? `Элемент ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-slate-300 text-xs">—</div>
                            )}
                          </div>
                          {imgs.length > 1 && (
                            <div className="mt-1 flex gap-0.5">
                              {imgs.slice(0, 4).map((src, i) => (
                                <div key={i} className="h-6 w-6 overflow-hidden rounded bg-slate-100">
                                  <img src={src} alt="" className="h-full w-full object-cover" />
                                </div>
                              ))}
                              {imgs.length > 4 && <span className="text-[10px] text-slate-400">+{imgs.length - 4}</span>}
                            </div>
                          )}
                          <p className="mt-1.5 line-clamp-2 text-center text-[11px] font-medium text-slate-700 sm:text-xs">
                            {comp.name ?? `№${idx + 1}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </div>
        </header>

        {product.detail_description && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Описание</h2>
            <div className="whitespace-pre-line rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-slate-700">
              {product.detail_description}
            </div>
          </section>
        )}

        {components.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Подробнее о составе</h2>
            <ul className="space-y-3">
              {components.map((comp, idx) => {
                const imgs = getComponentImageUrls(comp);
                return (
                  <li key={comp.id} className="flex gap-4 rounded-xl border border-slate-100 bg-white p-4">
                    {imgs.length > 0 && (
                      <div className="flex shrink-0 gap-1">
                        {imgs.map((src, i) => (
                          <div key={i} className="h-20 w-20 overflow-hidden rounded-lg bg-slate-100">
                            <img src={src} alt={comp.name ?? `Элемент ${idx + 1}`} className="h-full w-full object-cover" />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">{comp.name ?? `Элемент ${idx + 1}`}</p>
                      {comp.description && <p className="mt-1 text-sm text-slate-600">{comp.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Отзывы</h2>

          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">
                    {r.profiles?.name ?? 'Покупатель'}
                  </span>
                  <span className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                {r.body && <p className="mt-2 text-sm text-slate-700">{r.body}</p>}
                {r.review_photos?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.review_photos.map((ph, i) => (
                      <a key={i} href={ph.image_url} target="_blank" rel="noopener noreferrer" className="block">
                        <img src={ph.image_url} alt="" className="h-20 w-20 rounded-lg object-cover" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {reviews.length === 0 && <p className="text-sm text-slate-500">Пока нет отзывов.</p>}

          {isLoggedIn && id && isUuid(id) ? (
            <form onSubmit={handleSubmitReview} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Оставить отзыв</h3>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Оценка</label>
                <select
                  value={reviewRating}
                  onChange={(e) => setReviewRating(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  {[5, 4, 3, 2, 1].map((n) => (
                    <option key={n} value={n}>{n} ★</option>
                  ))}
                </select>
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Текст отзыва</label>
                <textarea
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm placeholder:text-slate-400"
                  rows={3}
                  placeholder="Расскажите о товаре"
                />
              </div>
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Фото</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) setReviewPhotoFiles((prev) => [...prev, ...Array.from(files)]);
                    e.target.value = '';
                  }}
                  className="w-full text-sm text-slate-600 file:mr-3 file:rounded-full file:border-0 file:bg-brand-soft/30 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand"
                />
                {reviewPhotoFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {reviewPhotoFiles.map((f, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                        {f.name}
                        <button
                          type="button"
                          onClick={() => setReviewPhotoFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-slate-400 hover:text-red-600"
                          aria-label="Удалить"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="mt-1 text-[11px] text-slate-500">Или укажите URL через запятую:</p>
                <input
                  type="text"
                  value={reviewPhotoUrls.join(', ')}
                  onChange={(e) => setReviewPhotoUrls(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                  className="mt-0.5 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm placeholder:text-slate-400"
                  placeholder="https://..."
                />
              </div>
              {reviewError && <p className="mb-2 text-sm text-red-600">{reviewError}</p>}
              <button
                type="submit"
                disabled={submittingReview}
                className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-60"
              >
                {submittingReview ? 'Отправка…' : 'Отправить отзыв'}
              </button>
            </form>
          ) : !isLoggedIn ? (
            <p className="mt-4 text-sm text-slate-500">
              <Link to="/login" className="text-brand hover:underline">Войдите</Link>, чтобы оставить отзыв.
            </p>
          ) : null}
        </section>
      </article>
    </main>
  );
};
