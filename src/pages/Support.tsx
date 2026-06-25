import React, { useMemo, useState } from 'react';
import { useI18n } from '../context/I18nContext';

type FaqItem = { q: { ru: string; en: string }; a: { ru: string; en: string } };
type FaqCategory = { key: string; title: { ru: string; en: string }; summary: { ru: string; en: string }; items: FaqItem[] };

const FAQ_CATEGORIES: FaqCategory[] = [
  {
    key: 'shipping',
    title: { ru: 'Доставка', en: 'Shipping' },
    summary: { ru: 'График отправок, трек-номер, изменение адреса, задержки.', en: 'Shipping schedule, tracking, address changes, delays.' },
    items: [
      {
        q: { ru: 'Как часто отправляются заказы?', en: 'How often are orders shipped?' },
        a: {
          ru: 'Мы формируем отправки два раза в месяц. Заказы, оформленные до установленного дедлайна (00:00 по московскому времени за сутки до даты отсечения), включаются в ближайшую партию. Заказы, поступившие после дедлайна, войдут в следующий цикл. Актуальные даты отсечения публикуются на сайте.',
          en: 'We ship in two batches per month. Orders placed before the cutoff deadline (midnight Moscow time 24 hours before the cutoff date) are included in the nearest dispatch. Orders placed after the deadline are included in the next cycle. Current cutoff dates are published on the website.',
        },
      },
      {
        q: { ru: 'Какой службой осуществляется доставка?', en: 'Which carrier handles delivery?' },
        a: {
          ru: 'Мы используем СДЭК и Почту России. Выбор перевозчика зависит от вашего региона и текущей загрузки. Трек-номер будет отправлен вам по email и/или через Telegram после передачи посылки в службу доставки — обычно в течение 1–3 рабочих дней с момента отправки из Кореи.',
          en: 'We use СДЭК and Pochta Russia. The carrier is selected based on your region and current capacity. A tracking number will be sent to your email and/or Telegram after the parcel is handed to the carrier — typically within 1–3 business days from dispatch in Korea.',
        },
      },
      {
        q: { ru: 'Сколько времени занимает доставка?', en: 'How long does delivery take?' },
        a: {
          ru: 'Стандартный срок — от 14 до 25 дней с момента отправки. В связи с текущей международной логистической обстановкой срок доставки может достигать 40 дней. В праздничные периоды и при повышенной загрузке таможни возможны дополнительные задержки. Пожалуйста, учитывайте это при планировании получения.',
          en: 'Standard delivery takes 14 to 25 days from dispatch. Due to the current international logistics situation, delivery may take up to 40 days. Additional delays may occur during public holidays or peak customs periods. Please account for this when planning.',
        },
      },
      {
        q: { ru: 'Что делать, если посылка задерживается или трек не обновляется?', en: 'What should I do if the parcel is delayed or tracking is not updating?' },
        a: {
          ru: 'Небольшие задержки обновления трека — норма для международных отправлений: статус может не меняться 3–5 дней на промежуточных сортировках. Если статус не обновлялся более 30 дней подряд — напишите нам в Telegram или на email поддержки. Мы инициируем розыск посылки через перевозчика и обновим вас по результату.',
          en: 'Minor tracking delays are normal for international shipments — status may not update for 3–5 days at transit hubs. If the tracking status has not changed for more than 30 consecutive days, please contact us via Telegram or support email. We will initiate a trace with the carrier and update you on the outcome.',
        },
      },
      {
        q: { ru: 'Можно ли изменить адрес доставки после оплаты?', en: 'Can I change my delivery address after payment?' },
        a: {
          ru: 'Да, изменение адреса возможно до наступления дедлайна отгрузки (00:00 по московскому времени за сутки до даты отсечения). После этого момента заказ передаётся в обработку, и изменить адрес технически невозможно. Для изменения адреса обновите данные в разделе Профиль → Личные данные или напишите в поддержку заблаговременно.',
          en: 'Yes, address changes are possible before the shipping cutoff deadline (midnight Moscow time 24 hours before the cutoff date). After that point, the order enters processing and address changes are not technically possible. To update your address, edit your details in Profile → Personal details, or contact support in advance.',
        },
      },
    ],
  },
  {
    key: 'customs',
    title: { ru: 'Таможня и пошлины', en: 'Customs & Duties' },
    summary: { ru: 'Беспошлинный лимит, документы, кто оформляет.', en: 'Duty-free threshold, documents, who handles clearance.' },
    items: [
      {
        q: { ru: 'Нужно ли мне платить таможенную пошлину?', en: 'Do I need to pay customs duty?' },
        a: {
          ru: 'Для физических лиц в России действует беспошлинный порог: стоимость одного отправления не должна превышать €200, а вес — 31 кг. Мы формируем заказы с учётом этих ограничений, поэтому в большинстве случаев дополнительных таможенных платежей не возникает. Если вдруг стоимость или вес вашего заказа превысит лимит — пошлина будет оплачена получателем при получении напрямую в службе доставки.',
          en: 'For individuals in Russia, the duty-free threshold is €200 in value and 31 kg in weight per parcel. We form orders within these limits, so additional customs payments are not expected in most cases. If the value or weight of your order exceeds the threshold, the duty is paid by the recipient upon delivery directly to the carrier.',
        },
      },
      {
        q: { ru: 'Кто занимается таможенным оформлением?', en: 'Who handles customs clearance?' },
        a: {
          ru: 'Таможенное оформление берут на себя СДЭК или Почта России — в зависимости от выбранного перевозчика. Вам, как правило, ничего делать не нужно. В редких случаях перевозчик может связаться с вами напрямую для подтверждения данных или предоставления дополнительных документов.',
          en: 'Customs clearance is handled by СДЭК or Pochta Russia depending on the carrier. You generally do not need to do anything. In rare cases, the carrier may contact you directly to confirm your details or request additional documents.',
        },
      },
      {
        q: { ru: 'Какие данные могут потребоваться для таможни?', en: 'What data may be required for customs?' },
        a: {
          ru: 'В некоторых случаях таможня или перевозчик может запросить ФИО, адрес доставки, номер телефона, ИНН или паспортные данные. Это стандартная процедура для международных посылок физическим лицам. Данные передаются только в рамках требований законодательства РФ о таможенном контроле.',
          en: 'In some cases, customs or the carrier may request your full name, delivery address, phone number, INN, or passport details. This is a standard procedure for international parcels to individuals. Data is only shared within the requirements of Russian customs regulations.',
        },
      },
      {
        q: { ru: 'Почему важно указывать точные данные в профиле?', en: 'Why is it important to enter accurate details in my profile?' },
        a: {
          ru: 'Данные из профиля (ФИО, адрес, номер телефона, ИНН) передаются перевозчику и используются для таможенного оформления. Если указанные данные не совпадают с документами получателя, посылка может быть задержана на таможне или возвращена отправителю. В этом случае расходы на доставку в обе стороны несёт покупатель. Пожалуйста, убедитесь, что все данные актуальны перед оформлением заказа.',
          en: 'Profile details (full name, address, phone number, INN) are passed to the carrier and used for customs clearance. If the information does not match the recipient\'s documents, the parcel may be held at customs or returned to sender. In that case, round-trip shipping costs are borne by the buyer. Please make sure all details are up to date before placing an order.',
        },
      },
    ],
  },
  {
    key: 'returns',
    title: { ru: 'Возврат и обмен', en: 'Returns & Exchange' },
    summary: { ru: 'Повреждение, ошибка комплектации, сроки и порядок обращения.', en: 'Damage, wrong item, deadlines and how to file a claim.' },
    items: [
      {
        q: { ru: 'Каковы мои права при покупке в интернет-магазине?', en: 'What are my rights when buying from an online store?' },
        a: {
          ru: 'Покупки в SEMO Box являются дистанционной продажей и регулируются ст. 26.1 Закона РФ «О защите прав потребителей» (ФЗ № 2300-1) и Правилами продажи товаров по договору розничной купли-продажи (Постановление Правительства РФ № 612). Вы вправе отказаться от товара надлежащего качества до его получения — в любой момент, а после получения — в течение 7 дней. Для этого товар должен сохранять товарный вид и потребительские свойства (упаковка не вскрыта, не бывший в употреблении). Для оформления возврата свяжитесь с нашей поддержкой — мы предоставим инструкции.',
          en: 'Purchases from SEMO Box are distance sales governed by Article 26.1 of the Russian Consumer Protection Law (Federal Law No. 2300-1) and the Rules of Retail Sales (Government Decree No. 612). You have the right to refuse a product of acceptable quality at any time before delivery, or within 7 days after receipt. To qualify, the item must retain its original condition and consumer properties (packaging unopened, unused). To initiate a return, contact our support team and we will provide instructions.',
        },
      },
      {
        q: { ru: 'Можно ли вернуть косметику?', en: 'Can I return cosmetics?' },
        a: {
          ru: 'Если упаковка не вскрыта и товар не был в употреблении — вы вправе вернуть его в течение 7 дней с момента получения в соответствии с правилами дистанционной торговли. Если упаковка уже вскрыта, вернуть такой товар как надлежащего качества невозможно, поскольку его потребительские свойства и товарный вид не могут быть подтверждены. Это правило применяется на основании Постановления Правительства РФ № 612. В случае ненадлежащего качества (брак, повреждение при доставке) правила возврата другие — см. вопросы ниже.',
          en: 'If the packaging is unopened and the item has not been used, you may return it within 7 days of receipt under distance selling rules. If the packaging has been opened, the item cannot be returned as a product of acceptable quality, since its consumer properties and original condition can no longer be confirmed. This is based on Government Decree No. 612. If the item is defective or damaged in transit, different return rules apply — see the questions below.',
        },
      },
      {
        q: { ru: 'Что делать, если товар пришёл повреждённым?', en: 'What should I do if an item arrived damaged?' },
        a: {
          ru: 'Зафиксируйте повреждение на фото или видео сразу при получении или вскрытии упаковки — в идеале в тот же день, максимум на следующий. Чем раньше вы это сделаете, тем проще будет подтвердить факт повреждения при транспортировке. Отправьте материалы и описание в нашу поддержку через Telegram или email. В зависимости от ситуации мы предложим замену или возврат средств. Товар ненадлежащего качества можно вернуть в течение гарантийного срока — по закону это не менее 2 лет (ФЗ № 2300-1, ст. 19).',
          en: 'Document the damage with photos or video immediately upon receipt or when opening the packaging — ideally the same day, no later than the next day. The sooner you document it, the easier it is to confirm damage in transit. Send the materials and a description to our support via Telegram or email. Depending on the situation, we will offer a replacement or a refund. Defective goods may be returned within the warranty period — by law this is at least 2 years (Federal Law No. 2300-1, Article 19).',
        },
      },
      {
        q: { ru: 'Что делать, если пришёл не тот товар?', en: 'What if I received the wrong item?' },
        a: {
          ru: 'Пожалуйста, сфотографируйте этикетку на упаковке и содержимое коробки, затем свяжитесь с нами. Несоответствие заказа — это ненадлежащее исполнение обязательства с нашей стороны, и мы обязаны устранить его за свой счёт. Правильный товар отправим в следующей доступной отгрузке или предложим альтернативное решение.',
          en: 'Please photograph the label on the package and the contents of the box, then contact us. Receiving the wrong item is a failure on our part and we are obligated to resolve it at our expense. We will send the correct item in the next available shipment or offer an alternative solution.',
        },
      },
      {
        q: { ru: 'Посылка считается утерянной — что происходит дальше?', en: 'My parcel is considered lost — what happens next?' },
        a: {
          ru: 'Если трек-номер не показывает движения на протяжении 30 и более дней, мы инициируем официальный розыск через перевозчика. После подтверждения утери вам будет предложена повторная отправка в следующем доступном цикле или полный возврат средств на тот же способ оплаты, которым вы оформляли заказ. Срок возврата средств — до 10 дней с момента подтверждения (ФЗ № 2300-1, ст. 22).',
          en: 'If the tracking number shows no movement for 30 or more days, we initiate an official trace with the carrier. Once loss is confirmed, you will be offered a re-shipment in the next available cycle or a full refund to the original payment method used for the order. Refunds are processed within 10 days of confirmation (Federal Law No. 2300-1, Article 22).',
        },
      },
      {
        q: { ru: 'Как происходит возврат средств?', en: 'How are refunds processed?' },
        a: {
          ru: 'Возврат осуществляется тем же способом, которым была произведена оплата (на карту, через которую прошёл платёж). Это требование ФЗ № 2300-1, ст. 26.1. Срок зачисления — до 10 дней с момента получения нами возвращённого товара. Фактическое время зачисления также зависит от вашего банка. Расходы на обратную доставку несёт покупатель.',
          en: 'Refunds are returned to the same payment method used for the original purchase (to the card that was charged), as required by Federal Law No. 2300-1, Article 26.1. Processing takes up to 10 days from when we receive the returned item. Actual posting time also depends on your bank. Return shipping costs are borne by the buyer.',
        },
      },
    ],
  },
  {
    key: 'payment',
    title: { ru: 'Оплата и скидки', en: 'Payment & Discounts' },
    summary: { ru: 'Способы оплаты, баллы, купоны.', en: 'Payment methods, points, coupons.' },
    items: [
      {
        q: { ru: 'Какие способы оплаты доступны?', en: 'What payment methods are available?' },
        a: {
          ru: 'Мы принимаем оплату картами российских платёжных систем (Мир) и международными картами. Доступные способы отображаются на странице оформления заказа.',
          en: 'We accept Russian payment cards (Mir) and international cards. Available methods are shown on the checkout page.',
        },
      },
      {
        q: { ru: 'Когда списываются баллы и применяются купоны?', en: 'When are points deducted and coupons applied?' },
        a: {
          ru: 'Баллы и купоны применяются на последнем шаге оформления заказа, до финального подтверждения и списания оплаты. После подтверждения заказа изменить или отменить применение скидки невозможно.',
          en: 'Points and coupons are applied at the final step of checkout, before payment confirmation and charge. Once the order is confirmed, the discount cannot be changed or reversed.',
        },
      },
      {
        q: { ru: 'Можно ли использовать баллы и купон одновременно?', en: 'Can I use points and a coupon at the same time?' },
        a: {
          ru: 'Да, если это разрешено условиями текущей акции. Ограничения на совмещение скидок, если они применяются, будут указаны в описании купона или на странице корзины.',
          en: 'Yes, if allowed by the terms of the current promotion. Restrictions on combining discounts, if applicable, will be noted in the coupon description or on the cart page.',
        },
      },
      {
        q: { ru: 'Почему купон не применяется?', en: 'Why is my coupon not working?' },
        a: {
          ru: 'Возможные причины: истёк срок действия купона, он уже был использован, сумма заказа не достигает минимального порога или купон не распространяется на выбранные товары. Проверьте условия купона и, если проблема остаётся, обратитесь в поддержку — мы разберёмся.',
          en: 'Possible reasons: the coupon has expired, it has already been used, the order total does not meet the minimum threshold, or the coupon does not apply to the selected items. Check the coupon terms and, if the issue persists, contact support — we will help.',
        },
      },
    ],
  },
  {
    key: 'account',
    title: { ru: 'Аккаунт и безопасность', en: 'Account & Security' },
    summary: { ru: 'Email, Telegram, данные профиля, вход и безопасность.', en: 'Email, Telegram, profile data, login and security.' },
    items: [
      {
        q: { ru: 'Зачем подтверждать email при регистрации?', en: 'Why do I need to verify my email at registration?' },
        a: {
          ru: 'Подтверждённый email — это основной канал связи с вами: именно на него приходят статусы заказов, чеки об оплате и важные сервисные уведомления. Без подтверждения часть функций аккаунта может быть недоступна. Письмо приходит сразу после регистрации — проверьте папку «Спам», если не видите его во входящих.',
          en: 'A verified email is the primary channel for communication: order statuses, payment receipts, and important service notifications are all sent there. Without verification, some account features may be unavailable. The confirmation email is sent immediately after registration — check your Spam folder if you do not see it in your inbox.',
        },
      },
      {
        q: { ru: 'Что даёт привязка аккаунта к Telegram?', en: 'What does linking my account to Telegram give me?' },
        a: {
          ru: 'Telegram позволяет получать оперативные уведомления об изменении статуса заказа, акциях и новинках — быстрее, чем по email. Кроме того, через Telegram удобнее и быстрее связываться с командой поддержки.',
          en: 'Telegram allows you to receive timely notifications about order status changes, promotions, and new products — faster than email. It is also a more convenient and faster way to reach our support team.',
        },
      },
      {
        q: { ru: 'Как обновить данные доставки?', en: 'How do I update my delivery details?' },
        a: {
          ru: 'Откройте Профиль → Личные данные и внесите нужные изменения. Помните: изменения вступают в силу только для будущих заказов. Если до ближайшего дедлайна отгрузки ещё есть время — успейте обновить данные до 00:00 по московскому времени за сутки до даты отсечения.',
          en: 'Open Profile → Personal details and make the necessary changes. Please note: changes apply to future orders only. If the next shipping cutoff has not yet passed, make sure to update before midnight Moscow time 24 hours before the cutoff date.',
        },
      },
      {
        q: { ru: 'Как сбросить пароль?', en: 'How do I reset my password?' },
        a: {
          ru: 'На странице входа нажмите «Забыли пароль?» и введите email, указанный при регистрации. Мы отправим письмо со ссылкой для сброса пароля. Ссылка действительна ограниченное время — перейдите по ней как можно скорее. Если письмо не пришло, проверьте папку «Спам».',
          en: 'On the login page, click "Forgot password?" and enter the email you registered with. We will send you a password reset link. The link is valid for a limited time — please use it promptly. If you do not receive the email, check your Spam folder.',
        },
      },
      {
        q: { ru: 'Не могу войти в аккаунт — что делать?', en: 'I cannot log in — what should I do?' },
        a: {
          ru: 'Сначала убедитесь, что вводите правильный email и пароль, а Caps Lock выключен. Если проблема остаётся — попробуйте сбросить пароль через ссылку «Забыли пароль?». Если войти по-прежнему не получается — обратитесь в нашу службу поддержки через Telegram или email, мы поможем восстановить доступ.',
          en: 'First, make sure you are entering the correct email and password, and that Caps Lock is off. If the issue persists, try resetting your password via the "Forgot password?" link. If you still cannot log in, contact our support team via Telegram or email — we will help you regain access.',
        },
      },
    ],
  },
];

export const Support: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  const [openKey, setOpenKey] = useState<string>('');
  const [query, setQuery] = useState('');
  const categoryCountLabel = useMemo(
    () => (isEn ? `${FAQ_CATEGORIES.length} sections` : `${FAQ_CATEGORIES.length} разделов`),
    [isEn],
  );
  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_CATEGORIES;
    return FAQ_CATEGORIES
      .map((cat) => {
        const catText = `${isEn ? cat.title.en : cat.title.ru} ${isEn ? cat.summary.en : cat.summary.ru}`;
        const catHit = catText.toLowerCase().includes(q);
        const items = cat.items.filter((it) => `${isEn ? it.q.en : it.q.ru} ${isEn ? it.a.en : it.a.ru}`.toLowerCase().includes(q));
        if (catHit) return cat;
        return { ...cat, items };
      })
      .filter((cat) => cat.items.length > 0);
  }, [query, isEn]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-10 md:py-14">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl md:text-4xl">FAQ</h1>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">
          {isEn
            ? 'Frequently asked questions about international shipping, customs, returns, and account.'
            : 'Частые вопросы по международной доставке, таможне, возвратам и аккаунту.'}
        </p>
        <p className="mt-1 text-xs text-slate-500">{categoryCountLabel}</p>
      </header>

      <div className="mb-5">
        <label htmlFor="faq-search" className="sr-only">
          {isEn ? 'Search FAQ' : 'Поиск по FAQ'}
        </label>
        <input
          id="faq-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={isEn ? 'Search: shipping, customs, return, coupon...' : 'Поиск: доставка, пошлина, возврат, купон...'}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <section className="space-y-4">
        {filteredCategories.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {isEn ? 'No results found. Try another keyword.' : 'По запросу ничего не найдено. Попробуйте другое ключевое слово.'}
          </div>
        )}
        {filteredCategories.map((cat) => (
          <article key={cat.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
              <h2 className="text-sm font-semibold text-slate-900 sm:text-base">{isEn ? cat.title.en : cat.title.ru}</h2>
              <p className="mt-1 text-xs text-slate-500">{isEn ? cat.summary.en : cat.summary.ru}</p>
            </div>
            <ul className="divide-y divide-slate-100">
              {cat.items.map((item, idx) => {
                const key = `${cat.key}:${idx}`;
                const isOpen = openKey === key;
                return (
                  <li key={key} className="px-4 py-1 sm:px-5">
                    <button
                      type="button"
                      onClick={() => setOpenKey((prev) => (prev === key ? '' : key))}
                      className="flex w-full items-center justify-between gap-3 py-3 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="text-sm font-medium text-slate-800">{isEn ? item.q.en : item.q.ru}</span>
                      <span className="shrink-0 text-slate-400">{isOpen ? '−' : '+'}</span>
                    </button>
                    {isOpen && <p className="pb-4 text-sm leading-relaxed text-slate-600">{isEn ? item.a.en : item.a.ru}</p>}
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
};
