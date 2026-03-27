import type { AppLanguage } from '../context/I18nContext';

export const messages = {
  ru: {
    navbar: {
      cart: 'Корзина',
      close: 'Закрыть',
      cartEmpty: 'Пока пусто',
      total: 'Итого',
      goCart: 'В корзину',
      checkout: 'Оформить заказ',
      notifications: 'Уведомления',
      readAll: 'Прочитать все',
      loginForNotifications: 'Войдите, чтобы видеть уведомления.',
      notificationsEmpty: 'Пока нет уведомлений.',
      delete: 'Удалить',
      home: 'Главная',
      catalogBeautyBox: 'Каталог Beauty box',
      account: 'Личный кабинет',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      menu: 'Menu',
      profile: 'Profile',
      language: 'Язык',
      currency: 'Валюта',
    },
    footer: {
      legal: 'Правовая информация',
      faq: 'FAQ',
      version: 'Версия',
      rights: 'All rights reserved.',
    },
  },
  en: {
    navbar: {
      cart: 'Cart',
      close: 'Close',
      cartEmpty: 'Your cart is empty',
      total: 'Total',
      goCart: 'View cart',
      checkout: 'Checkout',
      notifications: 'Notifications',
      readAll: 'Mark all as read',
      loginForNotifications: 'Sign in to see notifications.',
      notificationsEmpty: 'No notifications yet.',
      delete: 'Delete',
      home: 'Home',
      catalogBeautyBox: 'Beauty box catalog',
      account: 'Account',
      openMenu: 'Open menu',
      closeMenu: 'Close menu',
      menu: 'Menu',
      profile: 'Profile',
      language: 'Language',
      currency: 'Currency',
    },
    footer: {
      legal: 'Legal information',
      faq: 'FAQ',
      version: 'Version',
      rights: 'All rights reserved.',
    },
  },
} as const;

export function t<L extends AppLanguage, P extends keyof typeof messages[L], K extends keyof (typeof messages)[L][P]>(
  lang: L,
  part: P,
  key: K,
): (typeof messages)[L][P][K] {
  return messages[lang][part][key];
}

