import React, { useEffect, useRef } from 'react';
import { useI18n } from '../context/I18nContext';

const EXACT_TEXT: Record<string, string> = {
  'Личный кабинет': 'Account',
  'Выйти': 'Logout',
  'Профиль': 'Profile',
  'Тесты': 'Tests',
  'Отзывы': 'Reviews',
  'Заказы': 'Orders',
  'История заказов': 'Order history',
  'История баллов': 'Point history',
  'Мои купоны': 'My coupons',
  'Результаты тестов': 'Test results',
  'В корзину': 'Add to cart',
  'Смотреть все': 'View all',
  'Отзывы клиентов': 'Customer reviews',
  'Оставить отзыв': 'Leave a review',
  'Пока нет отзывов.': 'No reviews yet.',
  'Удалить': 'Delete',
  'Сохранить': 'Save',
  'Отмена': 'Cancel',
  'Подтвердить': 'Verify',
  'Подтвердить email': 'Verify email',
  'Регистрация': 'Register',
  'Войти': 'Sign in',
  'Промокод': 'Promo code',
  'Активировать': 'Activate',
  'Телефон': 'Phone',
  'Адрес доставки': 'Delivery address',
  'Текущий уровень': 'Current tier',
  'Уровень участника': 'Membership tier',
};

const REPLACE_IN_TEXT: Array<[string, string]> = [
  ['Заказ №', 'Order #'],
  ['Пока нет заказов.', 'No orders yet.'],
  ['Пока нет купонов.', 'No coupons yet.'],
  ['Пока нет записей.', 'No records yet.'],
  ['Купоны', 'Coupons'],
  ['Здравствуйте,', 'Hello,'],
  ['Здравствуйте!', 'Hello!'],
  ['Не удалось', 'Failed to'],
  ['Ошибка', 'Error'],
  ['Загрузка…', 'Loading…'],
  ['Сохранение…', 'Saving…'],
  ['Отправка…', 'Sending…'],
  ['Добавлен в корзину', 'Added to cart'],
  ['Товар не найден', 'Product not found'],
  ['Закрыть', 'Close'],
  ['Корзина', 'Cart'],
  ['Итого', 'Total'],
  ['Оформить заказ', 'Checkout'],
];

export const GlobalEnglishOverlay: React.FC = () => {
  const { language } = useI18n();
  const originalTextRef = useRef(new Map<Text, string>());
  const originalAttrRef = useRef(new Map<Element, Record<string, string | null>>());
  const observerRef = useRef<MutationObserver | null>(null);
  const remoteCacheRef = useRef(new Map<string, string>());
  const pendingRef = useRef(new Set<string>());

  useEffect(() => {
    const textMap = originalTextRef.current;
    const attrMap = originalAttrRef.current;

    const translateString = (input: string): string => {
      const exact = EXACT_TEXT[input.trim()];
      if (exact) return input.replace(input.trim(), exact);
      let out = input;
      for (const [from, to] of REPLACE_IN_TEXT) {
        if (out.includes(from)) out = out.split(from).join(to);
      }
      return out;
    };

    const hasCyrillic = (s: string) => /[А-Яа-яЁё]/.test(s);

    const translateRemote = async (text: string): Promise<string | null> => {
      const cache = remoteCacheRef.current;
      if (cache.has(text)) return cache.get(text) ?? null;
      if (pendingRef.current.has(text)) return null;
      pendingRef.current.add(text);
      try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ru&tl=en&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as unknown;
        const translated =
          Array.isArray(data) && Array.isArray(data[0])
            ? (data[0] as any[]).map((part) => (Array.isArray(part) ? String(part[0] ?? '') : '')).join('')
            : null;
        if (translated) cache.set(text, translated);
        return translated;
      } catch {
        return null;
      } finally {
        pendingRef.current.delete(text);
      }
    };

    const translateNode = (root: Node) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Text | null = walker.nextNode() as Text | null;
      while (node) {
        const value = node.nodeValue ?? '';
        const translated = translateString(value);
        if (translated !== value) {
          if (!textMap.has(node)) textMap.set(node, value);
          node.nodeValue = translated;
        } else if (hasCyrillic(value)) {
          if (!textMap.has(node)) textMap.set(node, value);
          void translateRemote(value).then((remote) => {
            if (language !== 'en' || !remote || !node) return;
            if (node.nodeValue === value || hasCyrillic(node.nodeValue ?? '')) {
              node.nodeValue = remote;
            }
          });
        }
        node = walker.nextNode() as Text | null;
      }
      if (root instanceof Element || root instanceof Document || root instanceof DocumentFragment) {
        const elRoot = root instanceof Element ? root : document.body;
        const nodes = elRoot.querySelectorAll('*');
        nodes.forEach((el) => {
          (['placeholder', 'title', 'aria-label'] as const).forEach((attr) => {
            const v = el.getAttribute(attr);
            if (!v) return;
            const t = translateString(v);
            if (!attrMap.has(el)) attrMap.set(el, {});
            const rec = attrMap.get(el)!;
            if (!(attr in rec)) rec[attr] = v;
            if (t !== v) {
              el.setAttribute(attr, t);
              return;
            }
            if (hasCyrillic(v)) {
              void translateRemote(v).then((remote) => {
                if (language !== 'en' || !remote) return;
                el.setAttribute(attr, remote);
              });
            }
          });
        });
      }
    };

    const restoreAll = () => {
      textMap.forEach((orig, node) => {
        node.nodeValue = orig;
      });
      attrMap.forEach((rec, el) => {
        Object.entries(rec).forEach(([k, v]) => {
          if (v == null) el.removeAttribute(k);
          else el.setAttribute(k, v);
        });
      });
    };

    if (language === 'en') {
      translateNode(document.body);
      observerRef.current?.disconnect();
      observerRef.current = new MutationObserver((mutations) => {
        mutations.forEach((m) => {
          m.addedNodes.forEach((n) => translateNode(n));
          if (m.type === 'characterData' && m.target) translateNode(m.target);
        });
      });
      observerRef.current.observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      observerRef.current?.disconnect();
      restoreAll();
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [language]);

  return null;
};

