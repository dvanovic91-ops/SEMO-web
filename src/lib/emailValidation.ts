/**
 * Email для логина/регистрации:
 * локальная часть — латиница, цифры и . _ % + - до @;
 * домен — латиница/цифры/точка/дефис (напр. mail.ru, semo-box.ru);
 * зона после последней точки — не менее 2 букв (напр. name.surname@gmail.com).
 */
export const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function isValidEmailFormat(trimmed: string): boolean {
  return EMAIL_REGEX.test(trimmed);
}

