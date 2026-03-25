import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { Link, useSearchParams, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useProductNavReplacement } from '../context/ProductNavReplacementContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';
import { BackArrow } from '../components/BackArrow';
import { ProductCompositionGrid } from '../components/ProductCompositionGrid';
import { SemoPageSpinner, SEMO_FULL_PAGE_LOADING_MAIN_CLASS } from '../components/SemoPageSpinner';
import {
  mockBriefFromComponents,
  normalizeBrief,
  type ProductIngredientBrief,
  type ProductIngredientBriefMap,
} from '../lib/productIngredients';
import { PRODUCT_DETAIL_WHITE_CARD_INNER } from '../lib/productDetailSectionClasses';

type Product = {
  id: string;
  name: string;
  category?: 'beauty' | 'inner_beauty' | 'hair_beauty' | string | null;
  description: string | null;
  detail_description: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
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
  /** 상세 «Подробнее о составе» 블록 배치 */
  layout?: 'image_left' | 'image_right';
};

/**
 * products.image_urls — 배열·JSON 문자열·단일 URL 등 Supabase 형태 통일.
 * 배열이 아닌 문자열로만 들어오면 한 장만 보이던 문제가 생길 수 있음.
 */
function normalizeProductImageUrls(row: { image_url?: string | null; image_urls?: unknown }): string[] {
  const raw = row.image_urls;
  if (Array.isArray(raw) && raw.length > 0) {
    const out = raw
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map((s) => s.trim());
    if (out.length) return [...new Set(out)];
  }
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (t.startsWith('[')) {
      try {
        const p = JSON.parse(t) as unknown;
        if (Array.isArray(p)) {
          const out = p
            .filter((u) => typeof u === 'string' && String(u).trim())
            .map((s) => String(s).trim());
          if (out.length) return [...new Set(out)];
        }
      } catch {
        /* fallthrough */
      }
    } else if (t) {
      return [t];
    }
  }
  if (row.image_url && String(row.image_url).trim()) return [String(row.image_url).trim()];
  return [];
}

/** 주문에 해당 상품(product_id)이 포함되어 있는지 확인 (orders.items / snapshot_items 기준) */
function orderContainsProduct(
  order: { items?: { id?: string | null }[] | null; snapshot_items?: { id?: string | null }[] | null },
  productId: string,
): boolean {
  const lists = [order.items, order.snapshot_items];
  for (const list of lists) {
    if (Array.isArray(list)) {
      if (list.some((it) => it && it.id && String(it.id) === productId)) return true;
    }
  }
  return false;
}

type Review = {
  id: string;
  user_id: string;
  rating: number;
  body: string | null;
  created_at: string;
  profiles?: { name: string | null; email: string | null } | null;
  review_photos?: { image_url: string }[];
};

function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} руб.`;
}

/** UUID 형식인지 (DB products.id는 UUID) */
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** 세모 박스 폴백 상품 (DB에 슬롯/상품 없을 때 Shop에서 링크하는 ID용) */
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { isLoggedIn, userId, canGrantPermission } = useAuth();
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [components, setComponents] = useState<Component[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [ingredientBrief, setIngredientBrief] = useState<ProductIngredientBrief | null>(null);
  /** 로드 실패/타임아웃 시 메시지. null이면 로딩 중 또는 성공 — setLoading 제거로 #310 완화 */
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState('');
  const [reviewPhotoFiles, setReviewPhotoFiles] = useState<File[]>([]);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  /** 목록에서 인라인 수정 중인 리뷰 id */
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editReviewBody, setEditReviewBody] = useState('');
  const [editReviewRating, setEditReviewRating] = useState(5);
  const [updatingReviewId, setUpdatingReviewId] = useState<string | null>(null);
  /** 인라인 수정 폼 전용 (reviewError 쓰면 composer 강제 오픈됨) */
  const [reviewEditError, setReviewEditError] = useState<string | null>(null);
  /** 수정 시 유지할 기존 사진 URL · 수정 시작 시 스냅샷(삭제 diff) · 새로 첨부한 파일 */
  const [editReviewKeptPhotoUrls, setEditReviewKeptPhotoUrls] = useState<string[]>([]);
  const [editReviewInitialPhotoUrls, setEditReviewInitialPhotoUrls] = useState<string[]>([]);
  const [editReviewNewFiles, setEditReviewNewFiles] = useState<File[]>([]);
  /** 이 상품을 실제 구매한 주문 id (있을 때만 리뷰 작성 가능) */
  const [reviewOrderId, setReviewOrderId] = useState<string | null>(null);
  /** 리뷰 작성 가능 여부(구매 이력) 확인 중 */
  const [reviewOrderCheckLoading, setReviewOrderCheckLoading] = useState(false);
  /** 리뷰/사진 업로드 토스트: uploading | success | error (러시아어 메시지) */
  const [reviewToast, setReviewToast] = useState<{ type: 'uploading' | 'success' | 'error'; message: string } | null>(null);
  /** 리뷰 섹션 인포 툴팁 토글 */
  const [reviewInfoOpen, setReviewInfoOpen] = useState(false);
  /** 리뷰 작성 평점 드롭다운(iOS 기본 select 팝업 대체) */
  const [reviewRatingMenuOpen, setReviewRatingMenuOpen] = useState(false);
  /** Отзыв: по умолчанию свёрнуто — разворачивается по нажатию на заголовок */
  const [reviewComposerOpen, setReviewComposerOpen] = useState(false);
  /** 리뷰 사진 라이트박스 — 새 창 대신 모달에서 좌우 탐색 */
  const [reviewPhotoLightbox, setReviewPhotoLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const reviewLightboxTouchRef = useRef<{ x: number } | null>(null);
  /** 장바구니 담기 성공 토스트 — useEffect보다 먼저 선언 (TDZ 오류·흰 화면 방지) */
  const [cartToast, setCartToast] = useState(false);
  /** 메인 상품 사진 여러 장 — 가로 스와이프 시 현재 슬라이드 */
  const [galleryIndex, setGalleryIndex] = useState(0);
  const galleryScrollRef = useRef<HTMLDivElement | null>(null);

  const reviewFileInputRef = useRef<HTMLInputElement | null>(null);
  const editReviewFileInputRef = useRef<HTMLInputElement | null>(null);
  /** ?editReview= 한 번만 적용 (Strict Mode·재렌더 중복 방지) */
  const editReviewQueryHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (reviewError) setReviewComposerOpen(true);
  }, [reviewError]);

  useEffect(() => {
    if (!reviewRatingMenuOpen) return;
    const onDocClick = () => setReviewRatingMenuOpen(false);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [reviewRatingMenuOpen]);

  useEffect(() => {
    setReviewComposerOpen(false);
    setReviewInfoOpen(false);
    setReviewRatingMenuOpen(false);
    setEditingReviewId(null);
    setReviewEditError(null);
    setEditReviewKeptPhotoUrls([]);
    setEditReviewInitialPhotoUrls([]);
    setEditReviewNewFiles([]);
    setReviewPhotoLightbox(null);
    editReviewQueryHandledRef.current = null;
  }, [id]);

  /** 리뷰 사진 라이트박스: Esc·화살표, 스크롤 잠금 */
  useEffect(() => {
    if (!reviewPhotoLightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setReviewPhotoLightbox(null);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        setReviewPhotoLightbox((prev) => {
          if (!prev || prev.urls.length <= 1) return prev;
          const n = prev.urls.length;
          const delta = e.key === 'ArrowLeft' ? -1 : 1;
          return { ...prev, index: (prev.index + delta + n) % n };
        });
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [reviewPhotoLightbox]);

  const ingredientEntryMap = useMemo(() => {
    const map = new Map<string, { ingredient_name: string; role_ru: string; strength: number }[]>();
    if (!ingredientBrief) return map;
    ingredientBrief.entries.forEach((entry) => {
      const key = (entry.component_name || '').trim().toLowerCase();
      if (!key) return;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({
        ingredient_name: entry.ingredient_name,
        role_ru: entry.role_ru,
        strength: entry.strength,
      });
    });
    return map;
  }, [ingredientBrief]);

  const getEntriesForComponent = useCallback((compName: string | null) => {
    const key = (compName ?? '').trim().toLowerCase();
    if (!key) return [];
    const direct = ingredientEntryMap.get(key);
    if (direct?.length) return direct;
    for (const [k, vals] of ingredientEntryMap.entries()) {
      if (key.includes(k) || k.includes(key)) return vals;
    }
    return [];
  }, [ingredientEntryMap]);

  const BUCKET_REVIEW_PHOTOS = 'review-photos';
  /** 리뷰 사진 1장당 최대 5MB (Supabase 기본 50MB여도, 폼에서 과도한 원본 업로드 방지) */
  const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;
  /** 리뷰당 최대 사진 개수 (UX 안내 텍스트·밸리데이션 공통 사용) */
  const MAX_REVIEW_PHOTOS = 3;

  // 토스트 자동 숨김 (3초)
  useEffect(() => {
    if (!reviewToast) return;
    const t = window.setTimeout(() => setReviewToast(null), 3000);
    return () => window.clearTimeout(t);
  }, [reviewToast]);

  /** 장바구니 담기 토스트 — 모바일 하단 탭 위에 표시 */
  useEffect(() => {
    if (!cartToast) return;
    const t = window.setTimeout(() => setCartToast(false), 2800);
    return () => window.clearTimeout(t);
  }, [cartToast]);

  /** 리뷰 삭제: 작성자 본인 또는 관리자만 가능 */
  const canDeleteReview = (r: Review) => (userId && r.user_id === userId) || canGrantPermission;

  const handleReviewFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const valid: File[] = [];
    const tooBig: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > MAX_REVIEW_PHOTO_BYTES) tooBig.push(files[i].name);
      else valid.push(files[i]);
    }
    if (tooBig.length > 0) {
      setReviewToast({ type: 'error', message: `Файл слишком большой. Макс. 5 МБ.` });
      setReviewError(tooBig.length === 1 ? `«${tooBig[0]}» — больше 5 МБ.` : `${tooBig.length} файлов больше 5 МБ.`);
    }
    if (valid.length > 0) {
      setReviewPhotoFiles((prev) => {
        const next = [...prev, ...valid];
        if (next.length > MAX_REVIEW_PHOTOS) {
          setReviewToast({ type: 'error', message: `Макс. ${MAX_REVIEW_PHOTOS} фото.` });
          return next.slice(0, MAX_REVIEW_PHOTOS);
        }
        setReviewError(null);
        return next;
      });
    }
    e.target.value = '';
  };
  const beginEditReview = useCallback((r: Review) => {
    const urls = (r.review_photos ?? []).map((p) => p.image_url).filter(Boolean);
    setEditingReviewId(r.id);
    setEditReviewBody(r.body?.trim() ?? '');
    setEditReviewRating(Math.min(5, Math.max(1, Number(r.rating) || 5)));
    setEditReviewKeptPhotoUrls([...urls]);
    setEditReviewInitialPhotoUrls([...urls]);
    setEditReviewNewFiles([]);
    setReviewComposerOpen(false);
    setReviewEditError(null);
  }, []);

  const cancelEditReview = () => {
    setEditingReviewId(null);
    setReviewEditError(null);
    setEditReviewKeptPhotoUrls([]);
    setEditReviewInitialPhotoUrls([]);
    setEditReviewNewFiles([]);
  };

  /** 프로필 «Мои отзывы» → «Изменить»: /product/:id?editReview=:id 로 진입 시 해당 리뷰 수정 폼 오픈 */
  useEffect(() => {
    const rid = searchParams.get('editReview');
    if (!rid || !userId || !id || reviews.length === 0) return;
    const r = reviews.find((x) => x.id === rid && x.user_id === userId);
    if (!r) return;
    const key = `${id}:${rid}`;
    if (editReviewQueryHandledRef.current === key) return;
    editReviewQueryHandledRef.current = key;
    beginEditReview(r);
    const next = new URLSearchParams(searchParams);
    next.delete('editReview');
    setSearchParams(next, { replace: true });
    requestAnimationFrame(() => {
      document.getElementById('product-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [reviews, searchParams, userId, id, setSearchParams, beginEditReview]);

  const handleEditReviewFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const valid: File[] = [];
    const tooBig: string[] = [];
    for (let i = 0; i < files.length; i++) {
      if (files[i].size > MAX_REVIEW_PHOTO_BYTES) tooBig.push(files[i].name);
      else valid.push(files[i]);
    }
    if (tooBig.length > 0) {
      setReviewToast({ type: 'error', message: `Файл слишком большой. Макс. 5 МБ.` });
      setReviewEditError(tooBig.length === 1 ? `«${tooBig[0]}» — больше 5 МБ.` : `${tooBig.length} файлов больше 5 МБ.`);
    }
    if (valid.length > 0) {
      setEditReviewNewFiles((prev) => {
        const next = [...prev, ...valid];
        const cap = MAX_REVIEW_PHOTOS - editReviewKeptPhotoUrls.length;
        if (next.length > cap) {
          setReviewToast({ type: 'error', message: `Макс. ${MAX_REVIEW_PHOTOS} фото.` });
          setReviewEditError(`Максимум ${MAX_REVIEW_PHOTOS} фото (с учётом уже прикреплённых).`);
          return next.slice(0, Math.max(0, cap));
        }
        setReviewEditError(null);
        return next;
      });
    }
    e.target.value = '';
  };

  const handleUpdateReview = async (reviewId: string) => {
    if (!supabase || !id || !userId) return;
    const trimmed = editReviewBody.trim();
    if (!trimmed) {
      setReviewEditError('Напишите текст отзыва.');
      return;
    }
    const totalPhotos = editReviewKeptPhotoUrls.length + editReviewNewFiles.length;
    if (totalPhotos > MAX_REVIEW_PHOTOS) {
      setReviewEditError(`Максимум ${MAX_REVIEW_PHOTOS} фото.`);
      return;
    }
    setUpdatingReviewId(reviewId);
    setReviewEditError(null);
    try {
      const { error } = await supabase
        .from('product_reviews')
        .update({ body: trimmed, rating: editReviewRating })
        .eq('id', reviewId);
      if (error) throw error;

      const removedUrls = editReviewInitialPhotoUrls.filter((u) => !editReviewKeptPhotoUrls.includes(u));
      for (const url of removedUrls) {
        const { error: delPh } = await supabase.from('review_photos').delete().eq('review_id', reviewId).eq('image_url', url);
        if (delPh) throw delPh;
      }

      const uploadedUrls: string[] = [];
      if (editReviewNewFiles.length > 0) {
        setReviewToast({ type: 'uploading', message: 'Загрузка…' });
      }
      for (let i = 0; i < editReviewNewFiles.length; i++) {
        const file = editReviewNewFiles[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
        const path = `${userId}/${Date.now()}_e${i}.${safeExt}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_REVIEW_PHOTOS)
          .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || `image/${safeExt}` });
        if (upErr) {
          setReviewToast({ type: 'error', message: 'Ошибка загрузки.' });
          throw new Error(upErr.message || 'Не удалось загрузить фото.');
        }
        const { data: urlData } = supabase.storage.from(BUCKET_REVIEW_PHOTOS).getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      const { data: sortRows } = await supabase
        .from('review_photos')
        .select('sort_order')
        .eq('review_id', reviewId)
        .order('sort_order', { ascending: false })
        .limit(1);
      let nextOrder = (sortRows?.[0]?.sort_order != null ? Number(sortRows[0].sort_order) : -1) + 1;
      if (uploadedUrls.length > 0) {
        const { error: insErr } = await supabase.from('review_photos').insert(
          uploadedUrls.map((url, j) => ({
            review_id: reviewId,
            image_url: url,
            sort_order: nextOrder + j,
          })),
        );
        if (insErr) throw insErr;
      }

      const finalPhotos = [...editReviewKeptPhotoUrls.map((image_url) => ({ image_url })), ...uploadedUrls.map((image_url) => ({ image_url }))];

      setReviews((prev) =>
        prev.map((x) =>
          x.id === reviewId ? { ...x, body: trimmed, rating: editReviewRating, review_photos: finalPhotos } : x,
        ),
      );
      setEditingReviewId(null);
      setEditReviewKeptPhotoUrls([]);
      setEditReviewInitialPhotoUrls([]);
      setEditReviewNewFiles([]);
      setReviewToast({ type: 'success', message: 'Отзыв обновлён.' });
    } catch (e) {
      setReviewEditError(e instanceof Error ? e.message : 'Не удалось сохранить отзыв.');
      setReviewToast({ type: 'error', message: 'Не удалось сохранить отзыв.' });
    } finally {
      setUpdatingReviewId(null);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!supabase || !id) return;
    if (!window.confirm('Удалить этот отзыв?')) return;
    setDeletingReviewId(reviewId);
    setReviewError(null);
    try {
      await supabase.from('review_photos').delete().eq('review_id', reviewId);
      const { error } = await supabase.from('product_reviews').delete().eq('id', reviewId);
      if (error) throw error;
      setReviews((prev) => prev.filter((r) => r.id !== reviewId));
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : 'Не удалось удалить отзыв.');
    } finally {
      setDeletingReviewId(null);
    }
  };
  const loadingTimeoutRef = useRef<number | null>(null);
  /** 모바일: 본문 «В корзину»이 화면에서 사라지면 상단 고정 바 표시 */
  const addToCartBtnRef = useRef<HTMLButtonElement | null>(null);
  /** max-md: 미니바용 (getBoundingClientRect) */
  const [stickyAddBar, setStickyAddBar] = useState(false);
  /** md+: 가격 블록이 뷰포트에서 사라지면 Navbar 컴팩트(Intersection Observer) */
  const [desktopPriceSticky, setDesktopPriceSticky] = useState(false);
  const productPriceBlockIoRef = useRef<HTMLDivElement | null>(null);
  const { setProductStickyReplacesNav, setProductDesktopNav } = useProductNavReplacement();

  /** 모바일: 스크롤 미니바 표시 시 Navbar 헤더 대체 */
  useEffect(() => {
    setProductStickyReplacesNav(stickyAddBar);
    return () => setProductStickyReplacesNav(false);
  }, [stickyAddBar, setProductStickyReplacesNav]);

  useEffect(() => {
    const currentId = String(id ?? '').trim();
    if (!currentId) {
      setProduct(null);
      setComponents([]);
      setReviews([]);
      setLoadError(null);
      return;
    }

    let cancelled = false;
    setLoadError(null);

    const t = window.setTimeout(() => {
      if (cancelled) return;
      setLoadError('timeout');
    }, 15000);
    loadingTimeoutRef.current = t;

    if (!isUuid(currentId) && FALLBACK_PRODUCTS[currentId]) {
      if (loadingTimeoutRef.current != null) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setProduct(FALLBACK_PRODUCTS[currentId]);
      setComponents([]);
      setReviews([]);
      return;
    }

    if (!supabase) {
      if (loadingTimeoutRef.current != null) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
      setProduct(null);
      setLoadError('no-client');
      return;
    }

    const load = async () => {
      setReviewOrderCheckLoading(!!userId);
      try {
        const { data: prodData, error: prodErr } = await supabase
          .from('products')
          .select('id, name, category, description, image_url, image_urls, rrp_price, prp_price')
          .eq('id', currentId)
          .single();

        if (cancelled || currentId !== (id ?? '')) return;
        if (prodErr || !prodData) {
          if (loadingTimeoutRef.current != null) {
            window.clearTimeout(loadingTimeoutRef.current);
            loadingTimeoutRef.current = null;
          }
          // PGRST116 = no rows for .single() → 상품 없음
          const errMsg = (prodErr?.code === 'PGRST116' || prodErr?.message?.includes('0 rows'))
            ? 'Товар не найден'
            : (prodErr?.message ?? 'Товар не найден');
          setLoadError(errMsg);
          setProduct(null);
          setComponents([]);
          setReviews([]);
          return;
        }
        const row = prodData as Product & { detail_description?: string | null; image_urls?: string[] | null; stock?: number | null };
        const imgs = normalizeProductImageUrls(row);
        const productRow: Product = {
          id: row.id,
          name: row.name,
          description: row.description,
          detail_description: row.detail_description ?? null,
          image_url: row.image_url,
          image_urls: imgs.length ? imgs : row.image_url ? [String(row.image_url)] : [],
          rrp_price: row.rrp_price,
          prp_price: row.prp_price,
          stock: row.stock ?? null,
        };
        setProduct((prev) => (prev?.id === productRow.id ? prev : productRow));
        setLoadError(null);

        try {
          await supabase.from('product_views').insert({ product_id: currentId });
        } catch (_) { /* 조회수 실패해도 상세는 표시 */ }

        let compList: Component[] = [];
        try {
          const { data: compData, error: compErr } = await supabase
            .from('product_components')
            .select('*, sku_items(display_name, description, image_url)')
            .eq('product_id', currentId);
          if (!compErr && compData && Array.isArray(compData)) {
            const rows = (compData as any[]).map((r) => {
              const sku = r.sku_items as { display_name?: string | null; description?: string | null; image_url?: string | null } | null;
              // sku_id가 연결된 경우 SKU 데이터 우선 사용
              const hasSkuImage = !!sku?.image_url;
              return {
                ...r,
                name: (sku?.display_name) ? sku.display_name : r.name,
                description: (sku?.description) ? sku.description : r.description,
                image_url: hasSkuImage ? sku.image_url : r.image_url,
                image_urls: hasSkuImage ? [sku.image_url!] : (r.image_urls ?? []),
              } as Component & { created_at?: string };
            });
            compList = rows.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
          }
        } catch (_) {
          compList = [];
        }
        if (cancelled || currentId !== (id ?? '')) return;
        setComponents((prev) => (prev.length === compList.length && compList.length === 0 ? prev : compList));
        const fallbackBrief = mockBriefFromComponents(
          productRow.name,
          compList.map((c) => (c.name ?? '').trim()).filter(Boolean)
        );
        setIngredientBrief(fallbackBrief);

        try {
          const { data: ingredientSetting } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'product_ingredient_briefs')
            .maybeSingle();
          const raw = ingredientSetting?.value ? JSON.parse(ingredientSetting.value) : null;
          const map = (raw ?? {}) as ProductIngredientBriefMap;
          const selected = normalizeBrief(map[currentId]);
          if (
            selected.entries.length > 0 ||
            selected.story_body_ru ||
            selected.story_title_ru ||
            selected.infographic_image_url
          ) {
            setIngredientBrief(selected);
          }
        } catch {
          // site_settings 미설정/JSON 오류 시 fallback 유지
        }

        let reviewsList: Review[] = [];
        try {
          const { data: reviewData } = await supabase
            .from('product_reviews')
            .select('id, user_id, rating, body, created_at')
            .eq('product_id', currentId);
          const raw = (reviewData as Review[]) ?? [];
          reviewsList = raw.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        } catch (_) {
          reviewsList = [];
        }
        const userIds = [...new Set(reviewsList.map((r) => r.user_id).filter(Boolean))] as string[];
        let profilesMap: Record<string, { name: string | null; email: string | null }> = {};
        if (userIds.length > 0) {
          try {
            const { data: profileData } = await supabase
              .from('profiles')
              .select('id, name, email')
              .in('id', userIds);
            (profileData ?? []).forEach((p: { id: string; name: string | null; email: string | null }) => {
              profilesMap[p.id] = { name: p.name ?? null, email: p.email ?? null };
            });
          } catch (_) {}
        }
        const reviewIds = reviewsList.map((r) => r.id);
        let photosMap: Record<string, { image_url: string }[]> = {};
        if (reviewIds.length > 0) {
          try {
            const { data: photoData } = await supabase
              .from('review_photos')
              .select('review_id, image_url')
              .in('review_id', reviewIds);
            (photoData ?? []).forEach((ph: { review_id: string; image_url: string }) => {
              if (!photosMap[ph.review_id]) photosMap[ph.review_id] = [];
              photosMap[ph.review_id].push({ image_url: ph.image_url });
            });
          } catch (_) {}
        }

        // 이 상품을 실제 구매한 주문이 있는지 확인 (로그인 사용자 기준)
        let foundOrderId: string | null = null;
        if (userId) {
          try {
            const { data: orderData } = await supabase
              .from('orders')
              .select('id, items, snapshot_items, status, created_at')
              .eq('user_id', userId)
              .order('created_at', { ascending: false });
            const rows = (orderData ?? []) as { id: string; items?: { id?: string | null }[] | null; snapshot_items?: { id?: string | null }[] | null; status?: string | null }[];
            const okStatuses = new Set(['completed', 'product_preparing', 'shipping_soon', 'shipped', 'delivered', 'confirmed']);
            for (const o of rows) {
              if (o.status && !okStatuses.has(o.status)) continue;
              if (orderContainsProduct(o, currentId)) {
                foundOrderId = o.id;
                break;
              }
            }
          } catch (_) {
            foundOrderId = null;
          }
        }

        if (cancelled || currentId !== (id ?? '')) return;
        setReviews(
          reviewsList.map((r) => ({
            ...r,
            profiles: r.user_id ? profilesMap[r.user_id] ?? null : null,
            review_photos: photosMap[r.id] ?? [],
          })),
        );
        setReviewOrderId(foundOrderId);
      } catch (e) {
        if (loadingTimeoutRef.current != null) {
          window.clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
        if (!cancelled && currentId === (id ?? '')) {
          setLoadError(e instanceof Error ? e.message : String(e));
          setProduct(null);
          setComponents([]);
          setReviews([]);
          setReviewOrderId(null);
        }
      } finally {
        if (!cancelled && currentId === (id ?? '')) setReviewOrderCheckLoading(false);
        if (loadingTimeoutRef.current != null) {
          window.clearTimeout(loadingTimeoutRef.current);
          loadingTimeoutRef.current = null;
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (loadingTimeoutRef.current != null) {
        window.clearTimeout(loadingTimeoutRef.current);
        loadingTimeoutRef.current = null;
      }
    };
  }, [id, userId]);

  /**
   * 모바일 상단 고정바: 본문 «В корзину» getBoundingClientRect + 스크롤/리사이즈.
   * ref가 한 프레임 늦게 붙는 경우가 있어 attach 실패 시 rAF로 재시도.
   */
  useLayoutEffect(() => {
    if (!product?.id) return;

    let rafId = 0;
    let cleaned = false;

    const updateFromRect = (el: HTMLButtonElement) => {
      if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) return;
      const bottom = el.getBoundingClientRect().bottom;
      setStickyAddBar((prev) => {
        if (!prev && bottom < -6) return true;
        if (prev && bottom > 8) return false;
        return prev;
      });
    };

    const scheduleForEl = (el: HTMLButtonElement) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => updateFromRect(el));
    };

    let scrollAttached = false;
    let ro: ResizeObserver | null = null;
    let t1 = 0;
    let t2 = 0;
    let t3 = 0;
    let retryRaf = 0;

    const schedule = () => {
      const el = addToCartBtnRef.current;
      if (el) scheduleForEl(el);
    };

    const attach = (): boolean => {
      const el = addToCartBtnRef.current;
      if (!el) return false;
      window.addEventListener('scroll', schedule, { passive: true, capture: true });
      window.addEventListener('resize', schedule);
      scrollAttached = true;
      ro = new ResizeObserver(schedule);
      ro.observe(el);
      scheduleForEl(el);
      t1 = window.setTimeout(schedule, 50);
      t2 = window.setTimeout(schedule, 300);
      t3 = window.setTimeout(schedule, 800);
      return true;
    };

    const cleanupListeners = () => {
      if (scrollAttached) {
        window.removeEventListener('scroll', schedule, true);
        window.removeEventListener('resize', schedule);
        scrollAttached = false;
      }
      ro?.disconnect();
      ro = null;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(retryRaf);
    };

    if (!attach()) {
      let attempts = 0;
      const tryAgain = () => {
        if (cleaned) return;
        if (attach()) return;
        attempts += 1;
        if (attempts > 90) return;
        retryRaf = requestAnimationFrame(tryAgain);
      };
      retryRaf = requestAnimationFrame(tryAgain);
    }

    return () => {
      cleaned = true;
      cleanupListeners();
    };
  }, [product?.id]);

  /** md+ 리사이즈 시 모바일 스티키 초기화 */
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onMq = () => {
      if (mq.matches) setStickyAddBar(false);
    };
    mq.addEventListener('change', onMq);
    return () => mq.removeEventListener('change', onMq);
  }, []);

  /**
   * 데스크톱: 상품 가격 행(이미지 하단 블록)이 뷰포트와 겹치지 않으면 상단 Navbar를 가격+CTA 바로 전환.
   * Intersection Observer — 스크롤을 다시 올려 가격 블록이 보이면 메뉴 복귀.
   */
  useEffect(() => {
    if (!product?.id) return;
    let io: IntersectionObserver | null = null;
    const mq = window.matchMedia('(min-width: 768px)');
    let cancelled = false;

    const attach = () => {
      io?.disconnect();
      if (!mq.matches) {
        setDesktopPriceSticky(false);
        return;
      }
      const el = productPriceBlockIoRef.current;
      if (!el) {
        requestAnimationFrame(() => {
          if (!cancelled) attach();
        });
        return;
      }
      io = new IntersectionObserver(
        ([entry]) => {
          setDesktopPriceSticky(!entry.isIntersecting);
        },
        { root: null, threshold: 0, rootMargin: '0px' },
      );
      io.observe(el);
    };

    attach();
    mq.addEventListener('change', attach);
    return () => {
      cancelled = true;
      mq.removeEventListener('change', attach);
      io?.disconnect();
    };
  }, [product?.id, id]);

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !id || !supabase || !isUuid(id)) {
      setReviewError('Войдите, чтобы оставить отзыв.');
      return;
    }
    if (!reviewOrderId) {
      setReviewError('Оставить отзыв можно только после покупки набора.');
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
      if (reviewPhotoFiles.length > 0) {
        setReviewToast({ type: 'uploading', message: 'Загрузка…' });
      }
      for (let i = 0; i < reviewPhotoFiles.length; i++) {
        const file = reviewPhotoFiles[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
        const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
        const path = `${userId}/${Date.now()}_${i}.${safeExt}`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET_REVIEW_PHOTOS)
          .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || `image/${safeExt}` });
        if (upErr) {
          setReviewToast({ type: 'error', message: 'Ошибка загрузки.' });
          setReviewError(upErr.message || 'Не удалось загрузить фото.');
          setSubmittingReview(false);
          return;
        }
        const { data: urlData } = supabase.storage.from(BUCKET_REVIEW_PHOTOS).getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
      const allUrls = uploadedUrls;

      const { data: reviewRow, error: revErr } = await supabase
        .from('product_reviews')
        .insert({ product_id: id, user_id: userId, order_id: reviewOrderId, rating: reviewRating, body: reviewBody.trim() })
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
      setReviewPhotoFiles([]);
      const { data: reviewData } = await supabase
        .from('product_reviews')
        .select('id, user_id, rating, body, created_at')
        .eq('product_id', id);
      const raw = (reviewData as Review[]) ?? [];
      const reviewsList = raw.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const userIds = [...new Set(reviewsList.map((r) => r.user_id).filter(Boolean))] as string[];
      let profilesMap: Record<string, { name: string | null; email: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profileData } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
        (profileData ?? []).forEach((p: { id: string; name: string | null; email: string | null }) => {
          profilesMap[p.id] = { name: p.name ?? null, email: p.email ?? null };
        });
      }
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
        reviewsList.map((r) => ({
          ...r,
          profiles: r.user_id ? profilesMap[r.user_id] ?? null : null,
          review_photos: photosMap[r.id] ?? [],
        })),
      );
      setReviewComposerOpen(false);
      setReviewToast({ type: 'success', message: 'Отзыв отправлен.' });
    } catch (err) {
      setReviewToast({ type: 'error', message: 'Ошибка. Не удалось отправить отзыв.' });
      setReviewError(err instanceof Error ? err.message : 'Не удалось отправить отзыв.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleAddToCart = () => {
    if (!product) return;
    const thumb =
      (Array.isArray(product.image_urls) && product.image_urls.length
        ? product.image_urls[0]
        : product.image_url) ?? null;
    const prp = product.prp_price != null ? Number(product.prp_price) : null;
    const rrp = product.rrp_price != null ? Number(product.rrp_price) : null;
    addItem({
      id: product.id,
      name: product.name,
      price: prp ?? rrp ?? 0,
      imageUrl: thumb,
      originalPrice: prp != null && rrp != null ? rrp : undefined,
    });
    setCartToast(true);
  };

  /* setLoading 없음: !product && !loadError → 로딩. 단, return 전에 갤러리 훅을 두어 훅 순서 고정 (로딩 시 return으로 훅 생략 시 크래시). */
  const isLoading = id?.trim() && !product && !loadError;

  const price = product?.prp_price ?? product?.rrp_price ?? null;
  const mainImages: string[] = useMemo(() => {
    if (!product) return [];
    const urls = product.image_urls;
    if (urls && Array.isArray(urls) && urls.length > 0) return urls;
    return product.image_url ? [product.image_url] : [];
  }, [product]);

  const scrollGalleryTo = useCallback(
    (i: number) => {
      const el = galleryScrollRef.current;
      if (!el) return;
      const max = Math.max(0, mainImages.length - 1);
      const idx = Math.min(Math.max(0, i), max);
      const w = el.clientWidth;
      el.scrollTo({ left: idx * w, behavior: 'smooth' });
      setGalleryIndex(idx);
    },
    [mainImages.length],
  );

  const onGalleryScroll = useCallback(() => {
    const el = galleryScrollRef.current;
    if (!el || mainImages.length <= 1) return;
    const w = el.clientWidth;
    if (w <= 0) return;
    const idx = Math.round(el.scrollLeft / w);
    setGalleryIndex(Math.min(Math.max(0, idx), mainImages.length - 1));
  }, [mainImages.length]);

  /** Десктоп: Shift + вертикальное колесо → горизонтальная прокрутка (passive: false только через addEventListener) */
  useEffect(() => {
    if (mainImages.length <= 1) return;
    const el = galleryScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [id, product?.id, mainImages.length]);

  useEffect(() => {
    setGalleryIndex(0);
    const el = galleryScrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [id, product?.id]);

  useEffect(() => {
    if (galleryIndex >= mainImages.length) setGalleryIndex(0);
  }, [galleryIndex, mainImages.length]);

  const stickyThumb = mainImages[galleryIndex] ?? mainImages[0];
  const hasDiscount = (product?.prp_price != null) && (product?.rrp_price != null);
  const catalogParam = searchParams.get('catalog');
  const effectiveCatalog = (catalogParam || product?.category || 'beauty') as 'beauty' | 'inner_beauty' | 'hair_beauty';
  const backCatalogPath = effectiveCatalog === 'inner_beauty' ? '/inner-beauty' : effectiveCatalog === 'hair_beauty' ? '/hair-beauty' : '/shop';
  const backCatalogLabel = effectiveCatalog === 'inner_beauty' ? 'Fit box' : effectiveCatalog === 'hair_beauty' ? 'Hair box' : 'Beauty box';

  const addToCartNavRef = useRef(handleAddToCart);
  addToCartNavRef.current = handleAddToCart;

  /** md+: Navbar 고정·컴팩트 슬롯 — 본문 장바구니 버튼 스크롤 아웃 시 compact */
  useEffect(() => {
    const pid = String(id ?? '').trim();
    if (!product || String(product.id) !== pid) {
      setProductDesktopNav(null);
      return;
    }
    setProductDesktopNav({
      compact: desktopPriceSticky,
      rrp: product.rrp_price != null ? Number(product.rrp_price) : null,
      prp: product.prp_price != null ? Number(product.prp_price) : null,
      thumbUrl: stickyThumb ?? null,
      onAddToCart: () => addToCartNavRef.current(),
    });
  }, [product, id, desktopPriceSticky, setProductDesktopNav, stickyThumb]);

  useEffect(() => {
    return () => setProductDesktopNav(null);
  }, [setProductDesktopNav]);

  if (!product && (loadError || !id?.trim())) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        {loadError && loadError !== 'timeout' && <p className="text-slate-600">Ошибка: {loadError}</p>}
        {loadError === 'timeout' && <p className="text-slate-600">Загрузка заняла слишком много времени.</p>}
        {!id?.trim() && !loadError && <p className="text-slate-600">Товар не найден.</p>}
        <p className="mt-4">
          <Link to={backCatalogPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> {backCatalogLabel}</Link>
        </p>
      </main>
    );
  }
  if (isLoading) {
    return (
      <main className={SEMO_FULL_PAGE_LOADING_MAIN_CLASS}>
        <SemoPageSpinner />
      </main>
    );
  }

  return (
    <main className="relative mx-auto min-w-0 max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      {/* 모바일: 스크롤 시 상단 고정 — 이전가격·최종가격·В корзину */}
      {stickyAddBar && (
        <div
          className="fixed left-0 right-0 z-40 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-1.5 border-b border-slate-200 bg-white/95 px-2.5 py-1.5 shadow-sm backdrop-blur-md md:hidden"
          style={{
            /* Navbar 숨김과 동시에 top:0 — 세모 헤더와 동일 슬롯 대체 */
            top: 0,
            paddingTop: 'max(0.2rem, env(safe-area-inset-top, 0px))',
          }}
        >
          {/* 모바일 고정바: 대표 썸네일 + 가격 + 버튼 (~20% 축소) */}
          <div className="flex h-9 w-9 shrink-0 translate-x-8 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
            {stickyThumb ? (
              <img src={stickyThumb} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">—</span>
            )}
          </div>
          <div className="flex min-w-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap px-0.5">
            {product?.rrp_price != null && (
              <span
                className={`shrink truncate text-[10px] leading-none tabular-nums ${hasDiscount ? 'text-slate-500 line-through' : 'text-slate-500'}`}
              >
                {formatPrice(Number(product.rrp_price))}
              </span>
            )}
            <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-900">
              {price != null ? formatPrice(Number(price)) : '—'}
            </span>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            className="shrink-0 rounded-full border border-brand/90 bg-brand px-3 py-1.5 text-xs font-medium leading-tight text-white min-h-8 min-w-0 transition hover:bg-brand/90"
          >
            В корзину
          </button>
        </div>
      )}

      {/* 장바구니 담기 토스트 — 하단 네비 위 */}
      {cartToast && (
        <div
          className="fixed left-1/2 z-50 max-w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-slate-900 px-4 py-3 text-center text-sm font-medium text-white shadow-lg max-md:bottom-[calc(var(--semo-mobile-tabbar-h)+0.5rem)] md:bottom-8"
          role="status"
        >
          Добавлен в корзину
        </div>
      )}

      <p className="mb-6">
        <Link to={backCatalogPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:opacity-90"><BackArrow /> {backCatalogLabel}</Link>
      </p>

      <article className="space-y-8">
        <header>
          <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {product?.name ?? '—'}
          </h1>

          {/* 메인 상품 사진 + 가격 행: 본문 열 전체 너비(Состав набора·Подробнее о составе와 동일) */}
          <div className="mt-6 w-full min-w-0">
            {mainImages.length > 1 ? (
              <div
                className="outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 rounded-2xl"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (mainImages.length <= 1) return;
                  if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    scrollGalleryTo(galleryIndex - 1);
                  }
                  if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    scrollGalleryTo(galleryIndex + 1);
                  }
                }}
              >
                <div className="relative">
                  <div
                    ref={galleryScrollRef}
                    onScroll={onGalleryScroll}
                    className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    role="region"
                    aria-label="Фото товара"
                  >
                    {mainImages.map((src, i) => (
                      <div
                        key={`${i}-${src.slice(-32)}`}
                        className="w-full min-w-0 flex-[0_0_100%] snap-center"
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
                          <img
                            src={src}
                            alt={i === 0 ? product?.name ?? '' : ''}
                            className="h-full w-full object-contain p-4 sm:p-6"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Десктоп: мышь — стрелки по краям; тачпад обычно свайпает контейнер */}
                  <button
                    type="button"
                    aria-label="Предыдущее фото"
                    disabled={galleryIndex <= 0}
                    onClick={() => scrollGalleryTo(galleryIndex - 1)}
                    className="absolute left-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 md:left-2"
                  >
                    <span className="sr-only">Назад</span>
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    aria-label="Следующее фото"
                    disabled={galleryIndex >= mainImages.length - 1}
                    onClick={() => scrollGalleryTo(galleryIndex + 1)}
                    className="absolute right-1 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/80 bg-white/95 text-slate-700 shadow-sm backdrop-blur-sm transition hover:bg-white disabled:pointer-events-none disabled:opacity-35 md:right-2"
                  >
                    <span className="sr-only">Вперёд</span>
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
                <div className="mt-3 flex justify-center gap-2">
                  {mainImages.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => scrollGalleryTo(i)}
                      className={`h-2 rounded-full transition ${i === galleryIndex ? 'w-6 bg-brand' : 'w-2 bg-slate-300'}`}
                      aria-label={`Фото ${i + 1} из ${mainImages.length}`}
                      aria-pressed={i === galleryIndex}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div
                className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70"
              >
                {mainImages.length > 0 ? (
                  <img
                    src={mainImages[0]}
                    alt={product?.name ?? ''}
                    className="h-full w-full object-contain p-4 sm:p-6"
                  />
                ) : (
                  <div className="absolute right-3 top-3 text-right text-[10px] text-slate-400 sm:text-xs">
                    Изображение не загружено
                  </div>
                )}
              </div>
            )}

            {/* 가격 + 장바구니 — 모바일: md:hidden 열만 유지. 데스크톱: 단일 ref 버튼 + 중앙 가격 오버레이 + 우측 CTA */}
            <div
              ref={productPriceBlockIoRef}
              className="mt-6 flex flex-col gap-3 md:relative md:min-h-[3.75rem] md:w-full md:gap-0 md:py-0 lg:min-h-[3.5rem]"
            >
              <div className="flex flex-col items-center gap-0.5 text-center md:hidden">
                {product?.rrp_price != null && (
                  <span
                    className={`text-sm tabular-nums ${hasDiscount ? 'text-slate-500 line-through' : 'text-slate-500'}`}
                  >
                    {formatPrice(Number(product.rrp_price))}
                  </span>
                )}
                <p className="text-lg font-semibold tabular-nums tracking-tight text-slate-900">
                  {price != null ? formatPrice(Number(price)) : '—'}
                </p>
              </div>
              <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
                <div className="pointer-events-auto relative inline-block max-w-[min(70vw,26rem)]">
                  {product?.rrp_price != null && (
                    <span
                      className={`absolute right-full top-1/2 mr-2 max-w-[min(22vw,7rem)] -translate-y-1/2 truncate text-left text-sm tabular-nums sm:max-w-[min(28vw,9rem)] sm:whitespace-nowrap sm:text-base ${
                        hasDiscount ? 'text-slate-500 line-through' : 'text-slate-500'
                      }`}
                    >
                      {formatPrice(Number(product.rrp_price))}
                    </span>
                  )}
                  <p className="text-center text-lg font-semibold tabular-nums text-slate-900 sm:text-xl min-w-0 max-w-[min(48vw,14rem)] truncate sm:max-w-[min(42vw,16rem)]">
                    {price != null ? formatPrice(Number(price)) : '—'}
                  </p>
                </div>
              </div>
              <div className="flex w-full justify-center px-4 md:absolute md:right-6 md:top-1/2 md:z-[2] md:max-w-[min(42%,11rem)] md:-translate-y-1/2 md:justify-end md:px-0 md:pl-3">
                <button
                  ref={addToCartBtnRef}
                  type="button"
                  onClick={handleAddToCart}
                  className="min-h-9 w-[11.4rem] max-w-full shrink-0 rounded-full border border-brand/90 bg-brand py-2 px-6 text-sm font-medium leading-tight text-white transition hover:bg-brand/90 md:min-h-8 md:w-full md:px-4 md:py-1.5 md:text-xs lg:px-5 lg:text-sm whitespace-nowrap"
                >
                  В корзину
                </button>
              </div>
            </div>
          </div>

          {/* 구성품 그리드 — ProductCompositionGrid와 동일 UX (토글 «ключевые ингредиенты») */}
          <ProductCompositionGrid components={components} />
        </header>

        {(ingredientBrief?.infographic_image_url || (product?.detail_description && /^https?:\/\//i.test(product.detail_description))) && (
          <section id="product-description" className="mt-6 overflow-hidden rounded-2xl bg-white shadow-[0_1px_10px_-6px_rgba(15,23,42,0.2)] ring-1 ring-slate-200/70">
            <div className={PRODUCT_DETAIL_WHITE_CARD_INNER}>
              <p className="mb-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">Подробнее о составе</p>
              <div className="overflow-hidden rounded-xl border border-slate-200/70 bg-white">
                <img
                  src={ingredientBrief?.infographic_image_url || product?.detail_description || ''}
                  alt={`${product?.name ?? 'SEMO Box'} 상세 이미지`}
                  className="block h-auto w-full object-cover"
                />
              </div>
            </div>
          </section>
        )}

        <section id="product-reviews">
          <h2 className="mb-3 text-left text-xs font-bold uppercase tracking-wider text-slate-700 md:text-lg md:font-semibold md:normal-case md:tracking-tight md:text-slate-900" style={{ paddingLeft: '2vw' }}>
            Отзывы
          </h2>

          <ul className="space-y-4">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[length:calc(1rem-1pt)] text-slate-800">
                      {r.profiles?.name?.trim()
                        ? r.profiles.name.trim()
                        : r.profiles?.email
                        ? r.profiles.email.split('@')[0] || 'Гость'
                        : 'Гость'}
                    </span>
                    <span className="text-amber-500">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                    <span className="text-[length:calc(0.75rem-1pt)] text-slate-400">
                      {new Date(r.created_at).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                  {canDeleteReview(r) && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => (editingReviewId === r.id ? cancelEditReview() : beginEditReview(r))}
                        disabled={deletingReviewId === r.id || updatingReviewId === r.id}
                        className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                        title={editingReviewId === r.id ? 'Отменить редактирование' : 'Изменить отзыв'}
                        aria-label={editingReviewId === r.id ? 'Отменить редактирование' : 'Изменить отзыв'}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteReview(r.id)}
                        disabled={deletingReviewId === r.id || updatingReviewId === r.id}
                        className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Удалить"
                        aria-label="Удалить"
                      >
                        {deletingReviewId === r.id ? (
                          <span className="text-xs">…</span>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                {editingReviewId === r.id ? (
                  <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <label className="text-xs font-medium text-slate-600">Текст</label>
                    <textarea
                      value={editReviewBody}
                      onChange={(e) => setEditReviewBody(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                      rows={4}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-slate-600">Оценка</span>
                      <select
                        value={editReviewRating}
                        onChange={(e) => setEditReviewRating(Number(e.target.value))}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <option key={n} value={n}>
                            {n} ★
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium text-slate-600">Фото</p>
                      <div className="flex flex-wrap gap-2">
                        {editReviewKeptPhotoUrls.map((url) => (
                          <div key={url} className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <img src={url} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setEditReviewKeptPhotoUrls((prev) => prev.filter((u) => u !== url))}
                              className="absolute right-0.5 top-0.5 rounded-full bg-white/80 px-1 text-[10px] text-slate-600 hover:bg-red-50 hover:text-red-600"
                              aria-label="Убрать фото"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        {editReviewNewFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                            <img src={URL.createObjectURL(f)} alt="" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setEditReviewNewFiles((prev) => prev.filter((_, j) => j !== i))}
                              className="absolute right-0.5 top-0.5 rounded-full bg-white/80 px-1 text-[10px] text-slate-600 hover:bg-red-50 hover:text-red-600"
                              aria-label="Удалить"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        * До {MAX_REVIEW_PHOTOS} фото, 5 МБ каждое ({editReviewKeptPhotoUrls.length + editReviewNewFiles.length}/
                        {MAX_REVIEW_PHOTOS})
                      </p>
                    </div>
                    <div className="flex flex-row items-stretch gap-2">
                      <button
                        type="button"
                        onClick={() => editReviewFileInputRef.current?.click()}
                        disabled={updatingReviewId === r.id || editReviewKeptPhotoUrls.length + editReviewNewFiles.length >= MAX_REVIEW_PHOTOS}
                        className="min-w-0 basis-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium leading-tight text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        +Фото
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditReview}
                        disabled={updatingReviewId === r.id}
                        className="min-w-0 basis-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium leading-tight text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateReview(r.id)}
                        disabled={updatingReviewId === r.id}
                        className="min-w-0 basis-0 flex-1 rounded-full border border-brand/90 bg-brand px-4 py-1.5 text-sm font-medium leading-tight text-white hover:bg-brand/90 disabled:opacity-60"
                      >
                        {updatingReviewId === r.id ? 'Сохранение…' : 'Сохранить'}
                      </button>
                      <input
                        ref={editReviewFileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleEditReviewFilesChange}
                        className="hidden"
                      />
                    </div>
                    {reviewEditError && editingReviewId === r.id ? (
                      <p className="text-sm text-red-600">{reviewEditError}</p>
                    ) : null}
                  </div>
                ) : (
                  r.body && <p className="mt-2 text-[length:calc(0.875rem-1pt)] text-slate-700">{r.body}</p>
                )}
                {editingReviewId !== r.id && r.review_photos?.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {r.review_photos.map((ph, i) => {
                      const urls = r.review_photos!.map((p) => p.image_url);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setReviewPhotoLightbox({ urls, index: i })}
                          className="block overflow-hidden rounded-lg ring-offset-2 transition hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-brand/60"
                          aria-label={`Фото ${i + 1} из ${urls.length}`}
                        >
                          <img src={ph.image_url} alt="" className="h-20 w-20 object-cover" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {reviews.length === 0 && <p className="text-xs text-slate-500 sm:text-sm" style={{ paddingLeft: '2vw' }}>Пока нет отзывов.</p>}

          {isLoggedIn && id && isUuid(id) ? (
            reviewOrderId ? (
            <>
            <form onSubmit={handleSubmitReview} className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <button
                type="button"
                onClick={() => setReviewComposerOpen((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left transition hover:bg-slate-50/80"
                aria-expanded={reviewComposerOpen}
                id="review-composer-toggle"
              >
                <h3 className="text-sm font-semibold text-slate-800">Оставить отзыв</h3>
                <span className="shrink-0 text-slate-400" aria-hidden>
                  {reviewComposerOpen ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </span>
              </button>
              {!reviewComposerOpen ? (
                <p className="mt-1 text-xs text-slate-500">Нажмите, чтобы написать отзыв и прикрепить фото.</p>
              ) : null}

              <div
                className={reviewComposerOpen ? 'mt-3 border-t border-slate-100 pt-3' : 'hidden'}
                id="review-composer-panel"
                role="region"
                aria-labelledby="review-composer-toggle"
              >
              <div className="mb-3 flex items-center justify-start gap-1.5">
                <span className="text-xs font-semibold text-slate-700 sm:text-sm">Фотоотзыв и бонусные баллы</span>
                <div
                  className="relative inline-flex items-center"
                  onMouseEnter={() => {
                    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
                      setReviewInfoOpen(true);
                    }
                  }}
                  onMouseLeave={() => {
                    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches) {
                      setReviewInfoOpen(false);
                    }
                  }}
                >
                  <button
                    type="button"
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[11px] font-semibold leading-none text-amber-700"
                    aria-label="Информация о бонусных баллах"
                    aria-expanded={reviewInfoOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
                        setReviewInfoOpen((v) => !v);
                      }
                    }}
                  >
                    !
                  </button>
                  {reviewInfoOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[55] bg-black/20 md:hidden"
                        aria-hidden
                        onClick={() => setReviewInfoOpen(false)}
                      />
                      <div className="fixed left-1/2 top-[calc(50vh-5.5rem)] z-[60] w-[min(36rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[10px] leading-snug text-slate-700 shadow-lg md:hidden">
                        <p>• Содержательный и искренний отзыв: бонус до 500 pt. ⭐</p>
                        <p className="mt-2">• Неподходящие материалы могут быть удалены без предупреждения. ⚠️</p>
                        <p className="mt-2">• Авторские права на отзывы принадлежат SEMO. ©</p>
                      </div>
                      <div className="absolute left-0 top-full z-20 mt-1 hidden w-max max-w-[min(30rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11px] leading-snug text-slate-700 shadow-lg md:block">
                        <p>• Содержательный и искренний отзыв: бонус до 500 pt. ⭐</p>
                        <p className="mt-2">• Неподходящие материалы могут быть удалены без предупреждения. ⚠️</p>
                        <p className="mt-2">• Авторские права на отзывы принадлежат SEMO. ©</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-600">Текст отзыва</label>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-600">Оценка</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReviewRatingMenuOpen((v) => !v);
                      }}
                      className="inline-flex min-w-[4.2rem] items-center justify-center rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700"
                      aria-haspopup="listbox"
                      aria-expanded={reviewRatingMenuOpen}
                    >
                      <span className="font-medium">{reviewRating}</span>
                      <span className="ml-1 text-amber-500">★</span>
                    </button>
                    {reviewRatingMenuOpen && (
                      <div
                        className="absolute right-0 top-full z-30 mt-1 w-20 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {[5, 4, 3, 2, 1].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => {
                              setReviewRating(n);
                              setReviewRatingMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-center rounded-lg px-2 py-1.5 text-sm ${
                              reviewRating === n ? 'bg-amber-50 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                            }`}
                            role="option"
                            aria-selected={reviewRating === n}
                          >
                            <span>{n}</span>
                            <span className="ml-1 text-amber-500">★</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 px-3 py-2">
                  {reviewPhotoFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {reviewPhotoFiles.map((f, i) => (
                        <div key={i} className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          <img
                            src={URL.createObjectURL(f)}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => setReviewPhotoFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute right-0.5 top-0.5 rounded-full bg-white/80 px-1 text-[10px] text-slate-600 hover:bg-red-50 hover:text-red-600"
                            aria-label="Удалить"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <textarea
                    value={reviewBody}
                    onChange={(e) => setReviewBody(e.target.value)}
                    className="w-full border-0 bg-transparent px-1 pb-1 text-sm placeholder:text-slate-400 focus:outline-none"
                    rows={3}
                    placeholder="Поделитесь впечатлениями о наборе"
                  />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  * До {MAX_REVIEW_PHOTOS} фото, 5 МБ каждое
                </p>
              </div>
              <div className="mb-3 flex flex-row items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => reviewFileInputRef.current?.click()}
                  className="min-w-0 basis-0 flex-1 rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium leading-tight text-slate-700 hover:bg-slate-50"
                >
                  +Фото
                </button>
                <button
                  type="submit"
                  disabled={submittingReview}
                  className="min-w-0 basis-0 flex-1 rounded-full border border-brand/90 bg-brand px-4 py-1.5 text-sm font-medium leading-tight text-white hover:bg-brand/90 disabled:opacity-60"
                >
                  {submittingReview ? 'Отправка…' : 'Отправить отзыв'}
                </button>
                <input
                  ref={reviewFileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleReviewFilesChange}
                  className="hidden"
                />
              </div>
              {reviewError ? <p className="mb-2 text-sm text-red-600">{reviewError}</p> : null}
              </div>
            </form>
            {/* 리뷰/사진 업로드 토스트 */}
            {reviewToast && (
              <div
                role="alert"
                className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
              >
                {reviewToast.message}
              </div>
            )}
            </>
            ) : !reviewOrderCheckLoading ? (
              <p className="mt-4 text-sm text-slate-500">
                Оставить отзыв могут только покупатели этого набора. Оформите заказ, чтобы поделиться впечатлением.
              </p>
            ) : null
          ) : !isLoggedIn ? (
            <p className="mt-4 text-sm text-slate-500">
              <Link to="/login" className="text-brand hover:underline">Войдите</Link>, чтобы оставить отзыв.
            </p>
          ) : null}
        </section>
      </article>

      {/* 리뷰 사진 라이트박스 — 새 탭 없이 확대·좌우 이동(버튼·키보드·스와이프) */}
      {reviewPhotoLightbox && reviewPhotoLightbox.urls.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/88 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Просмотр фото отзыва"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Закрыть"
            onClick={() => setReviewPhotoLightbox(null)}
          />
          <div
            className="relative z-[1] flex max-h-full max-w-full flex-col items-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => {
              reviewLightboxTouchRef.current = { x: e.touches[0].clientX };
            }}
            onTouchEnd={(e) => {
              const start = reviewLightboxTouchRef.current;
              reviewLightboxTouchRef.current = null;
              if (!start) return;
              const endX = e.changedTouches[0].clientX;
              const dx = endX - start.x;
              if (Math.abs(dx) < 48) return;
              setReviewPhotoLightbox((prev) => {
                if (!prev || prev.urls.length <= 1) return prev;
                const n = prev.urls.length;
                if (dx < 0) return { ...prev, index: (prev.index + 1) % n };
                return { ...prev, index: (prev.index - 1 + n) % n };
              });
            }}
          >
            {/* 정사각형 고정 프레임 — object-contain 여백은 반투명 배경으로 채움(투명 X) */}
            <div className="relative flex aspect-square w-[min(92vmin,44rem)] max-w-full shrink-0 items-center justify-center rounded-lg bg-slate-900/55 sm:w-[min(92vmin,52rem)]">
              <img
                key={reviewPhotoLightbox.urls[reviewPhotoLightbox.index]}
                src={reviewPhotoLightbox.urls[reviewPhotoLightbox.index]}
                alt=""
                className="max-h-full max-w-full object-contain"
                draggable={false}
              />
              {reviewPhotoLightbox.urls.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewPhotoLightbox((prev) => {
                        if (!prev) return prev;
                        const n = prev.urls.length;
                        return { ...prev, index: (prev.index - 1 + n) % n };
                      })
                    }
                    className="absolute left-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white md:left-0"
                    aria-label="Предыдущее фото"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setReviewPhotoLightbox((prev) => {
                        if (!prev) return prev;
                        const n = prev.urls.length;
                        return { ...prev, index: (prev.index + 1) % n };
                      })
                    }
                    className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white md:right-0"
                    aria-label="Следующее фото"
                  >
                    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </>
              )}
            </div>
            <div className="relative z-[1] mt-3 flex items-center gap-4 text-sm text-white/95">
              {reviewPhotoLightbox.urls.length > 1 && (
                <span className="tabular-nums">
                  {reviewPhotoLightbox.index + 1} / {reviewPhotoLightbox.urls.length}
                </span>
              )}
              <button
                type="button"
                onClick={() => setReviewPhotoLightbox(null)}
                className="rounded-full border border-white/40 bg-white/10 px-4 py-1.5 text-sm font-medium text-white backdrop-blur-sm hover:bg-white/20"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};
