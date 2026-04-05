export type RegisterFormLang = 'ru' | 'en';

export type RegisterFormStrings = {
  title: string;
  sectionMain: string;
  emailVerifyTitle: string;
  emailVerifyBtn: string;
  /** 인증코드 첫 발송 버튼 */
  emailResendBeforeSignup: string;
  /** 인증코드 재발송 버튼 */
  emailResendAgain: string;
  emailResendSending: string;
  emailResendOk: string;
  emailResendErr: string;
  emailInvalid: string;
  emailNoteLine1: string;
  emailNoteLine2: string;
  emailNoteSingle: string;
  /** OTP 코드 입력란 */
  otpLabel: string;
  otpPlaceholder: string;
  otpVerifyBtn: string;
  otpVerifyingBtn: string;
  otpVerifiedMsg: string;
  otpInvalidErr: string;
  otpExpiredErr: string;
  /** Gotrue: "expired or is invalid" — 잘못된 코드인데 만료로만 보이지 않게 */
  otpWrongOrExpiredErr: string;
  password: string;
  name: string;
  namePh: string;
  gender: string;
  genderM: string;
  genderF: string;
  referrer: string;
  referrerHint: string;
  sectionDelivery: string;
  deliveryOptional: string;
  lastName: string;
  firstName: string;
  patronymic: string;
  fioHint: string;
  noPatronymic: string;
  phone: string;
  verifyPhone: string;
  phoneNote: string;
  country: string;
  cityRegion: string;
  cityPh: string;
  street: string;
  streetPh: string;
  apt: string;
  aptPh: string;
  postcode: string;
  postcodeHint: string;
  inn: string;
  innHint: string;
  innPh: string;
  passportSeries: string;
  passportNumber: string;
  legalPrefix: string;
  submit: string;
  submitting: string;
  hasAccount: string;
  toastWelcome: string;
  toastCheckEmail: string;
  successBody: string;
  loginLink: string;
  errName: string;
  errLegal: string;
  errService: string;
  errEmailInvalid: string;
  errRateLimit: string;
  errSmtp: string;
  errDb: string;
  errCaptcha: string;
  errSignupOff: string;
  errExists: string;
  errGeneric: string;
  errSession: string;
};

const ru: RegisterFormStrings = {
  title: 'Регистрация',
  sectionMain: 'Основные данные',
  emailVerifyTitle: 'Нажмите «Получить код» — отправим 6-значный код на вашу почту',
  emailVerifyBtn: 'Получить код',
  emailResendBeforeSignup: 'Получить код',
  emailResendAgain: 'Отправить снова',
  emailResendSending: 'Отправка…',
  emailResendOk: 'Код отправлен. Проверьте почту и «Спам».',
  emailResendErr: 'Не удалось отправить. Попробуйте позже.',
  emailInvalid:
    'Введите корректный адрес: латиница, цифры и . _ % + - до @; домен как mail.ru или semo-box.ru.',
  emailNoteLine1: 'Введите email и нажмите «Получить код» — пришлём 6-значный код подтверждения.',
  emailNoteLine2: 'Изменение e-mail после регистрации невозможно.',
  emailNoteSingle:
    'Введите email и нажмите «Получить код» — вышлем 6-значный код. Изменение e-mail после регистрации невозможно.',
  otpLabel: 'Код из письма',
  otpPlaceholder: '000000',
  otpVerifyBtn: 'Подтвердить',
  otpVerifyingBtn: 'Проверяем…',
  otpVerifiedMsg: 'Email подтверждён',
  otpInvalidErr: 'Неверный код. Проверьте письмо или запросите новый код.',
  otpExpiredErr: 'Код истёк. Запросите новый.',
  otpWrongOrExpiredErr:
    'Код неверный или устарел. Введите ровно 6 цифр из письма (без лишних символов) или запросите новый.',
  password: 'Пароль',
  name: 'Имя',
  namePh: 'Например, Анна',
  gender: 'Пол',
  genderM: 'Мужской',
  genderF: 'Женский',
  referrer: 'Email рекомендателя',
  referrerHint: '* электронная почта человека, который порекомендовал вас',
  sectionDelivery: 'Доставка',
  deliveryOptional: '(при заказе — обязательно)',
  lastName: 'Фамилия',
  firstName: 'Имя',
  patronymic: 'Отчество',
  fioHint: '* ФИО как в паспорте (латинскими буквами).',
  noPatronymic: 'Нет отчества',
  phone: 'Номер телефона',
  verifyPhone: 'Подтвердить',
  phoneNote: 'Подтверждается через Telegram, за подтверждение +200 баллов.',
  country: 'Страна доставки',
  cityRegion: 'Город / Регион',
  cityPh: 'Москва, Санкт-Петербург',
  street: 'Улица, Дом, Корпус/Строение',
  streetPh: 'ул. Арбат, д. 15, корп. 2',
  apt: 'Кв. / Офис',
  aptPh: 'кв. 104',
  postcode: 'Postcode',
  postcodeHint: '(индекс, 6 цифр)',
  inn: 'INN',
  innHint: '(ИНН, 12 цифр)',
  innPh: '12 цифр',
  passportSeries: 'Серия паспорта',
  passportNumber: 'Номер паспорта',
  legalPrefix: 'Я соглашаюсь с',
  submit: 'Зарегистрироваться',
  submitting: 'Регистрация…',
  hasAccount: 'Уже есть аккаунт? Войти',
  toastWelcome: 'Добро пожаловать!',
  toastCheckEmail: 'Проверьте почту (папка «Спам»).',
  successBody:
    'Аккаунт создан. Откройте письмо и перейдите по ссылке, затем войдите. Письма нет — проверьте «Спам» или запросите повтор в профиле.',
  loginLink: 'Перейти к входу',
  errName: 'Укажите имя для обращения.',
  errLegal: 'Подтвердите согласие с условиями обработки данных и доставки.',
  errService: 'Сервис регистрации временно недоступен.',
  errEmailInvalid:
    'Этот адрес электронной почты не принимается сервисом. Попробуйте другой адрес или свяжитесь с нами.',
  errRateLimit: 'Слишком много попыток. Подождите около часа и попробуйте снова.',
  errSmtp:
    'Регистрация временно недоступна: проблема с отправкой письма подтверждения. Проверьте настройки почты в сервисе и повторите попытку.',
  errDb:
    'Регистрация отклонена настройками базы данных. Требуется проверка серверных правил (триггер/политики профиля).',
  errCaptcha: 'Сервис попросил проверку безопасности (CAPTCHA). Обновите страницу и попробуйте снова.',
  errSignupOff: 'Регистрация по email отключена в настройках сервиса.',
  errExists:
    'Этот email уже зарегистрирован. Если письмо подтверждения не пришло, проверьте почту и папку «Спам».',
  errGeneric: 'Не удалось завершить регистрацию.',
  errSession: 'Регистрация создана, но сессия не применилась. Войдите вручную.',
};

const en: RegisterFormStrings = {
  title: 'Create account',
  sectionMain: 'Basic information',
  emailVerifyTitle: "Tap 'Get code' — we'll send a 6-digit verification code to your email",
  emailVerifyBtn: 'Get code',
  emailResendBeforeSignup: 'Get code',
  emailResendAgain: 'Send again',
  emailResendSending: 'Sending…',
  emailResendOk: 'Code sent. Check your inbox and Spam.',
  emailResendErr: 'Could not send. Try again later.',
  emailInvalid:
    'Enter a valid address: Latin letters, digits and . _ % + - before @; domain like mail.ru or gmail.com.',
  emailNoteLine1: "Enter your email and tap 'Get code' — we'll send a 6-digit verification code.",
  emailNoteLine2: 'You cannot change your e-mail after registration.',
  emailNoteSingle:
    "Enter your email and tap 'Get code' — we'll send a 6-digit code. You cannot change your e-mail after registration.",
  otpLabel: 'Code from email',
  otpPlaceholder: '000000',
  otpVerifyBtn: 'Verify',
  otpVerifyingBtn: 'Verifying…',
  otpVerifiedMsg: 'Email verified',
  otpInvalidErr: 'Invalid code. Check the email or request a new one.',
  otpExpiredErr: 'Code expired. Request a new one.',
  otpWrongOrExpiredErr:
    'Wrong code or it expired. Enter exactly 6 digits from the email (no extra characters) or request a new code.',
  password: 'Password',
  name: 'Name',
  namePh: 'e.g. Anna',
  gender: 'Gender',
  genderM: 'Male',
  genderF: 'Female',
  referrer: 'Referrer email',
  referrerHint: '* email of the person who referred you',
  sectionDelivery: 'Delivery',
  deliveryOptional: '(required when you order)',
  lastName: 'Last name',
  firstName: 'First name',
  patronymic: 'Middle name',
  fioHint: '* Full name as in passport (Latin letters).',
  noPatronymic: 'No middle name',
  phone: 'Phone number',
  verifyPhone: 'Verify',
  phoneNote: 'Verified via Telegram; +200 points for verification.',
  country: 'Delivery country',
  cityRegion: 'City / Region',
  cityPh: 'Moscow, Saint Petersburg',
  street: 'Street, building, block',
  streetPh: 'e.g. 15 Arbat St, bld. 2',
  apt: 'Apt. / Office',
  aptPh: 'apt. 104',
  postcode: 'Postcode',
  postcodeHint: '(6 digits)',
  inn: 'INN',
  innHint: '(12 digits)',
  innPh: '12 digits',
  passportSeries: 'Passport series',
  passportNumber: 'Passport number',
  legalPrefix: 'I agree to the',
  submit: 'Sign up',
  submitting: 'Signing up…',
  hasAccount: 'Already have an account? Sign in',
  toastWelcome: 'Welcome!',
  toastCheckEmail: 'Check your inbox (and Spam).',
  successBody:
    'Account created. Open the email and follow the link, then sign in. No email? Check Spam or resend from your profile.',
  loginLink: 'Go to sign in',
  errName: 'Please enter your name.',
  errLegal: 'Please accept the data processing and delivery terms.',
  errService: 'Registration is temporarily unavailable.',
  errEmailInvalid:
    'This email address is not accepted. Try another one or contact us.',
  errRateLimit: 'Too many attempts. Please wait about an hour and try again.',
  errSmtp:
    'Registration is temporarily unavailable: confirmation email could not be sent. Please try again later.',
  errDb:
    'Registration was blocked by server rules. Please contact support.',
  errCaptcha: 'The service asked for a security check (CAPTCHA). Refresh the page and try again.',
  errSignupOff: 'Email sign-up is disabled in the service settings.',
  errExists:
    'This email is already registered. If you did not get a confirmation email, check Spam.',
  errGeneric: 'Could not complete registration.',
  errSession: 'Account was created but the session did not apply. Please sign in manually.',
};

export const REGISTER_FORM_COPY: Record<RegisterFormLang, RegisterFormStrings> = { ru, en };

export function getRegisterFormStrings(lang: RegisterFormLang): RegisterFormStrings {
  return REGISTER_FORM_COPY[lang];
}

/** OAuth 후 배송 전용 페이지 — Register와 동일 필드 라벨 + 페이지/검증 문구 */
export type RegisterShippingStrings = Pick<
  RegisterFormStrings,
  | 'cityRegion'
  | 'cityPh'
  | 'street'
  | 'streetPh'
  | 'apt'
  | 'aptPh'
  | 'postcode'
  | 'postcodeHint'
  | 'phone'
  | 'inn'
  | 'innHint'
  | 'innPh'
  | 'passportSeries'
  | 'passportNumber'
> & {
  title: string;
  subtitle: string;
  save: string;
  errFillRequired: string;
  errPostcode6: string;
  errInn12: string;
  errPassportSeries4: string;
  errPassportNumber6: string;
  errPhone: string;
};

const shippingExtraRu: Pick<
  RegisterShippingStrings,
  | 'title'
  | 'subtitle'
  | 'save'
  | 'errFillRequired'
  | 'errPostcode6'
  | 'errInn12'
  | 'errPassportSeries4'
  | 'errPassportNumber6'
  | 'errPhone'
> = {
  title: 'Данные для доставки',
  subtitle: 'Укажите адрес и данные для таможенного оформления',
  save: 'Сохранить',
  errFillRequired: 'Заполните все обязательные поля.',
  errPostcode6: 'Индекс должен содержать 6 цифр.',
  errInn12: 'ИНН должен содержать 12 цифр.',
  errPassportSeries4: 'Серия паспорта — 4 цифры.',
  errPassportNumber6: 'Номер паспорта — 6 цифр.',
  errPhone: 'Укажите полный номер телефона.',
};

const shippingExtraEn: typeof shippingExtraRu = {
  title: 'Delivery details',
  subtitle: 'Enter your address and customs clearance information',
  save: 'Save',
  errFillRequired: 'Please fill in all required fields.',
  errPostcode6: 'Postcode must be 6 digits.',
  errInn12: 'INN must be 12 digits.',
  errPassportSeries4: 'Passport series must be 4 digits.',
  errPassportNumber6: 'Passport number must be 6 digits.',
  errPhone: 'Please enter a complete phone number.',
};

/** 로그인 화면 하단 — Register와 동일 CIS 규칙(ru|en) */
export const LOGIN_LEGAL_INTRO: Record<RegisterFormLang, string> = {
  ru: 'Продолжая вход (email или соцсети), вы подтверждаете ознакомление с ',
  /** Shorter than “social accounts … reviewed” so the login footer wraps to ~2 lines on desktop. */
  en: 'By continuing to sign in (email or social), you confirm you have read the ',
};

export function getRegisterShippingStrings(lang: RegisterFormLang): RegisterShippingStrings {
  const b = REGISTER_FORM_COPY[lang];
  const x = lang === 'ru' ? shippingExtraRu : shippingExtraEn;
  return {
    cityRegion: b.cityRegion,
    cityPh: b.cityPh,
    street: b.street,
    streetPh: b.streetPh,
    apt: b.apt,
    aptPh: b.aptPh,
    postcode: b.postcode,
    postcodeHint: b.postcodeHint,
    phone: b.phone,
    inn: b.inn,
    innHint: b.innHint,
    innPh: b.innPh,
    passportSeries: b.passportSeries,
    passportNumber: b.passportNumber,
    ...x,
  };
}
