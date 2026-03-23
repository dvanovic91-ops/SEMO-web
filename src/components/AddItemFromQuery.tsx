import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabase';

/** 동일 세션에서 같은 URL로 이중 처리 방지 (React Strict Mode 이중 effect 대비) */
const addItemUrlHandled = new Set<string>();

/**
 * URL ?add_item=<product_uuid> (텔레그램 봇 «Заказать рекомендацию» 등)
 * — 상품을 장바구니에 담고 /cart 로 이동.
 * 참고: 이 프로젝트는 Vite + React Router이며 Next.js가 아님.
 */
export function AddItemFromQuery() {
  const { search, pathname } = useLocation();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { initialized } = useAuth();

  useEffect(() => {
    if (!initialized || !supabase) return;

    const params = new URLSearchParams(search);
    const raw = params.get('add_item')?.trim();
    if (!raw) return;

    const dedupeKey = `${pathname}?${search}`;
    if (addItemUrlHandled.has(dedupeKey)) return;
    addItemUrlHandled.add(dedupeKey);

    (async () => {
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, prp_price, rrp_price, image_url, image_urls')
          .eq('id', raw)
          .maybeSingle();

        const nextParams = new URLSearchParams(search);
        nextParams.delete('add_item');
        const nextSearch = nextParams.toString() ? `?${nextParams.toString()}` : '';

        if (error || !data) {
          addItemUrlHandled.delete(dedupeKey);
          navigate({ pathname, search: nextSearch }, { replace: true });
          return;
        }

        const prp = data.prp_price != null ? Number(data.prp_price) : null;
        const rrp = data.rrp_price != null ? Number(data.rrp_price) : null;
        const urls = data.image_urls as string[] | null | undefined;
        const thumb =
          (Array.isArray(urls) && urls.length > 0 ? urls[0] : null) ?? (data.image_url as string | null) ?? null;

        addItem({
          id: String(data.id),
          name: String(data.name ?? ''),
          price: prp ?? rrp ?? 0,
          imageUrl: thumb,
          originalPrice: prp != null && rrp != null ? rrp : undefined,
        });

        navigate({ pathname: '/cart', search: nextSearch }, { replace: true });
      } catch {
        addItemUrlHandled.delete(dedupeKey);
        const nextParams = new URLSearchParams(search);
        nextParams.delete('add_item');
        const nextSearch = nextParams.toString() ? `?${nextParams.toString()}` : '';
        navigate({ pathname, search: nextSearch }, { replace: true });
      }
    })();
  }, [initialized, search, pathname, navigate, addItem]);

  return null;
}
