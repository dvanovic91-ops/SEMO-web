import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
  /** 정가(취소선 표시용). 할인가가 있을 때만 사용 */
  originalPrice?: number | null;
}

interface CartContextValue {
  items: CartItem[];
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  totalCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

/** 현재 장바구니 localStorage 접두사 (SEMO Box 브랜딩) */
const CART_PREFIX = 'semo_box_cart';
/** 예전 키 — 첫 로드 시 새 키로 이전 후 삭제 */
const LEGACY_CART_PREFIX = 'semo_beautybox_cart';
/** 장바구니 최근 수정 시각(기기 간 동기화 충돌 완화용) */
const CART_META_PREFIX = 'semo_box_cart_meta';

function scopedKey(prefix: string, userId: string | null): string {
  return `${prefix}:${userId ?? 'anon'}`;
}

function loadCartMetaUpdatedAt(userId: string | null): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = localStorage.getItem(scopedKey(CART_META_PREFIX, userId));
    if (!raw) return 0;
    const n = Number(JSON.parse(raw)?.updatedAt ?? 0);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveCartMetaUpdatedAt(userId: string | null, updatedAt: number): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(scopedKey(CART_META_PREFIX, userId), JSON.stringify({ updatedAt }));
  } catch {
    // ignore
  }
}

function loadCartFromStorage(key: string): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x: unknown) => {
      const o = x as Record<string, unknown>;
      return {
        id: String(o?.id ?? ''),
        name: String(o?.name ?? ''),
        price: Number(o?.price) || 0,
        quantity: Math.max(1, Math.floor(Number(o?.quantity) || 1)),
        imageUrl: o?.imageUrl != null ? String(o.imageUrl) : null,
        originalPrice: o?.originalPrice != null ? Number(o.originalPrice) : null,
      };
    }).filter((x) => x.id && x.name);
  } catch {
    return [];
  }
}

/**
 * 새 키 → 레거시 스코프 키 → (비로그인만) 예전 단일 키 순으로 읽고,
 * 레거시에서 찾았으면 새 키에 저장 후 레거시 키 제거.
 */
function loadCartWithMigration(userId: string | null): CartItem[] {
  const newKey = scopedKey(CART_PREFIX, userId);
  const fromNew = loadCartFromStorage(newKey);
  if (fromNew.length > 0) return fromNew;

  const legacyScoped = scopedKey(LEGACY_CART_PREFIX, userId);
  const fromLegacyScoped = loadCartFromStorage(legacyScoped);
  if (fromLegacyScoped.length > 0) {
    try {
      localStorage.setItem(newKey, JSON.stringify(fromLegacyScoped));
      localStorage.removeItem(legacyScoped);
    } catch {
      // ignore
    }
    return fromLegacyScoped;
  }

  if (!userId) {
    const fromLegacyGlobal = loadCartFromStorage(LEGACY_CART_PREFIX);
    if (fromLegacyGlobal.length > 0) {
      try {
        localStorage.setItem(newKey, JSON.stringify(fromLegacyGlobal));
        localStorage.removeItem(LEGACY_CART_PREFIX);
      } catch {
        // ignore
      }
      return fromLegacyGlobal;
    }
  }

  return [];
}

type RemoteCartSnapshot = {
  items?: unknown[] | null;
  updated_at?: string | null;
};

function normalizeRemoteCartItems(items: unknown[] | null | undefined): CartItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((x: unknown) => {
      const o = x as Record<string, unknown>;
      return {
        id: String(o?.id ?? ''),
        name: String(o?.name ?? ''),
        price: Number(o?.price) || 0,
        quantity: Math.max(1, Math.floor(Number(o?.quantity) || 1)),
        imageUrl: o?.imageUrl != null ? String(o.imageUrl) : null,
        originalPrice: o?.originalPrice != null ? Number(o.originalPrice) : null,
      } as CartItem;
    })
    .filter((x) => x.id && x.name);
}

function toSnapshotItems(items: CartItem[]) {
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    quantity: i.quantity,
    price: i.price,
    imageUrl: i.imageUrl ?? null,
    originalPrice: i.originalPrice ?? null,
  }));
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const storageKey = scopedKey(CART_PREFIX, userId);
  const [items, setItems] = useState<CartItem[]>([]);
  const [remoteReady, setRemoteReady] = useState(false);

  useEffect(() => {
    if (!userId) {
      setItems(loadCartWithMigration(null));
      setRemoteReady(true);
      return;
    }
    if (!supabase) {
      setItems(loadCartWithMigration(userId));
      setRemoteReady(true);
      return;
    }

    let alive = true;
    setRemoteReady(false);

    const bootstrapFromRemote = async () => {
      const localSeed = loadCartWithMigration(userId);
      const localUpdatedAt = loadCartMetaUpdatedAt(userId);
      const { data, error } = await supabase
        .from('cart_snapshots')
        .select('items, updated_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        setItems(loadCartWithMigration(userId));
        setRemoteReady(true);
        return;
      }

      const remote = data as RemoteCartSnapshot | null;
      if (remote) {
        const remoteItems = normalizeRemoteCartItems(remote.items);
        const remoteUpdatedAt = remote.updated_at ? Date.parse(remote.updated_at) : 0;
        const shouldRestoreLocal =
          localSeed.length > 0 &&
          (remoteItems.length === 0 || localUpdatedAt > remoteUpdatedAt);

        if (shouldRestoreLocal) {
          const nowIso = new Date().toISOString();
          await supabase.from('cart_snapshots').upsert(
            {
              user_id: userId,
              items: toSnapshotItems(localSeed),
              total_cents: Math.round(localSeed.reduce((sum, x) => sum + x.price * x.quantity, 0) * 100),
              updated_at: nowIso,
            },
            { onConflict: 'user_id' }
          );
          if (!alive) return;
          setItems(localSeed);
          saveCartMetaUpdatedAt(userId, Math.max(localUpdatedAt, Date.now()));
          setRemoteReady(true);
          return;
        }

        setItems(remoteItems);
        saveCartMetaUpdatedAt(userId, Math.max(remoteUpdatedAt, Date.now()));
        setRemoteReady(true);
        return;
      }

      // 서버 스냅샷이 아직 없으면 로컬 캐시를 1회 시드로 올린 뒤 서버를 기준으로 사용한다.
      setItems(localSeed);
      const nowIso = new Date().toISOString();
      if (localSeed.length > 0) {
        await supabase.from('cart_snapshots').upsert(
          {
            user_id: userId,
            items: toSnapshotItems(localSeed),
            total_cents: Math.round(localSeed.reduce((sum, x) => sum + x.price * x.quantity, 0) * 100),
            updated_at: nowIso,
          },
          { onConflict: 'user_id' }
        );
        if (!alive) return;
      }
      saveCartMetaUpdatedAt(userId, Date.now());
      setRemoteReady(true);
    };

    void bootstrapFromRemote();

    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(items));
        saveCartMetaUpdatedAt(userId, Date.now());
      } catch {
        // ignore
      }
      return;
    }

    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
      saveCartMetaUpdatedAt(userId, Date.now());
    } catch {
      // ignore
    }
  }, [items, storageKey, userId]);

  useEffect(() => {
    if (!supabase || !userId || !remoteReady) return;
    const payload = {
      user_id: userId,
      items: toSnapshotItems(items),
      total_cents: Math.round(items.reduce((sum, x) => sum + x.price * x.quantity, 0) * 100),
      updated_at: new Date().toISOString(),
    };
    if (items.length === 0) {
      void supabase.from('cart_snapshots').delete().eq('user_id', userId).then(() => {
        saveCartMetaUpdatedAt(userId, Date.now());
      });
      return;
    }
    void supabase
      .from('cart_snapshots')
      .upsert(payload, { onConflict: 'user_id' })
      .then(() => {
        saveCartMetaUpdatedAt(userId, Date.now());
      });
  }, [items, userId, remoteReady]);

  useEffect(() => {
    if (!supabase || !userId || !remoteReady) return;
    const refreshFromRemote = () => {
      void supabase
        .from('cart_snapshots')
        .select('items, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) return;
          const remote = data as RemoteCartSnapshot | null;
          if (!remote) {
            const localSeed = loadCartWithMigration(userId);
            if (localSeed.length > 0) {
              void supabase.from('cart_snapshots').upsert(
                {
                  user_id: userId,
                  items: toSnapshotItems(localSeed),
                  total_cents: Math.round(localSeed.reduce((sum, x) => sum + x.price * x.quantity, 0) * 100),
                  updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id' }
              );
              setItems(localSeed);
              saveCartMetaUpdatedAt(userId, Date.now());
              return;
            }
            setItems([]);
            saveCartMetaUpdatedAt(userId, Date.now());
            return;
          }
          const remoteItems = normalizeRemoteCartItems(remote.items);
          const remoteUpdatedAt = remote.updated_at ? Date.parse(remote.updated_at) : Date.now();
          const localUpdatedAt = loadCartMetaUpdatedAt(userId);
          if (remoteUpdatedAt >= localUpdatedAt) {
            setItems(remoteItems);
            saveCartMetaUpdatedAt(userId, remoteUpdatedAt);
          }
        });
    };
    const onFocus = () => refreshFromRemote();
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) refreshFromRemote();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [userId, remoteReady]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.removeItem(LEGACY_CART_PREFIX);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    if (!supabase || !userId || !remoteReady) return;
    const pollId = window.setInterval(() => {
      void supabase
        .from('cart_snapshots')
        .select('items, updated_at')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error) return;
          const remote = data as RemoteCartSnapshot | null;
          if (!remote) return;
          const remoteItems = normalizeRemoteCartItems(remote.items);
          const remoteUpdatedAt = remote.updated_at ? Date.parse(remote.updated_at) : 0;
          const localUpdatedAt = loadCartMetaUpdatedAt(userId);
          if (remoteUpdatedAt > localUpdatedAt) {
            setItems(remoteItems);
            saveCartMetaUpdatedAt(userId, remoteUpdatedAt);
          }
        });
    }, 8000);
    return () => {
      window.clearInterval(pollId);
    };
  }, [userId, remoteReady]);

  const addItem = useCallback((item: Omit<CartItem, 'quantity'>, qty = 1) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === item.id);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i], quantity: next[i].quantity + qty };
        return next;
      }
      return [...prev, { ...item, quantity: qty }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number) => {
    if (quantity < 1) {
      setItems((prev) => prev.filter((x) => x.id !== id));
      return;
    }
    setItems((prev) =>
      prev.map((x) => (x.id === id ? { ...x, quantity } : x))
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const total = items.reduce((sum, x) => sum + x.price * x.quantity, 0);
  const totalCount = items.reduce((sum, x) => sum + x.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, totalCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
