import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

type Product = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  rrp_price: number | null;
  prp_price: number | null;
  is_active: boolean | null;
};

type Slot = {
  id: number | null;
  slot_index: number;
  title: string;
  description: string;
  image_url: string | null;
  product_id: string | null;
  link_url: string;
};

const emptySlot = (index: number): Slot => ({
  id: null,
  slot_index: index,
  title: '',
  description: '',
  image_url: null,
  product_id: null,
  link_url: '',
});

export const Admin: React.FC = () => {
  const { isLoggedIn, initialized, isAdmin } = useAuth();
  const [tab, setTab] = useState<'dashboard' | 'products' | 'layout'>('dashboard');

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  const [slots, setSlots] = useState<Slot[]>([0, 1, 2, 3, 4].map(emptySlot));
  const [savingSlots, setSavingSlots] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !isAdmin) return;

    const load = async () => {
      try {
        setError(null);
        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, category, description, image_url, rrp_price, prp_price, is_active')
          .order('name');
        if (prodData) setProducts(prodData as Product[]);

        const { data: slotData } = await supabase
          .from('main_layout_slots')
          .select('id, slot_index, title, description, image_url, product_id, link_url')
          .order('slot_index');

        if (slotData && slotData.length > 0) {
          const filled = [0, 1, 2, 3, 4].map((i) => {
            const found = slotData.find((s) => s.slot_index === i);
            if (!found) return emptySlot(i);
            return {
              id: found.id,
              slot_index: found.slot_index,
              title: found.title ?? '',
              description: found.description ?? '',
              image_url: found.image_url ?? null,
              product_id: found.product_id ?? null,
              link_url: found.link_url ?? '',
            };
          });
          setSlots(filled);
        }
      } catch (e) {
        setError('Не удалось загрузить данные администратора.');
        console.error(e);
      }
    };

    void load();
  }, [isAdmin]);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const handleProductField = (key: keyof Product, value: string) => {
    setSelectedProduct((prev) => {
      if (!prev) return prev;
      if (key === 'rrp_price' || key === 'prp_price') {
        return { ...prev, [key]: value ? Number(value) : null } as Product;
      }
      return { ...prev, [key]: value } as Product;
    });
  };

  const handleSaveProduct = async () => {
    if (!supabase || !selectedProduct) return;
    setSavingProduct(true);
    setError(null);
    try {
      const payload = {
        name: selectedProduct.name,
        category: selectedProduct.category,
        description: selectedProduct.description,
        image_url: selectedProduct.image_url,
        rrp_price: selectedProduct.rrp_price,
        prp_price: selectedProduct.prp_price,
        is_active: selectedProduct.is_active ?? true,
      };
      if (selectedProduct.id) {
        const { error: upErr } = await supabase.from('products').update(payload).eq('id', selectedProduct.id);
        if (upErr) throw upErr;
      } else {
        const { data, error: insErr } = await supabase.from('products').insert(payload).select('id').single();
        if (insErr) throw insErr;
        selectedProduct.id = data.id;
      }
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, category, description, image_url, rrp_price, prp_price, is_active')
        .order('name');
      if (prodData) setProducts(prodData as Product[]);
    } catch (e) {
      console.error(e);
      setError('Не удалось сохранить товар.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSlotChange = (index: number, patch: Partial<Slot>) => {
    setSlots((prev) =>
      prev.map((s) => (s.slot_index === index ? { ...s, ...patch, slot_index: index } : s)),
    );
  };

  const handleSlotDrag = (from: number, to: number) => {
    setSlots((prev) => {
      const list = [...prev];
      const fromIdx = list.findIndex((s) => s.slot_index === from);
      const toIdx = list.findIndex((s) => s.slot_index === to);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      return list.map((s, i) => ({ ...s, slot_index: i }));
    });
  };

  const handleSaveSlots = async () => {
    if (!supabase) return;
    setSavingSlots(true);
    setError(null);
    try {
      const payload = slots.map((s) => ({
        id: s.id,
        slot_index: s.slot_index,
        title: s.title || null,
        description: s.description || null,
        image_url: s.image_url,
        product_id: s.product_id,
        link_url: s.link_url || null,
      }));
      const { error: upErr } = await supabase.rpc('upsert_main_layout_slots', {
        slots_json: payload,
      });
      if (upErr) throw upErr;
    } catch (e) {
      console.error(e);
      setError('Не удалось сохранить макет главной страницы.');
    } finally {
      setSavingSlots(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          Админ-панель
        </h1>
        <nav className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab('dashboard')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Обзор
          </button>
          <button
            type="button"
            onClick={() => setTab('products')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'products' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Товары
          </button>
          <button
            type="button"
            onClick={() => setTab('layout')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'layout' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            Главная страница
          </button>
        </nav>
      </header>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {tab === 'dashboard' && (
        <section className="space-y-4">
          <p className="text-sm text-slate-600">
            Здесь вы можете управлять товарами и блоками главной страницы SEMO beauty‑box.
          </p>
        </section>
      )}

      {tab === 'products' && (
        <section className="mt-4 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Товары</h2>
              <button
                type="button"
                onClick={() =>
                  setSelectedProduct({
                    id: '',
                    name: '',
                    category: '',
                    description: '',
                    image_url: null,
                    rrp_price: null,
                    prp_price: null,
                    is_active: true,
                  })
                }
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand"
              >
                Новый товар
              </button>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {products.map((p) => (
                <li
                  key={p.id}
                  className="cursor-pointer px-2 py-2 hover:bg-slate-50"
                  onClick={() => setSelectedProduct(p)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate">{p.name}</span>
                    {p.prp_price != null ? (
                      <span className="shrink-0 text-xs text-slate-700">
                        <span className="mr-1 line-through text-slate-400">
                          {p.rrp_price?.toFixed(0)} ₽
                        </span>
                        <span>{p.prp_price.toFixed(0)} ₽</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-700">
                        {p.rrp_price?.toFixed(0)} ₽
                      </span>
                    )}
                  </div>
                  {p.category && (
                    <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                      {p.category}
                    </p>
                  )}
                </li>
              ))}
              {products.length === 0 && (
                <li className="px-2 py-4 text-xs text-slate-400">Товары пока не добавлены.</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              {selectedProduct ? 'Редактировать товар' : 'Выберите товар или создайте новый'}
            </h2>
            {selectedProduct && (
              <div className="space-y-4 text-sm">
                <div>
                  <label className={labelClass}>Название</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={selectedProduct.name}
                    onChange={(e) => handleProductField('name', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Категория</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={selectedProduct.category ?? ''}
                    onChange={(e) => handleProductField('category', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Описание</label>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={selectedProduct.description ?? ''}
                    onChange={(e) => handleProductField('description', e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>Обычная цена (RRP), ₽</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={selectedProduct.rrp_price ?? ''}
                      onChange={(e) => handleProductField('rrp_price', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Цена со скидкой (PRP), ₽</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={selectedProduct.prp_price ?? ''}
                      onChange={(e) => handleProductField('prp_price', e.target.value)}
                    />
                  </div>
                </div>
                {/* TODO: 이미지 업로드는 이후 Storage 구조 보면서 추가 */}
                <button
                  type="button"
                  onClick={handleSaveProduct}
                  disabled={savingProduct}
                  className="mt-2 w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                >
                  {savingProduct ? 'Сохранение…' : 'Сохранить'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'layout' && (
        <section className="mt-4 space-y-4">
          <p className="text-xs text-slate-500">
            5 слотов главной страницы. Перетащите карточки, чтобы изменить порядок.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {slots.map((slot) => (
              <div
                key={slot.slot_index}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(slot.slot_index))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  handleSlotDrag(from, slot.slot_index);
                }}
                className="cursor-move rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm"
              >
                <p className="mb-2 text-xs font-semibold uppercase text-slate-400">
                  Слот {slot.slot_index + 1}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>Заголовок</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={slot.title}
                      onChange={(e) => handleSlotChange(slot.slot_index, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Описание</label>
                    <textarea
                      className={`${inputClass} min-h-[64px]`}
                      value={slot.description}
                      onChange={(e) =>
                        handleSlotChange(slot.slot_index, { description: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>ID товара (опционально)</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={slot.product_id ?? ''}
                      onChange={(e) =>
                        handleSlotChange(slot.slot_index, { product_id: e.target.value || null })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Ссылка (если не выбираете товар)</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={slot.link_url}
                      onChange={(e) => handleSlotChange(slot.slot_index, { link_url: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={handleSaveSlots}
            disabled={savingSlots}
            className="mt-2 w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60 md:w-auto md:px-6"
          >
            {savingSlots ? 'Сохранение…' : 'Сохранить макет'}
          </button>
        </section>
      )}
    </main>
  );
};

