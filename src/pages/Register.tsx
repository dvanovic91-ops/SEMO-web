import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { InnHelpTooltip } from '../components/InnHelpTooltip';
import { supabase } from '../lib/supabase';
import { AddressSuggest } from '../components/AddressSuggest';
import { getAddressSuggestUiCopy } from '../lib/addressSuggestUiCopy';
import { BackArrow } from '../components/BackArrow';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';
import { getRegisterFormStrings } from '../lib/registerFormCopy';
import { useRegisterFormLang } from '../lib/registerFormLocale';
import { accountPrimaryCtaClass, accountResendOutlineCtaClass } from '../lib/accountLinkUi';
import {
  deliveryFormNoteRowClass,
  deliveryFormNoteScrollClass,
  deliveryFormNoteTextClass,
} from '../lib/profileDeliveryFormUi';
import { isValidEmailFormat } from '../lib/emailValidation';
import { clampDigits } from '../lib/digitsOnly';
import { CustomsPassportNotice } from '../components/CustomsPassportNotice';
import { LegalDocLinksEn, LegalDocLinksRu } from '../components/LegalDocLinksRu';
import { PhoneCountryCodeSelect } from '../components/PhoneCountryCodeSelect';
import { CountrySelect } from '../components/CountrySelect';
import { formatIntlPhoneByCountry, type PhoneCountry } from '../lib/phoneIntl';

const REGISTER_EMAIL_RESEND_COOLDOWN_SEC = 60;

/**
 * 회원가입 — 기본인적 / 배송(주소 세분화). 이메일 인증 구조, 전화 포맷, INN/우편 제한.
 */
const inputClass =
  'w-full min-h-[44px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-xs placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand sm:min-h-0';
/** 제출 검증 실패 시 입력·블록 강조 (테두리 + 링) */
const inputInvalidHighlightClass =
  '!border-red-400 ring-2 ring-red-400/45 focus:!border-red-500 focus:ring-red-400/50';
const blockInvalidHighlightClass =
  'rounded-xl border-2 border-red-400 ring-2 ring-red-400/35 bg-red-50/40';
/** 라벨·입력·(* 안내) 세로 스택 — 인접 요소 간격 = gap-1 (= mt-1, 4px) */
const fieldColClass = 'flex min-w-0 flex-col gap-1';
/** ФИО 한 칸: 라벨↔입력 = gap-1 */
const fioCellClass = 'flex min-h-0 min-w-0 flex-col gap-1';
/** 라벨: mb 없음 — 간격은 부모 fieldColClass gap-1 */
const fieldLabelClass = 'block text-sm font-medium text-slate-700';
const hintClass = 'text-[11px] text-slate-500 font-normal';

function normalizeLatin(value: string): string {
  // 여권용 FIO: 라틴 문자, пробел, -, ' 만 허용
  return value.replace(/[^A-Za-z\s-']/g, '');
}

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const { country, setCountry } = useI18n();
  const { applySession } = useAuth();
  const registerLang = useRegisterFormLang();
  const t = useMemo(() => getRegisterFormStrings(registerLang), [registerLang]);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [phoneCountry, setPhoneCountry] = useState<PhoneCountry>('RU');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [nickname, setNickname] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  /** Согласие с политикой / офертой / доставкой — обязательно перед отправкой формы */
  const [legalConsent, setLegalConsent] = useState(false);
  /** 제출 시 약관 미동의 → 체크 영역 테두리 강조 */
  const [legalConsentHighlight, setLegalConsentHighlight] = useState(false);
  /** 닉네임 미입력 제출 시 */
  const [nicknameHighlight, setNicknameHighlight] = useState(false);
  /** 이메일 OTP 미완료 또는 세션 만료 안내 시 — 이메일/코드 블록 강조 */
  const [emailOtpFlowHighlight, setEmailOtpFlowHighlight] = useState(false);
  const [fioLast, setFioLast] = useState('');
  const [fioFirst, setFioFirst] = useState('');
  const [fioMiddle, setFioMiddle] = useState('');
  const [noPatronymic, setNoPatronymic] = useState(false);
  const [addressSearch, setAddressSearch] = useState('');
  const addressUi = useMemo(() => getAddressSuggestUiCopy(country, registerLang), [country, registerLang]);
  const [signupResendCooldownSeconds, setSignupResendCooldownSeconds] = useState(0);
  const [signupResendSending, setSignupResendSending] = useState(false);
  const [signupResendMessage, setSignupResendMessage] = useState<string | null>(null);
  const [signupResendError, setSignupResendError] = useState<string | null>(null);
  /** OTP 코드가 발송된 상태 */
  const [awaitingEmailConfirm, setAwaitingEmailConfirm] = useState(false);
  /** OTP 입력란 */
  const [otpCode, setOtpCode] = useState('');
  /** OTP 검증 성공 → 가입 버튼 활성화 */
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  useEffect(() => {
    if (signupResendCooldownSeconds <= 0) return undefined;
    const id = window.setTimeout(() => {
      setSignupResendCooldownSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [signupResendCooldownSeconds]);

  const handleVerifyEmailClick = useCallback(async () => {
    if (signupResendCooldownSeconds > 0 || signupResendSending) return;
    const addr = email.trim().toLowerCase();
    if (!addr || !isValidEmailFormat(addr)) return;
    if (!supabase) { setSignupResendError(t.errService); return; }

    setSignupResendSending(true);
    setSignupResendError(null);
    setSignupResendMessage(null);
    try {
      // OTP 코드 발송 (기존 사용자 또는 신규 사용자 모두)
      const { error } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: true },
      });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('rate limit') || msg.includes('rate_limit')) {
          setSignupResendError(t.errRateLimit);
        } else {
          setSignupResendError(error.message || t.emailResendErr);
        }
        return;
      }
      setAwaitingEmailConfirm(true);
      setSignupResendCooldownSeconds(REGISTER_EMAIL_RESEND_COOLDOWN_SEC);
      setSignupResendMessage(t.emailResendOk);
      // 재발송 시 이전 코드 입력 및 인증 상태 초기화
      setOtpCode('');
      setOtpVerified(false);
      setOtpError(null);
    } finally {
      setSignupResendSending(false);
    }
  }, [email, signupResendCooldownSeconds, signupResendSending, supabase, t]);

  const handleVerifyOtp = useCallback(async () => {
    const digits = otpCode.replace(/\D/g, '');
    if (otpVerifying || digits.length < 6) return;
    const addr = email.trim().toLowerCase();
    if (!supabase) { setOtpError(t.errService); return; }

    /** 전체 코드 먼저 시도, 실패 시 앞 6자리·뒤 6자리 순으로 fallback (6~8자리 모두 대응) */
    const candidates: string[] = [digits];
    if (digits.length > 6) {
      const head = digits.slice(0, 6);
      const tail = digits.slice(-6);
      if (head !== digits) candidates.push(head);
      if (tail !== digits && tail !== head) candidates.push(tail);
    }

    setOtpVerifying(true);
    setOtpError(null);
    try {
      let lastError: { message?: string } | null = null;
      for (const token of candidates) {
        const { error } = await supabase.auth.verifyOtp({
          email: addr,
          token,
          type: 'email',
        });
        if (!error) {
          setOtpVerified(true);
          setEmailOtpFlowHighlight(false);
          return;
        }
        lastError = error;
      }
      if (lastError) {
        const msg = (lastError.message || '').toLowerCase();
        // Gotrue: 잘못된 코드도 "expired or is invalid" 로 올 수 있음 → 만료만 단정하지 않음
        if (msg.includes('expired') && msg.includes('invalid')) {
          setOtpError(t.otpWrongOrExpiredErr);
        } else if (msg.includes('expired')) {
          setOtpError(t.otpExpiredErr);
        } else {
          setOtpError(t.otpInvalidErr);
        }
      }
    } finally {
      setOtpVerifying(false);
    }
  }, [email, otpCode, otpVerifying, supabase, t]);

  const handleEmailBlur = () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(false);
      return;
    }
    setEmailError(!isValidEmailFormat(trimmed));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhoneValue(formatIntlPhoneByCountry(e.target.value, phoneCountry));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSignupResendMessage(null);
    setSignupResendError(null);
    setLegalConsentHighlight(false);
    setNicknameHighlight(false);
    setEmailOtpFlowHighlight(false);

    const trimmedEmail = email.trim().toLowerCase();
    let hasError = false;
    if (!trimmedEmail) {
      setEmailError(true);
      hasError = true;
    } else if (!isValidEmailFormat(trimmedEmail)) {
      setEmailError(true);
      hasError = true;
    }
    if (!password || password.length < 6) {
      setPasswordError(true);
      hasError = true;
    }
    if (!nickname.trim()) {
      hasError = true;
      setNicknameHighlight(true);
      setSubmitError(t.errName);
    }
    if (hasError) return;
    if (!legalConsent) {
      setLegalConsentHighlight(true);
      setSubmitError(t.errLegal);
      return;
    }

    if (!supabase) {
      setSubmitError(t.errService);
      return;
    }

    // OTP 인증이 완료된 경우에만 진행 (버튼 disabled로 방어하지만 2중 체크)
    if (!otpVerified) {
      setEmailOtpFlowHighlight(true);
      setSubmitError(registerLang === 'ru' ? 'Сначала подтвердите email.' : 'Please verify your email first.');
      return;
    }

    setSubmitting(true);
    try {
      // OTP 인증으로 생성된 세션 확인
      const { data: { session: otpSession } } = await supabase.auth.getSession();

      if (otpSession) {
        // OTP 세션 존재: 비밀번호 + 닉네임 설정으로 계정 완성
        const { error: updateErr } = await supabase.auth.updateUser({
          password,
          data: { nickname },
        });
        if (updateErr) {
          const msg = (updateErr.message || '').toLowerCase();
          console.error('[Register] updateUser failed', updateErr.message);
          if (msg.includes('rate limit') || msg.includes('rate_limit')) {
            setSubmitError(t.errRateLimit);
          } else if (msg.includes('weak password') || msg.includes('password')) {
            setSubmitError(updateErr.message || t.errGeneric);
          } else {
            setSubmitError(updateErr.message || t.errGeneric);
          }
          return;
        }
        try {
          await applySession(otpSession);
        } catch (e) {
          console.error('[Register] applySession after OTP', e);
          setSubmitError(t.errSession);
          return;
        }
        setToastMessage(t.toastWelcome);
        window.setTimeout(() => setToastMessage(null), 2500);
        navigate('/', { replace: true });
        return;
      }

      // OTP 세션이 만료된 경우: 재인증 안내
      setOtpVerified(false);
      setEmailOtpFlowHighlight(true);
      setSubmitError(
        registerLang === 'ru'
          ? 'Сессия подтверждения истекла. Запросите новый код.'
          : 'Verification session expired. Please request a new code.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative mx-auto min-w-0 max-w-4xl px-3 py-8 sm:px-10 sm:py-16">
      {toastMessage && (
        <div
          className="fixed right-4 top-20 z-50 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          role="status"
          aria-live="polite"
        >
          {toastMessage}
        </div>
      )}
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {t.title}
        </h1>
      </header>

      {/* noValidate: 브라우저 기본 required 툴팁은 OS 언어로 뜸 → 검증은 handleSubmit + t */}
      <form
        className="space-y-6"
        noValidate
        onSubmit={handleSubmit}
        lang={registerLang === 'ru' ? 'ru' : 'en'}
      >
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {t.sectionMain}
          </h2>
          <div className="flex flex-col gap-4">
            <div className={fieldColClass}>
              <label htmlFor="email" className={fieldLabelClass}>
                Email <span className="text-brand">*</span>
              </label>
              <div
                className={`flex flex-col gap-2 ${
                  emailError || (emailOtpFlowHighlight && !otpVerified)
                    ? `p-2 sm:p-3 ${blockInvalidHighlightClass}`
                    : ''
                }`}
              >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:items-center">
                <input
                  id="email"
                  type="email"
                  placeholder="example@mail.ru"
                  className={`${inputClass} min-w-0 flex-1 ${emailError ? inputInvalidHighlightClass : ''}`}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(false);
                    if (emailOtpFlowHighlight) setEmailOtpFlowHighlight(false);
                    if (awaitingEmailConfirm) {
                      setAwaitingEmailConfirm(false);
                      setSignupResendCooldownSeconds(0);
                      setOtpCode('');
                      setOtpVerified(false);
                      setOtpError(null);
                      setSignupResendMessage(null);
                    }
                  }}
                  onBlur={handleEmailBlur}
                  title={t.emailVerifyTitle}
                />
                <div className="flex shrink-0 items-stretch sm:items-center">
                  <button
                    type="button"
                    disabled={
                      signupResendCooldownSeconds > 0 ||
                      signupResendSending ||
                      !email.trim() ||
                      !isValidEmailFormat(email.trim())
                    }
                    onClick={() => void handleVerifyEmailClick()}
                    className={`${
                      awaitingEmailConfirm && signupResendCooldownSeconds > 0
                        ? accountResendOutlineCtaClass
                        : accountPrimaryCtaClass
                    } w-full min-w-[8.5rem] sm:w-auto sm:px-5`}
                    aria-live="polite"
                  >
                    {signupResendSending
                      ? t.emailResendSending
                      : awaitingEmailConfirm && signupResendCooldownSeconds > 0
                        ? `${signupResendCooldownSeconds}s`
                        : awaitingEmailConfirm
                          ? t.emailResendAgain
                          : t.emailResendBeforeSignup}
                  </button>
                </div>
              </div>
              {signupResendError && (
                <p className="text-xs text-red-500" role="alert">
                  {signupResendError}
                </p>
              )}
              {awaitingEmailConfirm && signupResendMessage && !signupResendError && (
                <p className="text-xs text-slate-500" role="status">
                  {signupResendMessage}
                </p>
              )}
              {/* OTP 코드 입력란 — 코드 발송 후 표시 */}
              {awaitingEmailConfirm && (
                <div className="flex flex-col gap-2">
                  {!otpVerified ? (
                    <>
                      <div className="flex items-stretch gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={8}
                          placeholder={t.otpPlaceholder}
                          value={otpCode}
                          onChange={(e) => {
                            setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 8));
                            setOtpError(null);
                            if (emailOtpFlowHighlight) setEmailOtpFlowHighlight(false);
                          }}
                          onKeyDown={(e) => {
                            const d = otpCode.replace(/\D/g, '');
                            if (e.key === 'Enter' && d.length >= 6) void handleVerifyOtp();
                          }}
                          className={`${inputClass} min-w-0 w-36 text-center tracking-[0.25em] font-mono sm:w-40 ${emailOtpFlowHighlight && !otpVerified ? inputInvalidHighlightClass : ''}`}
                          aria-label={t.otpLabel}
                        />
                        <button
                          type="button"
                          disabled={otpVerifying || otpCode.replace(/\D/g, '').length < 6}
                          onClick={() => void handleVerifyOtp()}
                          className={`${accountPrimaryCtaClass} shrink-0 px-4`}
                        >
                          {otpVerifying ? t.otpVerifyingBtn : t.otpVerifyBtn}
                        </button>
                      </div>
                      {otpError && (
                        <p className="text-xs text-red-500" role="alert">{otpError}</p>
                      )}
                    </>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700" role="status">
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                      {t.otpVerifiedMsg}
                    </p>
                  )}
                </div>
              )}
              {emailError && (
                <p className="text-xs text-red-500">
                  {t.emailInvalid}
                </p>
              )}
              </div>
              <div
                className="leading-tight text-gray-500 text-[8px] min-[361px]:max-sm:text-[9px] min-[401px]:max-sm:text-[10px] sm:text-[11px]"
                role="note"
              >
                {/* Мобильный: * + две строки */}
                <div className="flex items-start gap-1 sm:hidden">
                  <span aria-hidden>*</span>
                  <div className="min-w-0 flex flex-col whitespace-pre-line">
                    <span>{t.emailNoteLine1}</span>
                    <span>{t.emailNoteLine2}</span>
                  </div>
                </div>
                {/* sm+: одна строка (nowrap + тонкий 스크ролл при узкой ширине) */}
                <div className="hidden min-w-0 items-start gap-1 overflow-x-auto pb-0.5 [scrollbar-width:thin] sm:flex">
                  <span className="shrink-0" aria-hidden>
                    *
                  </span>
                  <span className="whitespace-nowrap">
                    {t.emailNoteSingle}
                  </span>
                </div>
              </div>
            </div>
            <div className={fieldColClass}>
              <label htmlFor="password" className={fieldLabelClass}>
                {t.password}
                <span className="text-brand">*</span>
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                className={`${inputClass} ${passwordError ? inputInvalidHighlightClass : ''}`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(false);
                }}
              />
            </div>
            {/* 닉네임 — 서비스에서 불러줄 이름 */}
            <div className={fieldColClass}>
              <label htmlFor="nickname" className={fieldLabelClass}>
                {t.name} <span className="text-brand">*</span>
              </label>
              <input
                id="nickname"
                type="text"
                placeholder={t.namePh}
                className={`${inputClass} ${nicknameHighlight ? inputInvalidHighlightClass : ''}`}
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (nicknameHighlight) setNicknameHighlight(false);
                  setSubmitError((prev) => (prev === t.errName ? null : prev));
                }}
              />
            </div>
            <div className={fieldColClass}>
              <p className={fieldLabelClass}>
                {t.gender}
              </p>
              <div className="flex gap-6">
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="gender" value="M" className="h-4 w-4 border-slate-300 text-brand focus:ring-brand" />
                  <span className="text-sm text-slate-700">{t.genderM}</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="radio" name="gender" value="F" className="h-4 w-4 border-slate-300 text-brand focus:ring-brand" />
                  <span className="text-sm text-slate-700">{t.genderF}</span>
                </label>
              </div>
            </div>
            <div className={fieldColClass}>
              <label htmlFor="referrer" className={fieldLabelClass}>
                {t.referrer}
              </label>
              <input
                id="referrer"
                type="email"
                placeholder="recommender@mail.ru"
                className={inputClass}
              />
              <p className={hintClass}>
                {t.referrerHint}
              </p>
            </div>
          </div>
        </section>

        {/* 배송 — 주소 세분화: Город/Регион, Улица/Дом/Корпус, Кв/Офис */}
        <section>
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            {t.sectionDelivery} <span className={hintClass}>{t.deliveryOptional}</span>
          </h2>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 rounded-xl border border-brand/20 bg-brand-soft/10 px-4 py-4">
            {/* ФИО — сверху блока «Доставка», затем телефон — как в ЛК: кнопки min-h-11, одинаковая ширина на sm */}
            <div className={fieldColClass}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3 sm:items-start">
              <div className={fioCellClass}>
                <label htmlFor="lastName" className={`${fieldLabelClass} flex flex-wrap items-center gap-x-1`}>
                  {t.lastName}
                </label>
                <input
                  id="lastName"
                  type="text"
                  placeholder="Ivanov"
                  className={`${inputClass} uppercase`}
                  value={fioLast}
                  onChange={(e) => setFioLast(normalizeLatin(e.target.value).toUpperCase())}
                />
              </div>
              <div className={fioCellClass}>
                <label htmlFor="firstName" className={`${fieldLabelClass} flex flex-wrap items-center gap-x-1`}>
                  {t.firstName}
                </label>
                <input
                  id="firstName"
                  type="text"
                  placeholder="Ivan"
                  className={`${inputClass} uppercase`}
                  value={fioFirst}
                  onChange={(e) => setFioFirst(normalizeLatin(e.target.value).toUpperCase())}
                />
              </div>
              <div className={fioCellClass}>
                <label htmlFor="patronymic" className={`${fieldLabelClass} flex flex-wrap items-center gap-x-1`}>
                  {t.patronymic}
                </label>
                <input
                  id="patronymic"
                  type="text"
                  placeholder="Ivanovich"
                  className={`${inputClass} uppercase disabled:bg-slate-50 disabled:text-slate-400`}
                  value={fioMiddle}
                  onChange={(e) => setFioMiddle(normalizeLatin(e.target.value).toUpperCase())}
                  disabled={noPatronymic}
                />
              </div>
            </div>
            {/* Мобильный: «Нет отчества» 위, подсказка ФИО 아래; sm+: 그리드. 체크↔안내 간격 = gap-1 */}
            <div className="flex flex-col-reverse items-start gap-1 sm:grid sm:grid-cols-3 sm:items-start sm:justify-items-start sm:gap-x-3 sm:gap-y-0">
              <p className="min-w-0 max-w-full text-[11px] leading-snug text-slate-500 sm:col-span-2 sm:row-start-1">
                {t.fioHint}
              </p>
              <label className="inline-flex w-fit shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-slate-500 sm:col-start-3 sm:row-start-1 sm:place-self-start">
                <input type="checkbox" checked={noPatronymic} onChange={(e) => { const v = e.target.checked; setNoPatronymic(v); if (v) setFioMiddle(''); }} className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand" />
                <span className="whitespace-nowrap">{t.noPatronymic}</span>
              </label>
            </div>
            </div>
            <div className={fieldColClass}>
              <label htmlFor="phone" className={fieldLabelClass}>
                {t.phone}
              </label>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-stretch">
                <PhoneCountryCodeSelect value={phoneCountry} onChange={setPhoneCountry} />
                <div className="flex w-full min-w-0 flex-1 flex-row items-stretch gap-2 sm:min-h-11">
                  <input
                    id="phone"
                    type="tel"
                    placeholder="+7 999 999 9999"
                    className={`${inputClass} !w-auto min-h-11 max-w-full min-w-[10rem] flex-1 basis-0`}
                    value={phoneValue}
                    onChange={handlePhoneChange}
                    maxLength={16}
                  />
                  <button
                    type="button"
                    disabled={phoneValue.replace(/\D/g, '').length < 10}
                    className={`${accountPrimaryCtaClass} self-stretch sm:px-5`}
                  >
                    {t.verifyPhone}
                  </button>
                </div>
              </div>
              <div className={deliveryFormNoteRowClass} role="note">
                <span aria-hidden className="shrink-0 select-none">*</span>
                <div className={deliveryFormNoteScrollClass}>
                  <span className={deliveryFormNoteTextClass}>
                    {t.phoneNote}
                  </span>
                </div>
              </div>
            </div>
            <div className={fieldColClass}>
              <label htmlFor="register-country" className={fieldLabelClass}>
                {t.country}
              </label>
              <CountrySelect
                id="register-country"
                value={country}
                onChange={(code) => setCountry(code as any)}
              />
            </div>
            <AddressSuggest
              country={country}
              mapsUiLanguage={registerLang}
              label={
                <span className="inline-flex items-center gap-2">
                  {addressUi.label}
                  <span className="group relative ml-0.5 inline-flex cursor-help" aria-label={addressUi.tooltipAria}>
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 text-xs font-medium transition hover:border-brand hover:text-brand">
                      ?
                    </span>
                    <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1.5 w-72 rounded border border-slate-100 bg-white px-2.5 py-1.5 text-left text-xs font-medium leading-snug text-brand shadow-md opacity-0 transition group-hover:opacity-100 sm:w-96">
                      {addressUi.tooltip}
                    </span>
                  </span>
                </span>
              }
              placeholder={addressUi.placeholder}
              value={addressSearch}
              onChange={setAddressSearch}
              onPartsChange={({ cityRegion, streetHouse, apartmentOffice, postcode }) => {
                const cityEl = document.getElementById('cityRegion') as HTMLInputElement | null;
                const streetEl = document.getElementById('streetHouse') as HTMLInputElement | null;
                const aptEl = document.getElementById('apartmentOffice') as HTMLInputElement | null;
                const postEl = document.getElementById('postcode') as HTMLInputElement | null;
                if (cityRegion !== undefined && cityEl) cityEl.value = cityRegion;
                if (streetHouse !== undefined && streetEl) streetEl.value = streetHouse;
                if (apartmentOffice !== undefined && aptEl) aptEl.value = apartmentOffice;
                if (postcode !== undefined && postEl) postEl.value = postcode;
              }}
            />
            <div className={fieldColClass}>
              <label htmlFor="cityRegion" className={fieldLabelClass}>
                {t.cityRegion}
              </label>
              <input
                id="cityRegion"
                type="text"
                placeholder={t.cityPh}
                className={inputClass}
              />
            </div>
            <div className={fieldColClass}>
              <label htmlFor="streetHouse" className={fieldLabelClass}>
                {t.street}
              </label>
              <input
                id="streetHouse"
                type="text"
                placeholder={t.streetPh}
                className={inputClass}
              />
            </div>
            <div className={fieldColClass}>
              <label htmlFor="apartmentOffice" className={fieldLabelClass}>
                {t.apt}
              </label>
              <input
                id="apartmentOffice"
                type="text"
                placeholder={t.aptPh}
                className={inputClass}
              />
            </div>
            <div className={fieldColClass}>
              <label htmlFor="postcode" className={fieldLabelClass}>
                {t.postcode} <span className={hintClass}>{t.postcodeHint}</span>
              </label>
              <input
                id="postcode"
                type="text"
                placeholder="123456"
                className={inputClass}
                maxLength={6}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  e.target.value = clampDigits(e.target.value, 6);
                }}
              />
            </div>
            <div className={fieldColClass}>
              <label htmlFor="inn" className={`${fieldLabelClass} inline-flex items-center gap-1`}>
                {t.inn} <span className={hintClass}>{t.innHint}</span>
                <InnHelpTooltip locale={registerLang} />
              </label>
              <input
                id="inn"
                type="text"
                placeholder={t.innPh}
                className={inputClass}
                maxLength={12}
                inputMode="numeric"
                autoComplete="off"
                onChange={(e) => {
                  e.target.value = clampDigits(e.target.value, 12);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className={fieldColClass}>
                <label htmlFor="passportSeries" className={fieldLabelClass}>{t.passportSeries}</label>
                <input
                  id="passportSeries"
                  type="text"
                  placeholder="1234"
                  className={inputClass}
                  maxLength={4}
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => {
                    e.target.value = clampDigits(e.target.value, 4);
                  }}
                />
              </div>
              <div className={fieldColClass}>
                <label htmlFor="passportNumber" className={fieldLabelClass}>{t.passportNumber}</label>
                <input
                  id="passportNumber"
                  type="text"
                  placeholder="567890"
                  className={inputClass}
                  maxLength={6}
                  inputMode="numeric"
                  autoComplete="off"
                  onChange={(e) => {
                    e.target.value = clampDigits(e.target.value, 6);
                  }}
                />
              </div>
            </div>
            <CustomsPassportNotice locale={registerLang} />
            </div>
          </div>
          {/* 하단 안내 문구는 제거 — 화면을 더 간결하게 유지 */}
        </section>

        <label
          className={`flex cursor-pointer items-start gap-2.5 rounded-xl border bg-slate-50/80 px-3 py-3 text-left text-[13px] leading-snug text-slate-600 sm:text-sm ${
            legalConsentHighlight ? blockInvalidHighlightClass : 'border-slate-100'
          }`}
        >
          <input
            type="checkbox"
            checked={legalConsent}
            onChange={(e) => {
              const next = e.target.checked;
              setLegalConsent(next);
              if (next) setLegalConsentHighlight(false);
              if (submitError === t.errLegal) setSubmitError(null);
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
          />
          <span>
            {t.legalPrefix}{' '}
            {registerLang === 'ru' ? <LegalDocLinksRu /> : <LegalDocLinksEn />}.
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting || !otpVerified}
          className="min-h-11 w-full rounded-full bg-brand py-3 text-base font-semibold text-white transition hover:bg-brand/90 disabled:opacity-60"
        >
          {submitting ? t.submitting : t.submit}
        </button>
        {submitError && (
          <p className="mt-2 text-sm text-red-500">
            {submitError}
          </p>
        )}
      </form>

      <p className="mt-6 flex justify-center text-center">
        <Link
          to="/login"
          className="inline-flex max-w-full items-center justify-center gap-1.5 whitespace-nowrap text-[clamp(13px,3.85vw,15px)] font-medium text-brand hover:opacity-90 sm:text-[12px]"
        >
          <BackArrow /> {t.hasAccount}
        </Link>
      </p>
    </main>
  );
};
