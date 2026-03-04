import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import {
  USE_MOCK_DASHBOARD,
  getMockRevenueSeries,
  mockProductBreakdown,
  type DashboardPeriodType,
} from '../../data/mocks';
import { supabase } from '../../lib/supabase';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

/** 상품·구성품 이미지 업로드용 Storage 버킷 (Supabase 대시보드에서 Public 버킷 생성) */
const BUCKET_PRODUCT_IMAGES = 'product-images';

/** 파일을 product-images 버킷에 업로드하고 공개 URL 반환. 실패 시 null */
async function uploadProductImage(file: File): Promise<string | null> {
  if (!supabase) return null;
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `products/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  const { error } = await supabase.storage.from(BUCKET_PRODUCT_IMAGES).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `image/${safeExt}`,
  });
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET_PRODUCT_IMAGES).getPublicUrl(path);
  return data.publicUrl;
}

/** 천 단위 콤마 (1,000 형식) */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

type Product = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  rrp_price: number | null;
  prp_price: number | null;
  is_active: boolean | null;
  stock?: number | null;
  detail_description?: string | null;
};

type ProductComponent = {
  id: string;
  product_id: string;
  sort_order: number;
  name: string | null;
  image_url: string | null;
  description: string | null;
};

type DashboardKpi = {
  totalRevenueCents: number;
  orderCount: number;
  products: { id: string; name: string; stock: number; viewCount: number }[];
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

  const [dashboardKpi, setDashboardKpi] = useState<DashboardKpi | null>(null);
  const [components, setComponents] = useState<ProductComponent[]>([]);

  /** 매출 그래프 기간: 일별 / 주별 / 월별 / 특정기간 */
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriodType>('day');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');

  const [error, setError] = useState<string | null>(null);

  /** 상품 대표 이미지 파일 선택용 (숨김 input 트리거) */
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  /** 구성품 이미지 파일 선택용 + 업로드 대상 인덱스 */
  const componentImageInputRef = useRef<HTMLInputElement>(null);
  const componentUploadIndexRef = useRef<number>(-1);
  /** 대표 이미지 업로드 중 여부 */
  const [uploadingMainImage, setUploadingMainImage] = useState(false);
  /** 업로드 중인 구성품 인덱스 (-1이면 없음) */
  const [uploadingComponentIndex, setUploadingComponentIndex] = useState<number>(-1);

  /** 목업 사용 시 기간별 매출 시계열 (그래프용) */
  const revenueChartData = useMemo(() => {
    if (!USE_MOCK_DASHBOARD) return [];
    return getMockRevenueSeries(
      dashboardPeriod,
      dashboardPeriod === 'range' ? rangeStart || undefined : undefined,
      dashboardPeriod === 'range' ? rangeEnd || undefined : undefined
    );
  }, [USE_MOCK_DASHBOARD, dashboardPeriod, rangeStart, rangeEnd]);

  useEffect(() => {
    if (!supabase || !isAdmin) return;

    const load = async () => {
      try {
        setError(null);
        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, category, description, image_url, rrp_price, prp_price, is_active, stock, detail_description')
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
        setError('관리자 데이터를 불러오지 못했습니다.');
        console.error(e);
      }
    };

    void load();
  }, [isAdmin]);

  // 대시보드 KPI: 매출, 주문 수, 상품별 재고·조회수
  useEffect(() => {
    if (!supabase || !isAdmin || tab !== 'dashboard') return;

    const loadKpi = async () => {
      try {
        const { data: orderData } = await supabase
          .from('orders')
          .select('total_cents');
        const totalRevenueCents = (orderData ?? []).reduce((s, o) => s + (o.total_cents ?? 0), 0);
        const orderCount = orderData?.length ?? 0;

        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, stock');
        const productIds = (prodData ?? []).map((p) => p.id);
        let viewCounts: Record<string, number> = {};
        if (productIds.length > 0) {
          const { data: viewData } = await supabase
            .from('product_views')
            .select('product_id');
          const countByProduct: Record<string, number> = {};
          (viewData ?? []).forEach((v: { product_id: string }) => {
            countByProduct[v.product_id] = (countByProduct[v.product_id] ?? 0) + 1;
          });
          viewCounts = countByProduct;
        }

        setDashboardKpi({
          totalRevenueCents,
          orderCount,
          products: (prodData ?? []).map((p) => ({
            id: p.id,
            name: p.name ?? '',
            stock: p.stock ?? 0,
            viewCount: viewCounts[p.id] ?? 0,
          })),
        });
      } catch {
        setDashboardKpi(null);
      }
    };

    void loadKpi();
  }, [isAdmin, tab]);

  // 선택된 상품의 구성품 로드
  useEffect(() => {
    if (!supabase || !selectedProduct?.id) {
      setComponents([]);
      return;
    }
    supabase
      .from('product_components')
      .select('id, product_id, sort_order, name, image_url, description')
      .eq('product_id', selectedProduct.id)
      .order('sort_order')
      .then(({ data }) => setComponents((data as ProductComponent[]) ?? []));
  }, [selectedProduct?.id]);

  if (!initialized) return null;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  const handleProductField = (key: keyof Product, value: string | number | null) => {
    setSelectedProduct((prev) => {
      if (!prev) return prev;
      if (key === 'rrp_price' || key === 'prp_price') {
        return { ...prev, [key]: value !== '' && value != null ? Number(value) : null } as Product;
      }
      if (key === 'stock') {
        return { ...prev, stock: value !== '' && value != null ? Number(value) : null } as Product;
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
        stock: selectedProduct.stock ?? 0,
        detail_description: selectedProduct.detail_description ?? null,
      };
      let productId = selectedProduct.id;
      if (selectedProduct.id) {
        const { error: upErr } = await supabase.from('products').update(payload).eq('id', selectedProduct.id);
        if (upErr) throw upErr;
      } else {
        const { data, error: insErr } = await supabase.from('products').insert(payload).select('id').single();
        if (insErr) throw insErr;
        productId = data.id;
        setSelectedProduct({ ...selectedProduct, id: data.id });
      }
      // 구성품 저장: 기존 삭제 후 일괄 삽입
      const compPayload = components.map((c, i) => ({
        product_id: productId,
        sort_order: i,
        name: c.name || null,
        image_url: c.image_url || null,
        description: c.description || null,
      }));
      await supabase.from('product_components').delete().eq('product_id', productId);
      if (compPayload.length > 0) {
        await supabase.from('product_components').insert(compPayload);
      }
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, category, description, image_url, rrp_price, prp_price, is_active, stock, detail_description')
        .order('name');
      if (prodData) setProducts(prodData as Product[]);
      const { data: compData } = await supabase
        .from('product_components')
        .select('id, product_id, sort_order, name, image_url, description')
        .eq('product_id', productId)
        .order('sort_order');
      if (compData) setComponents(compData as ProductComponent[]);
    } catch (e) {
      console.error(e);
      setError('상품 저장에 실패했습니다.');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleComponentChange = (index: number, patch: Partial<ProductComponent>) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  const handleComponentAdd = () => {
    if (!selectedProduct?.id) return;
    setComponents((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        product_id: selectedProduct.id,
        sort_order: prev.length,
        name: '',
        image_url: null,
        description: null,
      },
    ]);
  };

  const handleComponentRemove = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  /** 대표 이미지 파일 선택 시 업로드 후 URL 반영 */
  const onMainImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !selectedProduct) return;
    setUploadingMainImage(true);
    try {
      const url = await uploadProductImage(file);
      if (url) handleProductField('image_url', url);
    } finally {
      setUploadingMainImage(false);
    }
  };

  /** 구성품 이미지 파일 선택 시 업로드 후 해당 항목 URL 반영 */
  const onComponentImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const idx = componentUploadIndexRef.current;
    if (!file || idx < 0 || idx >= components.length) return;
    setUploadingComponentIndex(idx);
    try {
      const url = await uploadProductImage(file);
      if (url) handleComponentChange(idx, { image_url: url });
    } finally {
      setUploadingComponentIndex(-1);
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
      setError('메인 페이지 레이아웃 저장에 실패했습니다.');
    } finally {
      setSavingSlots(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          관리자
        </h1>
        <nav className="flex gap-2 rounded-full bg-slate-100 p-1 text-sm">
          <button
            type="button"
            onClick={() => setTab('dashboard')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'dashboard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            대시보드
          </button>
          <button
            type="button"
            onClick={() => setTab('products')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'products' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            상품
          </button>
          <button
            type="button"
            onClick={() => setTab('layout')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'layout' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            메인 편집
          </button>
        </nav>
      </header>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {tab === 'dashboard' && (
        <section className="space-y-6">
          <p className="text-sm text-slate-600">
            기간별 매출, 재고, 상품별 조회수
          </p>

          {/* KPI 카드: 매출 합계·주문 수 (실제 데이터 또는 목업 합계) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">매출</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                {USE_MOCK_DASHBOARD
                  ? formatNumber(revenueChartData.reduce((s, d) => s + d.revenue, 0)) + ' ₽'
                  : formatNumber((dashboardKpi?.totalRevenueCents ?? 0) / 100) + ' ₽'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {USE_MOCK_DASHBOARD ? '그래프 합계 (목업)' : '주문 합계'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">주문 수</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">{dashboardKpi?.orderCount ?? 0}</p>
              <p className="mt-0.5 text-xs text-slate-500">전체 주문</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">상품·조회</p>
              <p className="mt-1 text-sm text-slate-600">아래 테이블: 재고·조회수</p>
            </div>
          </div>

          {/* 매출 꺾은선 그래프: 기간 선택 + 차트 (목업 시에만 데이터 표시) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">기간별 매출</h3>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {(['day', 'week', 'month', 'range'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDashboardPeriod(p)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    dashboardPeriod === p ? 'bg-brand text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {p === 'day' && '일별'}
                  {p === 'week' && '주별'}
                  {p === 'month' && '월별'}
                  {p === 'range' && '기간 선택'}
                </button>
              ))}
              {dashboardPeriod === 'range' && (
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <input
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                    className={inputClass + ' max-w-[140px]'}
                  />
                  <span className="text-slate-400">—</span>
                  <input
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                    className={inputClass + ' max-w-[140px]'}
                  />
                </span>
              )}
            </div>
            {USE_MOCK_DASHBOARD && revenueChartData.length > 0 ? (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={revenueChartData} margin={{ top: 20, right: 20, left: 10, bottom: 20 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#64748b" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#64748b" tickFormatter={(v) => formatNumber(v) + ' ₽'} />
                    <Tooltip
                      formatter={(value: number) => [formatNumber(value) + ' ₽', '매출']}
                      labelFormatter={(label) => label}
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--color-brand, #0d9488)"
                      strokeWidth={2}
                      dot={{ r: 4, fill: 'var(--color-brand, #0d9488)' }}
                      name="매출"
                    >
                      <LabelList
                        dataKey="revenue"
                        position="top"
                        formatter={(v: number) => formatNumber(v)}
                        className="fill-slate-600"
                        style={{ fontSize: 11 }}
                      />
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-slate-400">선택한 기간에 데이터가 없습니다.</p>
            )}
          </div>

          {/* 상품별 매출 (목업) — 그래프 기간 내 어떤 상품이 팔렸는지 */}
          {USE_MOCK_DASHBOARD && mockProductBreakdown.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
                상품별 매출 (목업)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-4 py-2 text-left font-medium text-slate-700">상품</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-700">매출</th>
                      <th className="px-4 py-2 text-right font-medium text-slate-700">주문 수</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockProductBreakdown.map((row, i) => (
                      <tr key={i} className="border-b border-slate-50">
                        <td className="px-4 py-2 text-slate-800">{row.productName}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(row.revenue)} ₽</td>
                        <td className="px-4 py-2 text-right tabular-nums">{row.orderCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 기존: 재고·조회수 테이블 (실제 DB) */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
              상품별 재고·조회수
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-700">상품</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">재고</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">조회수</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboardKpi?.products ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="px-4 py-2 text-slate-800">{p.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.stock}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.viewCount}</td>
                    </tr>
                  ))}
                  {(!dashboardKpi?.products?.length) && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-slate-400">데이터 없음</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {tab === 'products' && (
        <section className="mt-4 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">상품 목록</h2>
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
                    stock: 0,
                    detail_description: null,
                  })
                }
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand"
              >
                새 상품
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
                          {formatNumber(Number(p.rrp_price ?? 0))} ₽
                        </span>
                        <span>{formatNumber(p.prp_price)} ₽</span>
                      </span>
                    ) : (
                      <span className="shrink-0 text-xs text-slate-700">
                        {formatNumber(Number(p.rrp_price ?? 0))} ₽
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
                <li className="px-2 py-4 text-xs text-slate-400">등록된 상품이 없습니다.</li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              {selectedProduct ? '상품 수정' : '상품을 선택하거나 새로 추가하세요'}
            </h2>
            {selectedProduct && (
              <div className="space-y-4 text-sm">
                <p className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                  아래 ① 썸네일·대표 이미지, ② 상세 설명, ③ 상세페이지 구성품 이미지를 입력하면 상품 상세 페이지에 그대로 반영됩니다. 이미지는 URL 입력 또는 「파일 올리기」로 올릴 수 있습니다.
                </p>
                <div>
                  <label className={labelClass}>상품명</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={selectedProduct.name}
                    onChange={(e) => handleProductField('name', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>카테고리</label>
                  <input
                    type="text"
                    className={inputClass}
                    value={selectedProduct.category ?? ''}
                    onChange={(e) => handleProductField('category', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>설명 (목록용 짧은 설명)</label>
                  <textarea
                    className={`${inputClass} min-h-[72px]`}
                    value={selectedProduct.description ?? ''}
                    onChange={(e) => handleProductField('description', e.target.value)}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>정가 (RRP), ₽</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={selectedProduct.rrp_price ?? ''}
                      onChange={(e) => handleProductField('rrp_price', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>할인가 (PRP), ₽</label>
                    <input
                      type="number"
                      className={inputClass}
                      value={selectedProduct.prp_price ?? ''}
                      onChange={(e) => handleProductField('prp_price', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>재고</label>
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={selectedProduct.stock ?? ''}
                    onChange={(e) => handleProductField('stock', e.target.value === '' ? null : e.target.value)}
                  />
                </div>

                {/* ① 썸네일·상세 페이지 대표 이미지 (1장) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <label className={`${labelClass} font-semibold text-slate-800`}>
                    ① 썸네일·상세 페이지 대표 이미지 (1장)
                  </label>
                  <p className="mb-2 text-xs text-slate-500">
                    쇼핑/상세 페이지에 쓰이는 대표 사진입니다. URL을 입력하거나 「파일 올리기」로 업로드하세요.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    ref={mainImageInputRef}
                    className="hidden"
                    onChange={onMainImageFileChange}
                  />
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="url"
                      className={inputClass}
                      value={selectedProduct.image_url ?? ''}
                      onChange={(e) => handleProductField('image_url', e.target.value || null)}
                      placeholder="https://... 또는 아래 버튼으로 업로드"
                    />
                    <button
                      type="button"
                      onClick={() => mainImageInputRef.current?.click()}
                      disabled={uploadingMainImage}
                      className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60"
                    >
                      {uploadingMainImage ? '업로드 중…' : '파일 올리기'}
                    </button>
                  </div>
                </div>

                {/* ② 상세 설명 (본문) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <label className={`${labelClass} font-semibold text-slate-800`}>
                    ② 상세 설명 (상품 페이지 본문)
                  </label>
                  <p className="mb-2 text-xs text-slate-500">
                    상품 상세 페이지 본문에 표시되는 HTML/텍스트입니다.
                  </p>
                  <textarea
                    className={`${inputClass} min-h-[100px]`}
                    value={selectedProduct.detail_description ?? ''}
                    onChange={(e) => handleProductField('detail_description', e.target.value)}
                    placeholder="상품 페이지에 표시되는 본문"
                  />
                </div>

                {/* ③ 상세 페이지 구성품 이미지 (최대 6개) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className={`${labelClass} font-semibold text-slate-800`}>
                      ③ 상세 페이지 구성품 이미지 (최대 6개)
                    </label>
                    <button
                      type="button"
                      onClick={handleComponentAdd}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand"
                    >
                      + 항목
                    </button>
                  </div>
                  <p className="mb-3 text-xs text-slate-500">
                    상세 페이지 하단 구성품 그리드에 들어갈 이름·이미지·설명입니다. 이미지는 URL 입력 또는 각 행의 「파일 올리기」로 넣을 수 있습니다.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    ref={componentImageInputRef}
                    className="hidden"
                    onChange={onComponentImageFileChange}
                  />
                  <div className="space-y-3">
                    {components.map((comp, idx) => (
                      <div key={comp.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500">항목 {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleComponentRemove(idx)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            삭제
                          </button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="이름"
                            value={comp.name ?? ''}
                            onChange={(e) => handleComponentChange(idx, { name: e.target.value })}
                          />
                          <input
                            type="text"
                            className={inputClass}
                            placeholder="이미지 URL 또는 파일 올리기"
                            value={comp.image_url ?? ''}
                            onChange={(e) => handleComponentChange(idx, { image_url: e.target.value || null })}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              componentUploadIndexRef.current = idx;
                              componentImageInputRef.current?.click();
                            }}
                            disabled={uploadingComponentIndex === idx}
                            className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60"
                          >
                            {uploadingComponentIndex === idx ? '업로드 중…' : '파일 올리기'}
                          </button>
                        </div>
                        <textarea
                          className={`${inputClass} mt-2 min-h-[60px]`}
                          placeholder="설명"
                          value={comp.description ?? ''}
                          onChange={(e) => handleComponentChange(idx, { description: e.target.value || null })}
                        />
                      </div>
                    ))}
                    {components.length === 0 && (
                      <p className="py-2 text-center text-xs text-slate-400">구성품을 추가하세요.</p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSaveProduct}
                  disabled={savingProduct}
                  className="mt-2 w-full rounded-full bg-brand py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
                >
                  {savingProduct ? '저장 중…' : '저장'}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'layout' && (
        <section className="mt-4 space-y-4">
          <p className="text-xs text-slate-500">
            메인 페이지 슬롯 5개. 드래그해서 순서를 바꿀 수 있습니다.
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
                  슬롯 {slot.slot_index + 1}
                </p>
                <div className="space-y-3">
                  <div>
                    <label className={labelClass}>제목</label>
                    <input
                      type="text"
                      className={inputClass}
                      value={slot.title}
                      onChange={(e) => handleSlotChange(slot.slot_index, { title: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>설명</label>
                    <textarea
                      className={`${inputClass} min-h-[64px]`}
                      value={slot.description}
                      onChange={(e) =>
                        handleSlotChange(slot.slot_index, { description: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className={labelClass}>상품 ID (선택)</label>
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
                    <label className={labelClass}>링크 (상품 없을 때)</label>
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
            {savingSlots ? '저장 중…' : '레이아웃 저장'}
          </button>
        </section>
      )}
    </main>
  );
};

