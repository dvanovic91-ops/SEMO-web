import React, { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { supabase } from '../../lib/supabase';
import { BOX_BUILDER_ADMIN_SLOTS } from '../../lib/buildBoxCatalog';
import { formatSkinApiNetworkError, getSkinApiBaseUrl, skinApiHeaders } from '../../lib/skinApiBaseUrl';

const SKIN_API_KEY_CONFIGURED = Boolean(import.meta.env.VITE_SKIN_API_KEY?.trim());

const VALID_SLOTS = new Set(BOX_BUILDER_ADMIN_SLOTS);

const SLOT_TO_PRODUCT_TYPE: Record<string, string> = {
  cleanser:  '클렌저',
  toner:     '토너',
  serum:     '세럼',
  ampoule:   '앰플',
  cream:     '크림',
  sunscreen: '선크림',
  premium:   '기타',
};

const BOX_TAG_LABEL: Record<string, { ru: string; en: string }> = {
  hydrating:    { ru: 'Увлажнение',        en: 'Hydrating' },
  soothing:     { ru: 'Успокоение',         en: 'Soothing' },
  brightening:  { ru: 'Осветление',         en: 'Brightening' },
  anti_aging:   { ru: 'Антивозрастной',    en: 'Anti-aging' },
  oil_control:  { ru: 'Контроль жирности', en: 'Oil control' },
  barrier:      { ru: 'Барьер',             en: 'Barrier' },
  exfoliating:  { ru: 'Отшелушивание',     en: 'Exfoliating' },
  antioxidant:  { ru: 'Антиоксидант',      en: 'Antioxidant' },
  firming:      { ru: 'Упругость',          en: 'Firming' },
  acne:         { ru: 'Против акне',        en: 'Acne care' },
  uv_protection:{ ru: 'SPF защита',         en: 'SPF protection' },
};

function buildBoxTagFromSummary(summary: Record<string, number>): { ru: string; en: string } {
  const top2 = Object.entries(summary)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([t]) => t);
  return {
    ru: top2.map((t) => BOX_TAG_LABEL[t]?.ru ?? t).join(' · '),
    en: top2.map((t) => BOX_TAG_LABEL[t]?.en ?? t).join(' · '),
  };
}

const COLUMNS = [
  { key: 'brand',                  label: '브랜드',              required: true  },
  { key: 'name',                   label: '영문명(SKU)',          required: true  },
  { key: 'volume_label',           label: '용량',                 required: true  },
  { key: 'box_builder_slot',       label: '슬롯',                 required: true  },
  { key: 'display_name',           label: '표시명(한국어)',       required: false },
  { key: 'name_en',                label: '영문 표시명',          required: false },
  { key: 'description_ru',         label: '러시아어 설명',        required: false },
  { key: 'image_url',              label: '이미지 URL',           required: false },
  { key: 'box_builder_sort_order', label: '정렬순서',             required: false },
  { key: 'box_builder_tag_ru',     label: '태그(RU)',             required: false },
  { key: 'box_builder_tag_en',     label: '태그(EN)',             required: false },
  { key: 'is_active',              label: '활성화',               required: false },
  { key: 'ingredients',            label: '성분 (쉼표 구분)',     required: false },
] as const;

const TEMPLATE_EXAMPLE = [
  {
    brand: "S'NATURE",
    name: 'Amino Acid Foam Cleanser',
    volume_label: '150ml',
    box_builder_slot: 'cleanser',
    display_name: '아미노산 폼 클렌저',
    name_en: 'Amino Acid Foam Cleanser',
    description_ru: 'Пенка с аминокислотами для мягкого очищения',
    image_url: 'https://example.com/image.jpg',
    box_builder_sort_order: 1,
    box_builder_tag_ru: 'Мягкое очищение · Все типы',
    box_builder_tag_en: 'Gentle · All skin types',
    is_active: true,
    ingredients: '정제수, 글리세린, 라우로일아스파르트산나트륨, 판테놀, 알란토인',
  },
  {
    brand: 'COSRX',
    name: 'AHA/BHA Clarifying Treatment Toner',
    volume_label: '150ml',
    box_builder_slot: 'toner',
    display_name: 'AHA/BHA 토너',
    name_en: 'AHA/BHA Clarifying Treatment Toner',
    description_ru: 'Тонер с кислотами для отшелушивания',
    image_url: '',
    box_builder_sort_order: 1,
    box_builder_tag_ru: 'Отшелушивание · Жирная',
    box_builder_tag_en: 'Exfoliating · Oily',
    is_active: true,
    ingredients: 'Water, Glycolic Acid, Niacinamide, Sodium Hydroxide, 1,2-Hexanediol',
  },
];

type ParsedRow = {
  brand: string;
  name: string;
  volume_label: string;
  display_name: string | null;
  name_en: string | null;
  description_ru: string | null;
  image_url: string | null;
  box_builder_slot: string;
  box_builder_sort_order: number;
  box_builder_tag_ru: string;
  box_builder_tag_en: string;
  is_active: boolean;
  ingredients_json: { name: string; position: number }[] | null;
  ingredients_status: 'pending' | 'done';
};

function str(v: unknown): string {
  return v != null ? String(v).trim() : '';
}

type SkuSheetRow = Record<string, unknown>;

function ingredientsJsonToCell(raw: unknown): string {
  if (!raw) return '';
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw) as unknown;
    } catch {
      return raw.trim();
    }
  }
  if (!Array.isArray(list)) return '';
  return list
    .slice()
    .sort((a, b) => Number((a as { position?: number }).position ?? 0) - Number((b as { position?: number }).position ?? 0))
    .map((item) => String((item as { name?: string }).name ?? '').trim())
    .filter(Boolean)
    .join(', ');
}

async function buildSkuWorkbookBuffer(dataRows: SkuSheetRow[], emptyTrailingRows: number): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SEMO Admin';
  const ws = wb.addWorksheet('SKU', { views: [{ state: 'frozen', ySplit: 2 }] });

  const headerRow = ws.addRow(COLUMNS.map((c) => c.key));
  const labelRow = ws.addRow(COLUMNS.map((c) => `${c.label}${c.required ? ' ★필수' : ''}`));

  COLUMNS.forEach((col, i) => {
    const colNum = i + 1;
    ws.getColumn(colNum).width = Math.max(col.key.length + 6, 22);

    const headerCell = headerRow.getCell(colNum);
    const labelCell = labelRow.getCell(colNum);

    if (col.required) {
      const fill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE07B00' } };
      const font: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      headerCell.fill = fill;
      headerCell.font = font;
      labelCell.fill = fill;
      labelCell.font = font;
    } else {
      const fill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F7' } };
      const font: Partial<ExcelJS.Font> = { bold: false, color: { argb: 'FF1E3A5F' }, size: 11 };
      headerCell.fill = fill;
      headerCell.font = font;
      labelCell.fill = fill;
      labelCell.font = font;
    }

    const border: Partial<ExcelJS.Borders> = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
    headerCell.border = border;
    labelCell.border = border;
    headerCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  headerRow.height = 22;
  labelRow.height = 22;

  const slotColIdx = COLUMNS.findIndex((c) => c.key === 'box_builder_slot') + 1;
  const slotFormula = `"${BOX_BUILDER_ADMIN_SLOTS.join(',')}"`;

  const addSlotValidation = (row: ExcelJS.Row, required: boolean) => {
    const slotCell = row.getCell(slotColIdx);
    slotCell.dataValidation = {
      type: 'list',
      allowBlank: !required,
      formulae: [slotFormula],
      showErrorMessage: required,
      errorTitle: '유효하지 않은 슬롯',
      error: `허용 슬롯: ${BOX_BUILDER_ADMIN_SLOTS.join(', ')}`,
    };
  };

  dataRows.forEach((row, rowIdx) => {
    const dataRow = ws.addRow(COLUMNS.map((c) => row[c.key] ?? ''));
    dataRow.height = 18;
    if (rowIdx % 2 === 1) {
      dataRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }
    addSlotValidation(dataRow, true);
  });

  for (let i = 0; i < emptyTrailingRows; i++) {
    const emptyRow = ws.addRow([]);
    emptyRow.height = 18;
    addSlotValidation(emptyRow, false);
  }

  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

function triggerXlsxDownload(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type SkuDbExportRow = {
  brand: string;
  name: string;
  volume_label: string | null;
  box_builder_slot: string | null;
  display_name: string | null;
  name_en: string | null;
  description_ru: string | null;
  image_url: string | null;
  box_builder_sort_order: number | null;
  box_builder_tag_ru: string | null;
  box_builder_tag_en: string | null;
  is_active: boolean | null;
  ingredients_json: unknown;
};

function skuDbRowToSheetRow(row: SkuDbExportRow): SkuSheetRow {
  return {
    brand: row.brand ?? '',
    name: row.name ?? '',
    volume_label: row.volume_label ?? '',
    box_builder_slot: row.box_builder_slot ?? '',
    display_name: row.display_name ?? '',
    name_en: row.name_en ?? '',
    description_ru: row.description_ru ?? '',
    image_url: row.image_url ?? '',
    box_builder_sort_order: row.box_builder_sort_order ?? 0,
    box_builder_tag_ru: row.box_builder_tag_ru ?? '',
    box_builder_tag_en: row.box_builder_tag_en ?? '',
    is_active: row.is_active !== false,
    ingredients: ingredientsJsonToCell(row.ingredients_json),
  };
}

export function SkuBulkImport({ onDone }: { onDone?: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [resultMsg, setResultMsg] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState('');

  // 일괄 성분 수집
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'done'>('idle');
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [batchErrorMsg, setBatchErrorMsg] = useState('');
  const [batchErrorSamples, setBatchErrorSamples] = useState<string[]>([]);
  const [batchCurrentSku, setBatchCurrentSku] = useState('');
  const [skinApiHealth, setSkinApiHealth] = useState<'checking' | 'ok' | 'offline' | 'auth_fail'>('checking');
  const [skinApiGemini, setSkinApiGemini] = useState<boolean | null>(null);

  const skinApiUrl = getSkinApiBaseUrl();

  const loadPendingCount = async () => {
    if (!supabase) return;
    const { count } = await supabase
      .from('sku_items')
      .select('id', { count: 'exact', head: true })
      .eq('ingredients_status', 'pending');
    setPendingCount(count ?? 0);
  };

  useEffect(() => { void loadPendingCount(); }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const healthRes = await fetch(`${skinApiUrl}/health`, { method: 'GET' });
        if (cancelled) return;
        if (!healthRes.ok) {
          setSkinApiHealth('offline');
          return;
        }
        const healthJson = (await healthRes.json().catch(() => ({}))) as { gemini_configured?: boolean };
        setSkinApiGemini(typeof healthJson.gemini_configured === 'boolean' ? healthJson.gemini_configured : null);

        // /health 는 GET만 — 인증·연결 확인은 가벼운 POST (성분 파싱까지 기다리지 않음)
        const probeRes = await fetch(`${skinApiUrl}/parse-ingredients-text`, {
          method: 'POST',
          headers: skinApiHeaders,
          body: JSON.stringify({ raw_text: '', preview_only: true }),
        });
        if (cancelled) return;
        const probeJson = (await probeRes.json().catch(() => ({}))) as { success?: boolean; error?: string };
        if (probeRes.status === 401 || probeJson.error === 'Unauthorized') {
          setSkinApiHealth('auth_fail');
          return;
        }
        // 400(raw_text 필수) = 서버·인증 OK / 네트워크만 살아 있어도 ok
        if (probeRes.status === 400 || healthRes.ok) {
          setSkinApiHealth('ok');
          return;
        }
        setSkinApiHealth('offline');
      } catch {
        if (!cancelled) setSkinApiHealth('offline');
      }
    })();
    return () => { cancelled = true; };
  }, [skinApiUrl]);

  const handleBatchFetch = async () => {
    if (!supabase || batchStatus === 'running') return;
    setBatchStatus('running');
    setBatchProgress({ done: 0, total: 0, errors: 0 });
    setBatchErrorMsg('');
    setBatchErrorSamples([]);
    setBatchCurrentSku('');

    if (!SKIN_API_KEY_CONFIGURED) {
      setBatchStatus('done');
      setBatchErrorMsg(
        'VITE_SKIN_API_KEY가 비어 있습니다. 웹사이트/.env에 Flask SKIN_API_KEY와 동일한 값을 넣고 npm run dev 를 재시작하세요.',
      );
      return;
    }

    if (skinApiHealth === 'auth_fail') {
      setBatchStatus('done');
      setBatchErrorMsg(
        'API 인증 실패(401). .env의 VITE_SKIN_API_KEY가 Flask 서버 SKIN_API_KEY와 일치하는지 확인하세요.',
      );
      return;
    }

    const { data } = await supabase
      .from('sku_items')
      .select('id, name, display_name, brand, name_en, box_builder_slot, ingredients_json')
      .eq('ingredients_status', 'pending');

    const skus = data ?? [];
    setBatchProgress({ done: 0, total: skus.length, errors: 0 });

    let errors = 0;
    const errorSamples: string[] = [];
    let authErrorMsg = '';
    const apiBase = getSkinApiBaseUrl();

    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i] as {
        id: string;
        name: string;
        display_name: string | null;
        brand: string | null;
        name_en: string | null;
        box_builder_slot: string | null;
        ingredients_json: { name: string; position: number }[] | null;
      };

      const productType = SLOT_TO_PRODUCT_TYPE[sku.box_builder_slot ?? ''] ?? null;
      const skuLabel = `${sku.brand ?? '?'} · ${sku.name_en ?? sku.display_name ?? sku.name}`;

      setBatchCurrentSku(skuLabel);

      try {
        const hasIngredients = Array.isArray(sku.ingredients_json) && sku.ingredients_json.length > 0;

        let benefitSummary: Record<string, number> | null = null;
        const endpoint = hasIngredients ? '/parse-ingredients-text' : '/fetch-ingredients';
        const body = hasIngredients
          ? {
              sku_id: sku.id,
              raw_text: sku.ingredients_json!
                .sort((a, b) => a.position - b.position)
                .map((ing) => ing.name)
                .join(', '),
              product_name: sku.name_en?.trim() || sku.name,
              brand: sku.brand ?? '',
              name_en: sku.name_en ?? '',
              product_type: productType,
            }
          : {
              sku_id: sku.id,
              product_name: sku.name_en?.trim() || sku.name,
              brand: sku.brand ?? '',
              name_en: sku.name_en ?? '',
              product_type: productType,
            };

        const res = await fetch(`${apiBase}${endpoint}`, {
          method: 'POST',
          headers: skinApiHeaders,
          body: JSON.stringify(body),
        });

        let json: { success?: boolean; error?: string; benefit_summary?: Record<string, number> };
        try {
          json = (await res.json()) as typeof json;
        } catch {
          errors++;
          if (errorSamples.length < 5) {
            errorSamples.push(`${skuLabel}: 응답 파싱 실패 (HTTP ${res.status})`);
          }
          setBatchProgress({ done: i + 1, total: skus.length, errors });
          continue;
        }

        if (!res.ok || !json.success) {
          errors++;
          const detail = json.error ?? `HTTP ${res.status}`;
          if (errorSamples.length < 5) {
            errorSamples.push(`${skuLabel}: ${detail}`);
          }
          if (res.status === 401 && !authErrorMsg) {
            authErrorMsg =
              'API 인증 실패(401 Unauthorized). VITE_SKIN_API_KEY ↔ Flask SKIN_API_KEY 일치 여부와 npm run dev 재시작을 확인하세요.';
          }
        } else {
          benefitSummary = json.benefit_summary ?? null;
          void benefitSummary; // Flask가 Gemini 태그·baumann_types를 DB에 직접 저장하므로 프론트에서 별도 저장 불필요
        }
      } catch (e) {
        errors++;
        if (errorSamples.length < 5) {
          errorSamples.push(`${skuLabel}: ${formatSkinApiNetworkError(e, apiBase)}`);
        }
      }
      setBatchProgress({ done: i + 1, total: skus.length, errors });
      setBatchErrorSamples([...errorSamples]);
    }

    setBatchStatus('done');
    setBatchCurrentSku('');
    if (authErrorMsg) {
      setBatchErrorMsg(authErrorMsg);
    } else if (errors > 0 && errorSamples.length > 0) {
      setBatchErrorMsg(errorSamples[0]);
    }
    await loadPendingCount();
  };

  const handleForceRefetchAll = async () => {
    if (!supabase || batchStatus === 'running') return;
    if (!window.confirm('박스빌더 SKU 전체를 강제로 재수집합니다. 기존 성분·태그 데이터를 덮어씁니다. 계속하시겠습니까?')) return;

    setBatchStatus('running');
    setBatchProgress({ done: 0, total: 0, errors: 0 });
    setBatchErrorMsg('');
    setBatchErrorSamples([]);
    setBatchCurrentSku('');

    if (!SKIN_API_KEY_CONFIGURED) {
      setBatchStatus('done');
      setBatchErrorMsg('VITE_SKIN_API_KEY가 비어 있습니다. 웹사이트/.env에 Flask SKIN_API_KEY와 동일한 값을 넣고 npm run dev를 재시작하세요.');
      return;
    }

    if (skinApiHealth === 'auth_fail') {
      setBatchStatus('done');
      setBatchErrorMsg('API 인증 실패(401). .env의 VITE_SKIN_API_KEY가 Flask 서버 SKIN_API_KEY와 일치하는지 확인하세요.');
      return;
    }

    const { data } = await supabase
      .from('sku_items')
      .select('id, name, display_name, brand, name_en, box_builder_slot, ingredients_json')
      .not('box_builder_slot', 'is', null);

    const skus = data ?? [];
    setBatchProgress({ done: 0, total: skus.length, errors: 0 });

    let errors = 0;
    const errorSamples: string[] = [];
    let authErrorMsg = '';
    const apiBase = getSkinApiBaseUrl();

    for (let i = 0; i < skus.length; i++) {
      const sku = skus[i] as {
        id: string;
        name: string;
        display_name: string | null;
        brand: string | null;
        name_en: string | null;
        box_builder_slot: string | null;
        ingredients_json: { name: string; position: number }[] | null;
      };

      const productType = SLOT_TO_PRODUCT_TYPE[sku.box_builder_slot ?? ''] ?? null;
      const skuLabel = `${sku.brand ?? '?'} · ${sku.name_en ?? sku.display_name ?? sku.name}`;
      setBatchCurrentSku(skuLabel);

      try {
        const hasIngredients = Array.isArray(sku.ingredients_json) && sku.ingredients_json.length > 0;
        const endpoint = hasIngredients ? '/parse-ingredients-text' : '/fetch-ingredients';
        const body = hasIngredients
          ? {
              sku_id: sku.id,
              raw_text: sku.ingredients_json!
                .sort((a, b) => a.position - b.position)
                .map((ing) => ing.name)
                .join(', '),
              product_name: sku.name_en?.trim() || sku.name,
              brand: sku.brand ?? '',
              name_en: sku.name_en ?? '',
              product_type: productType,
            }
          : {
              sku_id: sku.id,
              product_name: sku.name_en?.trim() || sku.name,
              brand: sku.brand ?? '',
              name_en: sku.name_en ?? '',
              product_type: productType,
            };

        const res = await fetch(`${apiBase}${endpoint}`, {
          method: 'POST',
          headers: skinApiHeaders,
          body: JSON.stringify(body),
        });

        let json: { success?: boolean; error?: string; benefit_summary?: Record<string, number> };
        try {
          json = (await res.json()) as typeof json;
        } catch {
          errors++;
          if (errorSamples.length < 5) errorSamples.push(`${skuLabel}: 응답 파싱 실패 (HTTP ${res.status})`);
          setBatchProgress({ done: i + 1, total: skus.length, errors });
          continue;
        }

        if (!res.ok || !json.success) {
          errors++;
          const detail = json.error ?? `HTTP ${res.status}`;
          if (errorSamples.length < 5) errorSamples.push(`${skuLabel}: ${detail}`);
          if (res.status === 401 && !authErrorMsg) {
            authErrorMsg = 'API 인증 실패(401 Unauthorized). VITE_SKIN_API_KEY ↔ Flask SKIN_API_KEY 일치 여부와 npm run dev 재시작을 확인하세요.';
          }
        }
        // Flask가 Gemini 태그·baumann_types를 DB에 직접 저장하므로 프론트에서 별도 저장 불필요
      } catch (e) {
        errors++;
        if (errorSamples.length < 5) errorSamples.push(`${skuLabel}: ${formatSkinApiNetworkError(e, apiBase)}`);
      }
      setBatchProgress({ done: i + 1, total: skus.length, errors });
      setBatchErrorSamples([...errorSamples]);
    }

    setBatchStatus('done');
    setBatchCurrentSku('');
    if (authErrorMsg) {
      setBatchErrorMsg(authErrorMsg);
    } else if (errors > 0 && errorSamples.length > 0) {
      setBatchErrorMsg(errorSamples[0]);
    }
    await loadPendingCount();
  };

  const downloadTemplate = async () => {
    const buffer = await buildSkuWorkbookBuffer(TEMPLATE_EXAMPLE as SkuSheetRow[], 8);
    triggerXlsxDownload(buffer, 'sku_import_template.xlsx');
  };

  const downloadCurrentSkus = async () => {
    if (!supabase) return;
    setExportLoading(true);
    setExportError('');
    try {
      const { data, error } = await supabase
        .from('sku_items')
        .select(
          'brand, name, volume_label, box_builder_slot, display_name, name_en, description_ru, image_url, box_builder_sort_order, box_builder_tag_ru, box_builder_tag_en, is_active, ingredients_json',
        )
        .order('box_builder_slot', { ascending: true })
        .order('box_builder_sort_order', { ascending: true })
        .order('brand', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;

      const rows = ((data ?? []) as SkuDbExportRow[]).map(skuDbRowToSheetRow);
      const stamp = new Date().toISOString().slice(0, 10);
      const buffer = await buildSkuWorkbookBuffer(rows, 3);
      triggerXlsxDownload(buffer, `sku_export_${stamp}.xlsx`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : '다운로드 실패');
    } finally {
      setExportLoading(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview([]);
    setParseErrors([]);
    setStatus('idle');
    setResultMsg('');

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        const errs: string[] = [];
        const parsed: ParsedRow[] = [];

        raw.forEach((r, idx) => {
          const rowLabel = `행 ${idx + 2}`;
          const brand = str(r['brand']);
          const name = str(r['name']);
          const volumeLabel = str(r['volume_label']);
          const slot = str(r['box_builder_slot']).toLowerCase();

          // 템플릿 라벨 행 건너뜀 (예: '브랜드 ★필수', '슬롯 ★필수')
          if (brand.includes('★') || name.includes('★')) return;

          if (!brand) errs.push(`${rowLabel}: brand 필수`);
          if (!name) errs.push(`${rowLabel}: name 필수`);
          if (!volumeLabel) errs.push(`${rowLabel}: volume_label(용량) 필수`);
          if (!slot) {
            errs.push(`${rowLabel}: box_builder_slot 필수`);
          } else if (!VALID_SLOTS.has(slot as never)) {
            errs.push(`${rowLabel}: 알 수 없는 슬롯 "${slot}" (유효: ${BOX_BUILDER_ADMIN_SLOTS.join(', ')})`);
          }

          if (brand && name && volumeLabel && VALID_SLOTS.has(slot as never)) {
            const isActive = r['is_active'];
            const ingredientsRaw = str(r['ingredients']);
            const ingredientsJson = ingredientsRaw
              ? ingredientsRaw
                  // `,(?!\s*\d-)` — "1,2-헥산다이올" 같은 숫자-대시 INCI명은 쪼개지 않음
                  .split(/,(?!\s*\d-)/)
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((name, i) => ({ name, position: i + 1 }))
              : null;
            parsed.push({
              brand,
              name,
              volume_label: volumeLabel,
              display_name: str(r['display_name']) || null,
              name_en: str(r['name_en']) || null,
              description_ru: str(r['description_ru']) || null,
              image_url: str(r['image_url']) || null,
              box_builder_slot: slot,
              box_builder_sort_order: r['box_builder_sort_order'] ? Number(r['box_builder_sort_order']) : 0,
              box_builder_tag_ru: str(r['box_builder_tag_ru']) || '',
              box_builder_tag_en: str(r['box_builder_tag_en']) || '',
              is_active: isActive !== false && isActive !== 'FALSE' && isActive !== 0,
              ingredients_json: ingredientsJson,
              ingredients_status: ingredientsJson ? 'done' : 'pending',
            });
          }
        });

        setParseErrors(errs);
        setPreview(parsed);
      } catch {
        setParseErrors(['파일 파싱 오류. xlsx 형식인지 확인해주세요.']);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleUpload = async () => {
    if (!supabase || !preview.length) return;
    setStatus('uploading');
    setResultMsg('');

    try {
      const { data: existingRows, error: fetchError } = await supabase
        .from('sku_items')
        .select('brand, name, ingredients_json, ingredients_status');
      if (fetchError) throw fetchError;

      const existingMap = new Map(
        (existingRows ?? []).map((row) => [`${row.brand}\0${row.name}`, row]),
      );

      const payload = preview.map((row) => {
        if (row.ingredients_json?.length) return row;
        const existing = existingMap.get(`${row.brand}\0${row.name}`);
        if (!existing) return row;
        return {
          ...row,
          ingredients_json: existing.ingredients_json ?? null,
          ingredients_status: existing.ingredients_status ?? row.ingredients_status,
        };
      });

      const { error } = await supabase
        .from('sku_items')
        .upsert(payload, { onConflict: 'brand,name' });
      if (error) {
        const msg = error.message ?? error.details ?? error.hint ?? JSON.stringify(error);
        throw new Error(`[${error.code}] ${msg}`);
      }

      setStatus('done');
      setResultMsg(`${payload.length}개 SKU 등록/업데이트 완료`);
      setPreview([]);
      if (fileRef.current) fileRef.current.value = '';
      void loadPendingCount();
      onDone?.();
    } catch (e) {
      setStatus('error');
      const msg = e instanceof Error ? e.message
        : (e != null && typeof e === 'object' && 'message' in e)
          ? String((e as { message: unknown }).message)
          : JSON.stringify(e);
      setResultMsg('오류: ' + msg);
    }
  };

  const reset = () => {
    setPreview([]);
    setParseErrors([]);
    setStatus('idle');
    setResultMsg('');
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-slate-800">SKU 일괄 등록</h3>
          <p className="mt-0.5 text-xs text-slate-400">
            현재 SKU를 다운로드 → 수정 → 재업로드하면 brand+name 기준으로 반영됩니다. 신규 등록은 빈 템플릿을 사용하세요.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            성분(ingredients) 칸을 비워 두면 기존 성분 데이터는 유지됩니다.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => void downloadCurrentSkus()}
            disabled={exportLoading}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand/90 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {exportLoading ? '다운로드 중…' : '현재 SKU 다운로드'}
          </button>
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            빈 템플릿 다운로드
          </button>
        </div>
      </div>

      {exportError && (
        <p className="mb-3 text-xs text-red-600">{exportError}</p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFile}
        className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />

      {parseErrors.length > 0 && (
        <div className="mt-3 space-y-1 rounded-lg bg-red-50 p-3">
          {parseErrors.map((e, i) => (
            <p key={i} className="text-xs text-red-600">{e}</p>
          ))}
        </div>
      )}

      {preview.length > 0 && (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-slate-100">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {['브랜드', '이름', '용량', '슬롯', '순서', '태그 RU', '이미지', '활성', '성분 수'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {preview.map((r, i) => (
                  <tr key={i} className="text-slate-700">
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{r.brand}</td>
                    <td className="max-w-[180px] truncate px-3 py-2">{r.name}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-500">{r.volume_label || '—'}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">{r.box_builder_slot}</span>
                    </td>
                    <td className="px-3 py-2 text-slate-400">{r.box_builder_sort_order || '—'}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-slate-400">{r.box_builder_tag_ru || '—'}</td>
                    <td className="px-3 py-2 text-slate-400">
                      {r.image_url ? (
                        <span className="text-emerald-600">있음</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {r.is_active ? <span className="text-emerald-600">✓</span> : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-400">
                      {r.ingredients_json ? (
                        <span className="text-emerald-600">{r.ingredients_json.length}종</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={status === 'uploading'}
              className="rounded-lg bg-brand px-5 py-2 text-xs font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
            >
              {status === 'uploading' ? '반영 중…' : `${preview.length}개 등록/반영하기`}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-xs text-slate-400 underline hover:text-slate-600"
            >
              초기화
            </button>
            {resultMsg && (
              <span className={`text-xs font-medium ${status === 'done' ? 'text-emerald-600' : 'text-red-600'}`}>
                {resultMsg}
              </span>
            )}
          </div>
        </>
      )}

      {status === 'done' && !preview.length && (
        <p className="mt-3 text-xs font-medium text-emerald-600">{resultMsg}</p>
      )}

      {/* 성분 일괄 수집 */}
      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-700">성분 일괄 수집 (Gemini)</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {pendingCount > 0
                ? `성분 미수집 SKU ${pendingCount}개 대기 중`
                : '대기 중인 SKU 없음'}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              API: {skinApiUrl}
              {' · '}
              인증키: {SKIN_API_KEY_CONFIGURED ? '설정됨' : '미설정'}
              {skinApiGemini === false ? ' · Gemini: 미설정' : skinApiGemini ? ' · Gemini: OK' : ''}
              {skinApiHealth === 'ok' ? ' · 연결: OK' : skinApiHealth === 'auth_fail' ? ' · 연결: 인증 실패' : skinApiHealth === 'offline' ? ' · 연결: 오프라인' : ''}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Gemini 번역·태그 — SKU당 약 20~60초(일괄은 라이브러리 보강 생략). {pendingCount}개면 대략 {Math.max(1, Math.ceil(pendingCount * 0.4))}~{Math.max(1, Math.ceil(pendingCount))}분.
            </p>
            {import.meta.env.DEV && import.meta.env.VITE_SKIN_API_URL?.trim() && (
              <p className="mt-1 text-[10px] text-amber-700">
                로컬 main.py를 켜도 요청은 <code className="rounded bg-amber-50 px-0.5">{skinApiUrl}</code>로 갑니다.
                로컬 Flask를 쓰려면 .env에서 VITE_SKIN_API_URL을 비우고 Vite 프록시(/skin-api)를 사용하세요.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            <button
              type="button"
              onClick={() => void handleBatchFetch()}
              disabled={pendingCount === 0 || batchStatus === 'running' || skinApiHealth === 'auth_fail'}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              {batchStatus === 'running' ? '수집 중…' : '일괄 수집 시작'}
            </button>
            <button
              type="button"
              onClick={() => void handleForceRefetchAll()}
              disabled={batchStatus === 'running' || skinApiHealth === 'auth_fail'}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
            >
              전체 강제 재수집
            </button>
          </div>
        </div>

        {skinApiHealth === 'auth_fail' && (
          <p className="mt-2 text-xs text-red-600">
            API 인증 실패 — X-API-Key가 서버와 맞지 않습니다. .env의 VITE_SKIN_API_KEY 확인 후 dev 서버 재시작.
          </p>
        )}
        {skinApiHealth === 'offline' && (
          <p className="mt-2 text-xs text-red-600">
            성분 API에 연결할 수 없습니다. Flask 실행 여부와 VITE_SKIN_API_URL을 확인하세요.
          </p>
        )}

        {batchStatus === 'running' && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-slate-500">
              <span>
                {batchProgress.done} / {batchProgress.total} 완료
                {batchCurrentSku && batchProgress.done < batchProgress.total
                  ? ` · ${batchProgress.done + 1}번째 분석 중: ${batchCurrentSku}`
                  : ''}
              </span>
              {batchProgress.errors > 0 && (
                <span className="text-red-500">오류 {batchProgress.errors}개</span>
              )}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full bg-indigo-500 transition-all ${batchProgress.done === 0 && batchCurrentSku ? 'animate-pulse' : ''}`}
                style={{
                  width: batchProgress.total
                    ? `${Math.max(batchProgress.done === 0 && batchCurrentSku ? 8 : 0, (batchProgress.done / batchProgress.total) * 100)}%`
                    : '0%',
                }}
              />
            </div>
            {batchCurrentSku && batchProgress.done === 0 && (
              <p className="mt-1.5 text-[10px] text-indigo-600">
                Gemini 처리 중… Flask 터미널에 로그가 찍히면 정상입니다. 이 화면을 닫지 마세요.
              </p>
            )}
          </div>
        )}

        {batchStatus === 'done' && (
          <>
            <p className={`mt-2 text-xs font-medium ${batchProgress.errors > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              완료 — {batchProgress.done}개 처리
              {batchProgress.errors > 0 ? `, 오류 ${batchProgress.errors}개` : ''}
            </p>
            {batchErrorMsg && (
              <p className="mt-1 text-xs text-red-600">{batchErrorMsg}</p>
            )}
            {batchErrorSamples.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-[10px] text-red-500">
                {batchErrorSamples.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
