import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

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

function scopedKey(prefix: string, userId: string | null): string {
  return `${prefix}:${userId ?? 'anon'}`;
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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const storageKey = scopedKey(CART_PREFIX, userId);
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(loadCartWithMigration(userId));
  }, [storageKey, userId]);

  useEffect(() => {
    if (!userId) return;
    try {
      localStorage.removeItem(LEGACY_CART_PREFIX);
    } catch {
      // ignore
    }
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // ignore
    }
  }, [items, storageKey]);

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
