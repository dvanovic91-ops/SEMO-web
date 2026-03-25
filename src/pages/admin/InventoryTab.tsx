import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

/* ─── 타입 ─── */
type SkuCategory = 'beauty' | 'fit' | 'hair';

type SkuItem = {
  id: string;
  name: string;
  display_name: string | null;
  description: string | null;
  image_url: string | null;
  current_stock: number;
  safety_stock: number;
  unit: string;
  is_active: boolean;
  memo: string | null;
  category: SkuCategory;
  created_at: string;
  updated_at: string;
};

type StockTx = {
  id: string;
  sku_id: string;
  type: 'inbound' | 'outbound' | 'adjust';
  qty: number;
  memo: string | null;
  order_id: string | null;
  created_at: string;
};

const BUCKET = 'promos'; // 기존 스토리지 버킷 재사용

const CATEGORIES: { key: SkuCategory; label: string }[] = [
  { key: 'beauty', label: '뷰티박스' },
  { key: 'fit', label: '핏박스' },
  { key: 'hair', label: '헤어박스' },
];

const inputClass =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand min-h-[44px] sm:min-h-0 sm:text-sm';

/* ─── 메인 컴포넌트 ─── */
export function InventoryTab() {
  const [allSkus, setAllSkus] = useState<SkuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<SkuCategory>('beauty');

  // 폼 상태
  const [editingSku, setEditingSku] = useState<Partial<SkuItem> | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // 입고/조정 모달
  const [txModal, setTxModal] = useState<{ sku: SkuItem; type: 'inbound' | 'adjust' } | null>(null);
  const [txQty, setTxQty] = useState('');
  const [txMemo, setTxMemo] = useState('');
  const [txSaving, setTxSaving] = useState(false);

  // 이력 보기
  const [txHistory, setTxHistory] = useState<{ sku: SkuItem; rows: StockTx[] } | null>(null);
  const [txHistoryLoading, setTxHistoryLoading] = useState(false);

  // 현재 카테고리 SKU 필터
  const skus = allSkus.filter((s) => s.category === category);

  /* ── 데이터 로드 ── */
  const loadSkus = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    const { data } = await supabase
      .from('sku_items')
      .select('*')
      .order('created_at', { ascending: false });
    setAllSkus((data as SkuItem[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadSkus(); }, [loadSkus]);

  /* ── 이미지 업로드 ── */
  const handleImageUpload = async (file: File) => {
    if (!supabase) return;
    setUploading(true);
    try {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
      const path = `sku/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || `image/${safeExt}`,
      });
      if (error) { window.alert(`업로드 실패: ${error.message}`); return; }
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setEditingSku((prev) => prev ? { ...prev, image_url: data.publicUrl } : prev);
    } finally {
      setUploading(false);
    }
  };

  /* ── SKU 저장 (생성/수정) ── */
  const handleSave = async () => {
    if (!supabase || !editingSku?.name?.trim()) {
      window.alert('SKU 이름을 입력하세요.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editingSku.name.trim(),
        display_name: editingSku.display_name?.trim() || null,
        description: editingSku.description?.trim() || null,
        image_url: editingSku.image_url || null,
        safety_stock: editingSku.safety_stock ?? 0,
        unit: editingSku.unit || 'ea',
        is_active: editingSku.is_active ?? true,
        memo: editingSku.memo || null,
        category: editingSku.category || category,
      };

      if (editingSku.id) {
        const { error } = await supabase.from('sku_items').update(payload).eq('id', editingSku.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('sku_items').insert({ ...payload, current_stock: 0 });
        if (error) throw error;
      }
      setEditingSku(null);
      await loadSkus();
    } catch (err) {
      window.alert('저장 실패: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  /* ── 입고/조정 처리 ── */
  const handleTxSubmit = async () => {
    if (!supabase || !txModal) return;
    const qty = parseInt(txQty, 10);
    if (isNaN(qty) || qty === 0) { window.alert('수량을 입력하세요.'); return; }
    setTxSaving(true);
    try {
      const finalQty = txModal.type === 'inbound' ? Math.abs(qty) : qty;
      const { error } = await supabase.from('stock_transactions').insert({
        sku_id: txModal.sku.id,
        type: txModal.type,
        qty: finalQty,
        memo: txMemo.trim() || null,
      });
      if (error) throw error;
      setTxModal(null);
      setTxQty('');
      setTxMemo('');
      await loadSkus();
    } catch (err) {
      window.alert('처리 실패: ' + (err as Error).message);
    } finally {
      setTxSaving(false);
    }
  };

  /* ── 이력 조회 ── */
  const loadHistory = async (sku: SkuItem) => {
    if (!supabase) return;
    setTxHistoryLoading(true);
    const { data } = await supabase
      .from('stock_transactions')
      .select('*')
      .eq('sku_id', sku.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setTxHistory({ sku, rows: (data as StockTx[]) ?? [] });
    setTxHistoryLoading(false);
  };

  /* ── SKU 삭제 ── */
  const handleDelete = async (sku: SkuItem) => {
    if (!supabase) return;
    if (!window.confirm(`"${sku.name}" SKU를 삭제합니까? 관련 입출고 이력도 함께 삭제됩니다.`)) return;
    await supabase.from('sku_items').delete().eq('id', sku.id);
    await loadSkus();
  };

  if (loading) return <p className="py-8 text-center text-sm text-slate-400">로딩 중…</p>;

  const catLabel = CATEGORIES.find((c) => c.key === category)?.label ?? '';

  return (
    <section className="space-y-6">
      {/* ── 카테고리 탭 ── */}
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
        {CATEGORIES.map((cat) => {
          const count = allSkus.filter((s) => s.category === cat.key).length;
          return (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                category === cat.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {cat.label}
              {count > 0 && <span className="ml-1.5 text-[10px] text-slate-400">({count})</span>}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{catLabel} SKU 재고 관리</h2>
          <p className="mt-1 text-xs text-slate-500">구성품(SKU) 단위로 재고를 관리합니다. 입고 시 수량을 등록하면 자동으로 반영됩니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditingSku({ name: '', display_name: null, description: null, image_url: null, safety_stock: 0, unit: 'ea', is_active: true, memo: null, category })}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90"
        >
          + SKU 등록
        </button>
      </div>

      {/* ── 재고 현황 대시보드 ── */}
      {skus.length > 0 && (() => {
        const activeSkus = skus.filter(s => s.is_active);
        if (activeSkus.length === 0) return null;
        const maxStock = Math.max(...activeSkus.map(s => s.current_stock), 1);
        return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">재고 현황</p>
            <div className="flex items-center gap-3 text-[10px] text-slate-500">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" /> 충분 (안전재고 x2 이상)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> 주의 (안전재고 ~ x2)</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-red-400" /> 부족 (안전재고 이하)</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {activeSkus.map((sku) => {
              const pct = Math.min(100, (sku.current_stock / maxStock) * 100);
              const danger = sku.safety_stock > 0 && sku.current_stock <= sku.safety_stock;
              const warn = !danger && sku.safety_stock > 0 && sku.current_stock <= sku.safety_stock * 2;
              return (
                <div key={sku.id} className="flex items-center gap-3">
                  {sku.image_url && (
                    <img src={sku.image_url} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="truncate font-medium text-slate-700">{sku.name}</span>
                      <span className={`shrink-0 font-semibold ${danger ? 'text-red-500' : warn ? 'text-amber-500' : 'text-emerald-600'}`}>
                        {sku.current_stock} {sku.unit}
                        {sku.safety_stock > 0 && <span className="font-normal text-slate-400"> / 안전재고 {sku.safety_stock}</span>}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all ${danger ? 'bg-red-400' : warn ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()
      }

      {/* ── SKU 목록 ── */}
      {skus.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{catLabel}에 등록된 SKU가 없습니다. 위 버튼으로 추가하세요.</p>
      ) : (
        <div className="space-y-3">
          {skus.map((sku) => (
            <div key={sku.id} className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-50">
                  {sku.image_url ? (
                    <img src={sku.image_url} alt={sku.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-300 text-xs">—</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{sku.name}</p>
                    {!sku.is_active && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">비활성</span>}
                  </div>
                  {sku.display_name && (
                    <p className="text-xs text-slate-600">상품명: {sku.display_name}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-500">
                    재고: <span className={`font-semibold ${sku.safety_stock > 0 && sku.current_stock <= sku.safety_stock ? 'text-red-500' : 'text-slate-800'}`}>{sku.current_stock}</span>
                    {sku.safety_stock > 0 && <> / 안전재고: {sku.safety_stock}</>}
                    {' '}({sku.unit})
                  </p>
                  {sku.description && <p className="mt-0.5 text-[11px] text-slate-500">{sku.description}</p>}
                  {sku.memo && <p className="mt-0.5 text-[11px] text-slate-400">메모: {sku.memo}</p>}
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row sm:gap-2">
                  <button type="button" onClick={() => setTxModal({ sku, type: 'inbound' })}
                    className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
                    + 입고
                  </button>
                  <button type="button" onClick={() => setTxModal({ sku, type: 'adjust' })}
                    className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100">
                    ± 조정
                  </button>
                  <button type="button" onClick={() => loadHistory(sku)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    이력
                  </button>
                  <button type="button" onClick={() => setEditingSku(sku)}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    수정
                  </button>
                  <button type="button" onClick={() => handleDelete(sku)}
                    className="rounded-full border border-red-200 bg-white px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50">
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SKU 등록/수정 모달 ── */}
      {editingSku && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">{editingSku.id ? 'SKU 수정' : 'SKU 등록'}</h3>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">카테고리 *</label>
                <select className={inputClass}
                  value={editingSku.category ?? category}
                  onChange={(e) => setEditingSku((p) => p ? { ...p, category: e.target.value as SkuCategory } : p)}>
                  {CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">SKU 이름 (내부 관리용) *</label>
                <input type="text" className={inputClass}
                  placeholder="예: RoundLab-Cleanser-300ml"
                  value={editingSku.name ?? ''}
                  onChange={(e) => setEditingSku((p) => p ? { ...p, name: e.target.value } : p)} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">상품명 (고객에게 보여지는 이름)</label>
                <input type="text" className={inputClass}
                  placeholder="예: Hikashi - Foam cleanser"
                  value={editingSku.display_name ?? ''}
                  onChange={(e) => setEditingSku((p) => p ? { ...p, display_name: e.target.value } : p)} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">제품 설명</label>
                <textarea className={inputClass} rows={2}
                  placeholder="예: 라운드랩 자작나무 수분 토너 300ml / 민감성 피부용"
                  value={editingSku.description ?? ''}
                  onChange={(e) => setEditingSku((p) => p ? { ...p, description: e.target.value } : p)} />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">제품 이미지</label>
                <div className="flex items-center gap-3">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); e.target.value = ''; }} />
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60">
                    {uploading ? '업로드 중…' : '이미지 선택'}
                  </button>
                  {editingSku.image_url && <img src={editingSku.image_url} alt="" className="h-12 w-12 rounded-lg object-cover" />}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">안전재고</label>
                  <input type="number" className={inputClass} min={0}
                    value={editingSku.safety_stock ?? 0}
                    onChange={(e) => setEditingSku((p) => p ? { ...p, safety_stock: parseInt(e.target.value) || 0 } : p)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">단위</label>
                  <select className={inputClass}
                    value={editingSku.unit ?? 'ea'}
                    onChange={(e) => setEditingSku((p) => p ? { ...p, unit: e.target.value } : p)}>
                    <option value="ea">ea (개)</option>
                    <option value="box">box (박스)</option>
                    <option value="ml">ml</option>
                    <option value="g">g</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">메모</label>
                <input type="text" className={inputClass} placeholder="관리용 메모 (선택)"
                  value={editingSku.memo ?? ''}
                  onChange={(e) => setEditingSku((p) => p ? { ...p, memo: e.target.value } : p)} />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={editingSku.is_active ?? true}
                  onChange={(e) => setEditingSku((p) => p ? { ...p, is_active: e.target.checked } : p)} />
                활성 (비활성 시 드롭다운에서 숨김)
              </label>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={handleSave} disabled={saving}
                className="flex-1 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60">
                {saving ? '저장 중…' : '저장'}
              </button>
              <button type="button" onClick={() => setEditingSku(null)}
                className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 입고/조정 모달 ── */}
      {txModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-semibold text-slate-900">
              {txModal.type === 'inbound' ? '입고 등록' : '재고 조정'}
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              {txModal.sku.name} — 현재 재고: {txModal.sku.current_stock} {txModal.sku.unit}
            </p>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">
                  {txModal.type === 'inbound' ? '입고 수량' : '조정 수량 (- 는 감소)'}
                </label>
                <input type="number" className={inputClass}
                  placeholder={txModal.type === 'inbound' ? '100' : '-5 또는 +10'}
                  value={txQty} onChange={(e) => setTxQty(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">메모</label>
                <input type="text" className={inputClass}
                  placeholder={txModal.type === 'inbound' ? '예: 3월 25일 CJ 입고' : '예: 파손 2개'}
                  value={txMemo} onChange={(e) => setTxMemo(e.target.value)} />
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button type="button" onClick={handleTxSubmit} disabled={txSaving}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${
                  txModal.type === 'inbound' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}>
                {txSaving ? '처리 중…' : txModal.type === 'inbound' ? '입고 확인' : '조정 확인'}
              </button>
              <button type="button" onClick={() => { setTxModal(null); setTxQty(''); setTxMemo(''); }}
                className="rounded-full border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 이력 모달 ── */}
      {txHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">{txHistory.sku.name} — 입출고 이력</h3>
              <button type="button" onClick={() => setTxHistory(null)} className="text-xs text-slate-400 hover:text-slate-600">닫기</button>
            </div>
            {txHistoryLoading ? (
              <p className="py-4 text-center text-sm text-slate-400">로딩 중…</p>
            ) : txHistory.rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">이력이 없습니다.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="pb-2 font-medium">일시</th>
                    <th className="pb-2 font-medium">유형</th>
                    <th className="pb-2 text-right font-medium">수량</th>
                    <th className="pb-2 font-medium">메모</th>
                  </tr>
                </thead>
                <tbody>
                  {txHistory.rows.map((tx) => (
                    <tr key={tx.id} className="border-b border-slate-100">
                      <td className="py-2 text-slate-600">
                        {new Date(tx.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2">
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          tx.type === 'inbound' ? 'bg-emerald-50 text-emerald-700' :
                          tx.type === 'outbound' ? 'bg-blue-50 text-blue-700' :
                          'bg-amber-50 text-amber-700'
                        }`}>
                          {tx.type === 'inbound' ? '입고' : tx.type === 'outbound' ? '출고' : '조정'}
                        </span>
                      </td>
                      <td className={`py-2 text-right font-semibold ${tx.qty > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {tx.qty > 0 ? '+' : ''}{tx.qty}
                      </td>
                      <td className="py-2 text-slate-500">{tx.memo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
