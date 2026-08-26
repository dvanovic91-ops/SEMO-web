import React from 'react';
import { useI18n } from '../context/I18nContext';

/**
 * Deepkor(화장품 성분분석 앱)의 이용약관/개인정보처리방침 — SEMO box와는
 * 다른 서비스지만, 같은 사업자(세모박스)가 운영하고 아직 Deepkor 전용
 * 도메인이 없어서 이 사이트(semo-box.com)의 /deepkor/* 경로에 얹어둔다.
 * SEMO box 자체의 /legal 과는 무관 — 절대 그 라우트와 합치지 말 것.
 *
 * 본문은 앱 코드의 lib/content/legal_content.dart 와 내용을 맞춰야 한다 —
 * 둘 중 하나만 고치면 서로 어긋나니, 문구를 바꿀 땐 항상 양쪽 다 갱신할 것.
 * (2026-08-27: 앱에 자체 탈퇴 기능이 이미 구현되어 있어서, 구버전 문구에
 * 있던 "이메일로 요청하면 90일 내 삭제"는 빼고 앱 내 삭제 경로로 정정했다.)
 *
 * 2026-08-27 도입.
 */

type Section = { heading: string; body: string };

const sectionClass = 'border-t border-slate-100 pt-8 first:border-t-0 first:pt-0';
const h2Class = 'text-base font-semibold text-slate-900 sm:text-lg';
const pClass = 'mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600';

const DeepkorLegalPage: React.FC<{ title: string; sections: Section[] }> = ({ title, sections }) => (
  <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
    <header className="mb-8 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Deepkor</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
    </header>
    <div className="space-y-8">
      {sections.map((s) => (
        <section key={s.heading} className={sectionClass}>
          <h2 className={h2Class}>{s.heading}</h2>
          <p className={pClass}>{s.body}</p>
        </section>
      ))}
    </div>
  </main>
);

const termsEn: Section[] = [
  {
    heading: 'About these terms',
    body: 'These terms govern your use of the Deepkor app, operated by Semobox (세모박스) (business registration number 202-17-09959), located at 66 Gimpohangang 9-ro 75beon-gil, Gimpo-si, Gyeonggi-do, Unit K392, 14611, South Korea. By using Deepkor, you agree to these terms.',
  },
  {
    heading: 'What Deepkor is',
    body: 'Deepkor helps you read and understand cosmetics ingredient lists and check how well a product may fit your skin profile. The information we show — including skin-type matches, ingredient explanations, and formulation-focus scores — is for general informational purposes only. It is not medical, dermatological, or professional skincare advice. If you have a skin condition, allergy, or medical concern, please consult a qualified professional.',
  },
  {
    heading: 'Your account',
    body: 'You can use Deepkor as a guest (anonymous account) or sign in with Google, Apple, or Yandex. Signing in lets you keep your skin profile, reviews, and saved products across devices. You are responsible for keeping your login credentials secure. Signing in itself is subject to that provider’s own age and account policies (see "Children’s privacy" in our Privacy Policy).',
  },
  {
    heading: 'Content you provide',
    body: 'When you scan an ingredient label or add photos to a review, you keep ownership of those photos. By submitting them, you grant Deepkor a non-exclusive, worldwide, royalty-free license to use, store, and display that content to operate the service — including using ingredient-label scan photos to improve our recognition accuracy. Review photos are shown publicly to other users; you can also choose, in Settings, whether photos you add to reviews may additionally be used to help improve our recognition models. You are responsible for only uploading photos you have the right to share, and for not including other people’s personal information in what you submit.',
  },
  {
    heading: 'Acceptable use',
    body: 'Please don’t use Deepkor to submit false product information, impersonate a brand or another person, upload content you don’t have rights to, or attempt to disrupt or reverse-engineer the service. Community-submitted product and ingredient data is reviewed before being published; we may edit, decline, or remove submissions and reviews that don’t meet our guidelines.',
  },
  {
    heading: 'Sponsored content and affiliate links',
    body: 'Some content in the app — for example, items labeled "Sponsored" or "Partner spotlight" — is paid placement from partner brands. We label this content clearly so you can tell it apart from our own editorial picks. Some links in the app (for example, to booking or shopping partners) are affiliate links — Semobox (세모박스) may earn a commission if you make a purchase through them, at no extra cost to you.',
  },
  {
    heading: 'Third-party services',
    body: 'Some features rely on third-party providers — for example, we use an external AI service to help read and analyze ingredient-label photos, and social sign-in is handled by Google, Apple, or Yandex directly. Their own terms may apply to those parts of the experience.',
  },
  {
    heading: 'Fees and account termination',
    body: 'Deepkor is currently free to use — we don’t charge you directly for the app. We may suspend or terminate accounts that violate these terms. You can stop using Deepkor at any time; see our Privacy Policy for how to have your account and data deleted.',
  },
  {
    heading: 'Disclaimers and liability',
    body: 'Deepkor is provided "as is." While we work to keep ingredient and product data accurate, some of it comes from OCR scans and community submissions and may contain errors — always check the actual product packaging before use, especially if you have allergies. To the extent permitted by law, Semobox (세모박스) is not liable for damages arising from reliance on information shown in the app.',
  },
  {
    heading: 'Governing law',
    body: 'These terms are governed by the laws of the Republic of Korea, where Semobox (세모박스) is registered, regardless of the country you access Deepkor from. This doesn’t limit any data-protection or consumer rights you may have under the mandatory laws of the country where you live.',
  },
  {
    heading: 'Changes to these terms',
    body: 'We may update these terms as the service evolves. If we make significant changes, we’ll let you know in the app before they take effect.',
  },
  { heading: 'Contact', body: 'Questions about these terms? Reach us at semo@semo-box.com.' },
];

const termsRu: Section[] = [
  {
    heading: 'Об этих условиях',
    body: 'Эти условия регулируют использование приложения Deepkor, которое предоставляет Semobox (세모박스) (регистрационный номер 202-17-09959), зарегистрированное по адресу 66 Gimpohangang 9-ro 75beon-gil, Gimpo-si, Gyeonggi-do, Unit K392, 14611, South Korea. Используя Deepkor, вы соглашаетесь с этими условиями.',
  },
  {
    heading: 'Что такое Deepkor',
    body: 'Deepkor помогает читать и понимать состав косметики и проверять, насколько продукт подходит вашему типу кожи. Информация в приложении — включая совпадение по типу кожи, описания компонентов и оценки формулы — носит справочный характер и не является медицинской или профессиональной консультацией по уходу за кожей. При наличии кожных заболеваний, аллергии или других медицинских вопросов обращайтесь к специалисту.',
  },
  {
    heading: 'Ваш аккаунт',
    body: 'Deepkor можно использовать как гость (анонимный аккаунт) или войти через Google, Apple или Yandex. Вход позволяет сохранять профиль кожи, отзывы и избранные продукты на разных устройствах. Вы несёте ответственность за безопасность своих учётных данных. Сам вход подчиняется возрастной политике соответствующего провайдера (см. «Конфиденциальность детей» в нашей Политике конфиденциальности).',
  },
  {
    heading: 'Контент, который вы добавляете',
    body: 'Сканируя этикетку состава или добавляя фото к отзыву, вы сохраняете права на эти фотографии. Отправляя их, вы предоставляете Deepkor неисключительную, безвозмездную лицензию на использование, хранение и показ этого контента для работы сервиса — включая использование фото сканов состава для улучшения точности распознавания. Фото из отзывов видны другим пользователям; в настройках вы можете дополнительно решить, могут ли фото из отзывов использоваться для улучшения моделей распознавания. Вы несёте ответственность за то, что загружаете только те фото, на которые имеете право, и не включаете в них личные данные других людей.',
  },
  {
    heading: 'Допустимое использование',
    body: 'Пожалуйста, не используйте Deepkor для публикации ложной информации о продуктах, выдачи себя за бренд или другого человека, загрузки контента без соответствующих прав, а также для попыток нарушить работу сервиса. Данные о продуктах и компонентах, добавленные сообществом, проходят проверку перед публикацией; мы можем редактировать, отклонять или удалять заявки и отзывы, не соответствующие нашим правилам.',
  },
  {
    heading: 'Спонсорский контент и партнёрские ссылки',
    body: 'Часть контента в приложении — например, блоки с пометкой «Sponsored» или «Partner spotlight» — это платное размещение от партнёрских брендов. Мы явно помечаем такой контент, чтобы его можно было отличить от собственных редакционных подборок. Некоторые ссылки в приложении (например, на бронирование или покупку) являются партнёрскими — Semobox (세모박스) может получать комиссию с покупок по ним, без дополнительных затрат для вас.',
  },
  {
    heading: 'Сторонние сервисы',
    body: 'Некоторые функции работают через сторонних поставщиков — например, мы используем внешний AI-сервис для распознавания и анализа фото этикеток, а вход через социальные сети обрабатывается напрямую Google, Apple или Yandex. К этим частям сервиса могут применяться их собственные условия использования.',
  },
  {
    heading: 'Плата за использование и прекращение действия аккаунта',
    body: 'Deepkor сейчас бесплатен — мы не берём с вас плату напрямую за приложение. Мы можем приостановить или удалить аккаунты, нарушающие эти условия. Вы можете прекратить пользоваться Deepkor в любой момент; о том, как удалить аккаунт и данные, — в нашей Политике конфиденциальности.',
  },
  {
    heading: 'Отказ от ответственности',
    body: 'Deepkor предоставляется "как есть". Мы стремимся поддерживать точность данных о продуктах и компонентах, но часть информации получена через сканирование и заявки сообщества и может содержать ошибки — всегда проверяйте фактическую упаковку продукта перед использованием, особенно при наличии аллергии. В пределах, допустимых законом, Semobox (세모박스) не несёт ответственности за ущерб, возникший из-за использования информации из приложения.',
  },
  {
    heading: 'Применимое право',
    body: 'Эти условия регулируются законодательством Республики Корея, где зарегистрирована Semobox (세모박스), независимо от страны, из которой вы используете Deepkor. Это не ограничивает права на защиту персональных данных и права потребителей, которые могут предоставляться вам обязательным законодательством страны, где вы проживаете.',
  },
  {
    heading: 'Изменения условий',
    body: 'Мы можем обновлять эти условия по мере развития сервиса. О существенных изменениях мы сообщим в приложении заранее.',
  },
  { heading: 'Контакты', body: 'Вопросы по этим условиям — пишите на semo@semo-box.com.' },
];

const privacyEn: Section[] = [
  {
    heading: 'Who we are',
    body: 'Deepkor is operated by Semobox (세모박스) (business registration number 202-17-09959), located at 66 Gimpohangang 9-ro 75beon-gil, Gimpo-si, Gyeonggi-do, Unit K392, 14611, South Korea. This policy explains what data we collect, why, and how you can control it. For privacy-specific requests, contact semo@semo-box.com.',
  },
  {
    heading: 'Information we collect',
    body: 'Account info: if you sign in, we receive your email or the basic profile info shared by Google/Apple/Yandex. Guest use doesn’t require any of this.\n\nBeauty profile: your Baumann skin-type quiz answers, skin concerns, allergy and pregnancy/nursing flags, and ingredients you’ve chosen to avoid.\n\nPhotos: ingredient-label photos you scan, and photos you add to reviews.\n\nUsage data: products you view, search, scan, or save, and reviews you write.',
  },
  {
    heading: 'How we use your information',
    body: 'To run the core service — matching products and ingredients to your skin profile, showing scan results, and displaying your saved history and reviews.\n\nTo improve ingredient recognition — photos of ingredient labels you scan help us improve how accurately we read and match ingredients. This is part of how the scan feature itself works.\n\nOptionally, to improve recognition further — if you’ve enabled it in Settings, photos you add to reviews may also be used for this. You can turn this off anytime; it’s on by default and does not affect your ability to use the app either way.',
  },
  {
    heading: 'Third-party services',
    body: 'We use an external AI provider (currently Google’s Gemini API) to read and analyze ingredient-label photos. Photos and extracted text may be sent to this provider to generate your scan results. If you sign in with Google, Apple, or Yandex, those providers handle the authentication step directly.',
  },
  {
    heading: 'Where your data is stored',
    body: 'Your data is currently stored on cloud servers located outside Russia. As we grow, we plan to move Russian-user data to Yandex Cloud (based in Russia) to better support data-localization requirements for our Russian users — this section will be updated once that migration happens. Until then, if you are located in Russia, your data may be transferred and processed outside of Russia.',
  },
  {
    heading: 'How long we keep your data',
    body: 'Account and beauty-profile data (skin type, concerns, avoided ingredients), favorites, and scan history are kept for as long as your account stays active, and deleted when you delete your account. You can delete your account yourself in the app, under Account → Delete account — this permanently removes your profile, favorites, and scan history. Ingredient-scan photos are kept for as long as they’re useful for improving our recognition — an ongoing use rather than a fixed short window. Reviews (including their photos) stay published even after you delete your account — we detach them from your identity rather than removing them, since other users rely on that content — but you can delete an individual review yourself at any time, which does remove it. Community product submissions work the same way: the submission data may stay (it could already be part of the product catalog other users see), but it’s no longer linked to you.',
  },
  {
    heading: 'Your rights',
    body: 'You can review and edit your beauty profile and avoided ingredients, and delete your account, directly in the app. You can also request access to, correction of, or deletion of your data, and withdraw any consent you’ve given (for example, the optional AI-training toggle in Settings) at any time, by contacting semo@semo-box.com. Withdrawing consent doesn’t affect the lawfulness of processing before you withdrew it.',
  },
  {
    heading: 'Children’s privacy',
    body: 'Deepkor doesn’t independently verify your age. If you sign in, that’s subject to the minimum-age and parental-consent rules of Google, Apple, or Yandex — each provider applies its own policy before issuing you an account. If you use Deepkor as a guest without signing in and you’re under the age at which you can independently consent to data processing where you live, please get a parent or guardian’s permission first.',
  },
  {
    heading: 'Changes to this policy',
    body: 'We may update this policy as the service evolves. If we make significant changes, we’ll let you know in the app before they take effect.',
  },
  { heading: 'Contact', body: 'Questions about this policy? Reach us at semo@semo-box.com.' },
];

const privacyRu: Section[] = [
  {
    heading: 'Кто мы',
    body: 'Deepkor предоставляется Semobox (세모박스) (регистрационный номер 202-17-09959), зарегистрированное по адресу 66 Gimpohangang 9-ro 75beon-gil, Gimpo-si, Gyeonggi-do, Unit K392, 14611, South Korea. Эта политика объясняет, какие данные мы собираем, зачем и как вы можете ими управлять. По вопросам конфиденциальности — semo@semo-box.com.',
  },
  {
    heading: 'Какие данные мы собираем',
    body: 'Данные аккаунта: при входе мы получаем ваш email или базовые данные профиля, предоставленные Google/Apple/Yandex. Для использования в гостевом режиме это не требуется.\n\nПрофиль красоты: ответы теста Баумана на тип кожи, проблемы кожи, отметки об аллергии и беременности/кормлении, а также компоненты, которые вы выбрали избегать.\n\nФото: фотографии этикеток состава, которые вы сканируете, и фото, которые вы добавляете к отзывам.\n\nДанные использования: продукты, которые вы просматриваете, ищете, сканируете или сохраняете, а также отзывы, которые вы пишете.',
  },
  {
    heading: 'Как мы используем данные',
    body: 'Для работы основного сервиса — сопоставления продуктов и компонентов с вашим профилем кожи, показа результатов сканирования, истории и отзывов.\n\nДля улучшения распознавания компонентов — фото этикеток состава, которые вы сканируете, помогают точнее распознавать и сопоставлять компоненты. Это часть работы самой функции сканирования.\n\nДополнительно, для дальнейшего улучшения распознавания — если вы включили эту опцию в настройках, фото из отзывов также могут для этого использоваться. Вы можете отключить это в любой момент; по умолчанию опция включена и не влияет на возможность пользоваться приложением в любом случае.',
  },
  {
    heading: 'Сторонние сервисы',
    body: 'Мы используем внешнего поставщика AI (сейчас — Gemini API от Google) для чтения и анализа фото этикеток состава. Фото и распознанный текст могут отправляться этому поставщику для формирования результатов сканирования. При входе через Google, Apple или Yandex сам процесс авторизации обрабатывается этими сервисами напрямую.',
  },
  {
    heading: 'Где хранятся ваши данные',
    body: 'Сейчас данные хранятся на облачных серверах за пределами России. По мере роста мы планируем перенести данные российских пользователей на Yandex Cloud (расположен в России), чтобы лучше соответствовать требованиям локализации данных — этот раздел будет обновлён после переноса. До этого, если вы находитесь в России, ваши данные могут передаваться и обрабатываться за пределами России.',
  },
  {
    heading: 'Сколько мы храним данные',
    body: 'Данные аккаунта и профиля красоты (тип кожи, проблемы, избегаемые компоненты), избранное и история сканирований хранятся, пока ваш аккаунт активен, и удаляются при удалении аккаунта. Вы можете самостоятельно удалить аккаунт прямо в приложении, в разделе Аккаунт → Удалить аккаунт — это окончательно удалит ваш профиль, избранное и историю сканирований. Фото сканов состава хранятся, пока они полезны для улучшения распознавания — это постоянное использование, а не фиксированный короткий срок. Отзывы (вместе с фото) остаются опубликованными даже после удаления аккаунта — мы отвязываем их от вашей личности вместо того, чтобы удалять, поскольку на этот контент опираются другие пользователи, — но вы можете удалить отдельный отзыв самостоятельно в любой момент, и тогда он удалится. Так же устроены заявки о продуктах от сообщества: данные заявки могут остаться (она уже может быть частью каталога продуктов, который видят другие пользователи), но перестают быть связанными с вами.',
  },
  {
    heading: 'Ваши права',
    body: 'Вы можете просматривать и редактировать свой профиль красоты, список избегаемых компонентов и удалять аккаунт прямо в приложении. Вы также можете запросить доступ к данным, их исправление или удаление, а также отозвать любое ранее данное согласие (например, опцию AI-обучения в настройках) в любой момент, написав на semo@semo-box.com. Отзыв согласия не влияет на законность обработки, проведённой до его отзыва.',
  },
  {
    heading: 'Конфиденциальность детей',
    body: 'Deepkor самостоятельно не проверяет возраст. Вход через аккаунт регулируется правилами минимального возраста и родительского согласия Google, Apple или Yandex — каждый из этих провайдеров применяет собственную политику перед выдачей аккаунта. Если вы используете Deepkor как гость без входа и находитесь в возрасте, когда самостоятельное согласие на обработку данных ещё не допускается законодательством вашей страны, пожалуйста, получите разрешение родителя или опекуна.',
  },
  {
    heading: 'Изменения политики',
    body: 'Мы можем обновлять эту политику по мере развития сервиса. О существенных изменениях мы сообщим в приложении заранее.',
  },
  { heading: 'Контакты', body: 'Вопросы по этой политике — пишите на semo@semo-box.com.' },
];

export const DeepkorTerms: React.FC = () => {
  const { language } = useI18n();
  return <DeepkorLegalPage title={language === 'en' ? 'Terms of Service' : 'Пользовательское соглашение'} sections={language === 'en' ? termsEn : termsRu} />;
};

export const DeepkorPrivacy: React.FC = () => {
  const { language } = useI18n();
  return <DeepkorLegalPage title={language === 'en' ? 'Privacy Policy' : 'Политика конфиденциальности'} sections={language === 'en' ? privacyEn : privacyRu} />;
};
