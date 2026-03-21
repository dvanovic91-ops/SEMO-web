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

const LEGACY_CART_STORAGE_KEY = 'semo_beautybox_cart';

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

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const storageKey = `semo_beautybox_cart:${userId ?? 'anon'}`;
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    // 계정 전환 시 계정별 장바구니만 로드
    const scoped = loadCartFromStorage(storageKey);
    if (scoped.length > 0) {
      setItems(scoped);
      return;
    }
    // 레거시 단일 키가 남아 있으면 anon 세션에만 1회 마이그레이션
    if (!userId) {
      const legacy = loadCartFromStorage(LEGACY_CART_STORAGE_KEY);
      if (legacy.length > 0) setItems(legacy);
      else setItems([]);
    } else {
      setItems([]);
    }
  }, [storageKey, userId]);

  useEffect(() => {
    // 레거시 단일 키는 더 이상 사용하지 않으므로 로그인 시 정리
    if (!userId) return;
    try {
      localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
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
