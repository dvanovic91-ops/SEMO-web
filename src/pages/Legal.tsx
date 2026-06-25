import React from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../context/I18nContext';
import { IS_RU_REGION } from '../lib/siteRegion';

const sectionClass = 'scroll-mt-[calc(var(--semo-mobile-header-h,3.5rem)+0.75rem)] border-t border-slate-100 pt-10 first:border-t-0 first:pt-0';
const h2Class = 'text-lg font-semibold text-slate-900 sm:text-xl';
const pClass = 'mt-3 text-sm leading-relaxed text-slate-600';
const h3Class = 'mt-5 text-sm font-semibold text-slate-800';

/* ─── .ru 전용 법적 문서 (러시아 소비자보호법 기준) ─── */
const LegalRu: React.FC = () => (
  <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
    <header className="mb-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Правовая информация
      </h1>
      <p className="mt-3 text-sm text-slate-600">
        Актуальная редакция. Дата последнего обновления указана в каждом разделе.
      </p>
    </header>

    <nav className="mb-10 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-slate-600">
      <a href="#privacy" className="text-brand underline-offset-2 hover:underline">Персональные данные</a>
      <a href="#terms" className="text-brand underline-offset-2 hover:underline">Пользовательское соглашение</a>
      <a href="#delivery" className="text-brand underline-offset-2 hover:underline">Доставка и возврат</a>
      <Link to="/support" className="text-slate-500 underline-offset-2 hover:underline">FAQ</Link>
    </nav>

    {/* ── Персональные данные ── */}
    <section id="privacy" className={sectionClass}>
      <h2 className={h2Class}>Политика конфиденциальности</h2>
      <p className={pClass}>Редакция от 25.06.2026</p>

      <h3 className={h3Class}>1. Оператор</h3>
      <p className={pClass}>
        Оператором персональных данных является продавец — индивидуальный предприниматель,
        действующий на основании законодательства РФ. Реквизиты оператора указаны в разделе
        «Пользовательское соглашение».
      </p>

      <h3 className={h3Class}>2. Какие данные собираем</h3>
      <p className={pClass}>
        Имя, фамилия, отчество; адрес электронной почты; номер телефона; адрес доставки;
        ИНН (при необходимости для таможенного оформления); паспортные данные (при запросе
        таможенных органов).
      </p>

      <h3 className={h3Class}>3. Цели обработки</h3>
      <p className={pClass}>
        Оформление и исполнение заказов; уведомления о статусе заказа; поддержка клиентов;
        таможенное оформление отправлений.
      </p>

      <h3 className={h3Class}>4. Хранение данных</h3>
      <p className={pClass}>
        Персональные данные хранятся на серверах Yandex Cloud, расположенных на территории
        Российской Федерации, в соответствии с требованиями ФЗ-152.
      </p>

      <h3 className={h3Class}>5. Доступ из-за рубежа</h3>
      <p className={pClass}>
        В целях исполнения заказов ваши данные могут быть доступны сотрудникам,
        находящимся за пределами РФ (Республика Корея). Хранение данных осуществляется
        исключительно на серверах в РФ. Используя сайт и оформляя заказ, вы даёте
        согласие на такой доступ.
      </p>

      <h3 className={h3Class}>6. Передача третьим лицам</h3>
      <p className={pClass}>
        Данные передаются логистическим и таможенным операторам в объёме, необходимом
        для доставки. Иная передача — только по требованию закона или с вашего согласия.
      </p>

      <h3 className={h3Class}>7. Ваши права</h3>
      <p className={pClass}>
        Вы вправе запросить уточнение, исправление или удаление своих данных,
        обратившись по адресу:{' '}
        <a href="mailto:semo@semo-box.ru" className="text-brand hover:underline">
          semo@semo-box.ru
        </a>
      </p>
    </section>

    {/* ── Пользовательское соглашение ── */}
    <section id="terms" className={sectionClass}>
      <h2 className={h2Class}>Пользовательское соглашение</h2>
      <p className={pClass}>Редакция от 25.06.2026</p>

      <h3 className={h3Class}>1. Стороны</h3>
      <p className={pClass}>
        <strong>Продавец:</strong> [ФИО], индивидуальный предприниматель, ОГРНИП [●],
        адрес: [●], e-mail:{' '}
        <a href="mailto:semo@semo-box.ru" className="text-brand hover:underline">
          semo@semo-box.ru
        </a>.<br />
        <strong>Покупатель:</strong> физическое лицо, оформившее заказ на сайте.
      </p>

      <h3 className={h3Class}>2. Предмет</h3>
      <p className={pClass}>
        Продавец реализует товары (корейская косметика, beauty-боксы) дистанционным
        способом через сайт semo-box.ru. Товары доставляются из Республики Корея
        напрямую покупателю в виде международного почтового отправления.
      </p>

      <h3 className={h3Class}>3. Оформление и подтверждение заказа</h3>
      <p className={pClass}>
        Заказ считается принятым после получения покупателем подтверждения на e-mail.
        Договор купли-продажи вступает в силу с момента отправки трек-номера покупателю.
      </p>

      <h3 className={h3Class}>4. Цены и оплата</h3>
      <p className={pClass}>
        Цены указаны в рублях. Продавец вправе изменять цены; изменение не затрагивает
        уже подтверждённые заказы.
      </p>

      <h3 className={h3Class}>5. Доставка</h3>
      <p className={pClass}>
        Доставка осуществляется из Республики Корея международными логистическими
        операторами. Сроки и стоимость отображаются при оформлении заказа. Риск
        случайной гибели товара переходит к покупателю с момента получения отправления.
      </p>

      <h3 className={h3Class}>6. Ответственность</h3>
      <p className={pClass}>
        Продавец не несёт ответственности за задержки, вызванные действиями таможенных
        органов или логистических операторов.
      </p>

      <h3 className={h3Class}>7. Применимое право</h3>
      <p className={pClass}>
        К настоящему соглашению применяется законодательство Российской Федерации.
        Споры разрешаются путём переговоров, при недостижении согласия — в суде по
        месту нахождения покупателя.
      </p>
    </section>

    {/* ── Доставка и возврат ── */}
    <section id="delivery" className={sectionClass}>
      <h2 className={h2Class}>Условия доставки и возврата</h2>
      <p className={pClass}>Редакция от 25.06.2026</p>

      <h3 className={h3Class}>Доставка</h3>
      <p className={pClass}>
        Доставка осуществляется из Республики Корея. Срок доставки — обычно 7–20 дней
        после подтверждения оплаты; в периоды высокой нагрузки срок может увеличиться.
        Стоимость доставки отображается при оформлении заказа.
      </p>

      <h3 className={h3Class}>Таможня</h3>
      <p className={pClass}>
        Для физических лиц действует беспошлинный порог: <strong>€200 и не более 31 кг</strong>{' '}
        в одном отправлении. При превышении лимита таможенная пошлина оплачивается
        получателем. Таможенные органы или логистическая служба могут запросить ФИО,
        адрес, ИНН и паспортные данные получателя.
      </p>

      <h3 className={h3Class}>Возврат товара надлежащего качества</h3>
      <p className={pClass}>
        В соответствии с п. 4 ст. 26.1 Закона РФ № 2300-1 «О защите прав потребителей»
        покупатель вправе отказаться от товара в течение <strong>7 (семи) дней</strong>{' '}
        с момента получения при соблюдении следующих условий:
      </p>
      <ul className="mt-2 list-disc pl-5 text-sm leading-relaxed text-slate-600">
        <li>товар не имеет следов использования;</li>
        <li>сохранены упаковка, маркировка и потребительские свойства товара.</li>
      </ul>
      <p className={pClass}>
        <strong>Косметическая продукция надлежащего качества возврату не подлежит</strong>{' '}
        в соответствии с Постановлением Правительства РФ № 2463 (перечень товаров,
        не подлежащих возврату и обмену).
      </p>

      <h3 className={h3Class}>Возврат товара ненадлежащего качества</h3>
      <p className={pClass}>
        Повреждение, некомплектность или несоответствие заказу — сообщите в поддержку
        в течение <strong>48 часов</strong> с момента получения, приложив фото/видео.
        Мы предложим замену или возврат средств.
      </p>

      <h3 className={h3Class}>Процедура возврата</h3>
      <p className={pClass}>
        Напишите на{' '}
        <a href="mailto:semo@semo-box.ru" className="text-brand hover:underline">
          semo@semo-box.ru
        </a>{' '}
        с темой «Возврат», указав ФИО, номер заказа и описание причины. Возврат средств
        осуществляется в течение 14 календарных дней с момента получения заявки.
        Расходы на обратную доставку несёт покупатель.
      </p>
    </section>
  </main>
);

/* ─── .com (글로벌) 법적 문서 — 기존 골격 유지 ─── */
const LegalGlobal: React.FC = () => {
  const { language } = useI18n();
  const isEn = language === 'en';
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-14">
      <header className="mb-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          {isEn ? 'Legal information' : 'Правовая информация'}
        </h1>
        <p className="mt-3 text-sm text-slate-600">
          {isEn
            ? 'Below are base sections. The latest version may be updated; publication date is shown in the text.'
            : 'Ниже — базовые разделы. Актуальная редакция может обновляться; дата размещения указана в тексте.'}
        </p>
      </header>

      <nav className="mb-10 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <a href="#privacy" className="text-brand underline-offset-2 hover:underline">
          {isEn ? 'Personal data' : 'Персональные данные'}
        </a>
        <a href="#terms" className="text-brand underline-offset-2 hover:underline">
          {isEn ? 'User agreement' : 'Пользовательское соглашение'}
        </a>
        <a href="#delivery" className="text-brand underline-offset-2 hover:underline">
          {isEn ? 'Delivery' : 'Доставка'}
        </a>
        <Link to="/support" className="text-slate-500 underline-offset-2 hover:underline">FAQ</Link>
      </nav>

      <section id="privacy" className={sectionClass}>
        <h2 className={h2Class}>{isEn ? 'Personal data processing' : 'Обработка персональных данных'}</h2>
        <p className={pClass}>
          {isEn
            ? 'The operator processes personal data (including email, name, phone number, and delivery address) for registration, order processing, order status notifications, and customer support. Data is shared with third parties only to the extent required for delivery and customs clearance, or when required by law. You can request clarification, correction, or deletion via support.'
            : 'Оператор обрабатывает персональные данные (в т.ч. email, имя, телефон, адрес доставки) в целях регистрации, оформления и исполнения заказов, уведомлений о статусе заказа и поддержки клиентов. Передача третьим лицам — только в объёме, необходимом для доставки и таможенного оформления, либо по требованию закона. Вы вправе запросить уточнение, исправление или удаление данных через службу поддержки.'}
        </p>
      </section>

      <section id="terms" className={sectionClass}>
        <h2 className={h2Class}>{isEn ? 'User agreement' : 'Пользовательское соглашение'}</h2>
        <p className={pClass}>
          {isEn
            ? 'By using the SEMO Box website and service, you agree to provide accurate data, not disrupt site operations, and follow checkout and payment rules. Intellectual property rights for the site content belong to their respective owners.'
            : 'Используя сайт и сервис SEMO box, вы обязуетесь предоставлять достоверные данные, не нарушать работу сайта и соблюдать правила оформления заказов и оплаты. Интеллектуальная собственность контента сайта принадлежит правообладателям.'}
        </p>
      </section>

      <section id="delivery" className={sectionClass}>
        <h2 className={h2Class}>{isEn ? 'Delivery terms' : 'Условия доставки'}</h2>
        <p className={pClass}>
          {isEn
            ? 'Delivery is carried out from Korea to your destination; timelines and stages depend on logistics and customs. Delivery cost and methods are shown during checkout. Detailed answers are in the '
            : 'Доставка осуществляется из Кореи до вашего адресата; сроки и этапы зависят от логистики и таможни. Стоимость и способы доставки отображаются при оформлении заказа. Подробные ответы — в разделе '}
          <Link to="/support" className="font-medium text-brand underline underline-offset-2 hover:opacity-90">
            FAQ
          </Link>
          .
        </p>
      </section>
    </main>
  );
};

export const Legal: React.FC = () =>
  IS_RU_REGION ? <LegalRu /> : <LegalGlobal />;
