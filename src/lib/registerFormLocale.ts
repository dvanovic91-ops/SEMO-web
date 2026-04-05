import { useI18n } from '../context/I18nContext';

/**
 * 회원가입·OAuth 배송 폼 문구 — 헤더에서 고른 언어(RU | EN)와 동일.
 * (이전: 브라우저 ru + IP RU|KZ|UZ 일 때만 ru → 해외 IP에서는 RU 선택해도 영어로만 표시됨.)
 */
export function useRegisterFormLang(): 'ru' | 'en' {
  const { language } = useI18n();
  return language === 'ru' ? 'ru' : 'en';
}
