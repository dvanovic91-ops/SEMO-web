import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Legend,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
/** 대시보드 매출 기간: 일/주/월/기간 */
type DashboardPeriodType = 'day' | 'week' | 'month' | 'range';
import { deleteMappingForTypes, fetchMapping, saveMapping } from '../../lib/skinTypeSlotMapping';
import { supabase } from '../../lib/supabase';
import { ALL_SKIN_TYPES } from '../../config/skinTypeRecommendations';

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand';
const labelClass = 'mb-1 block text-sm font-medium text-slate-700';

/** 주문 품목 요약: 단가 최고인 품목 1개 + "외 N개" (최대 3개 표현) */
function formatOrderItemsSummary(items: unknown): string {
  const arr = Array.isArray(items) ? items : [];
  if (arr.length === 0) return '—';
  type Item = { name?: string; price?: number };
  const withPrice = (arr as Item[]).map((i) => ({ name: (i.name ?? '').toString().trim() || '—', price: Number(i.price) || 0 }));
  const sorted = withPrice.slice().sort((a, b) => b.price - a.price);
  const top = sorted[0];
  if (arr.length === 1) return top.name;
  return `${top.name} 외 ${arr.length - 1}개`;
}

/** ISO 주차 키 (YYYY-MM-DD → "YYYY-W01"~"YYYY-W53"). 트래픽 주별 집계용 */
function getISOWeekKey(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  const day = date.getDay() || 7; // 일요일=7 (월=1)
  date.setDate(date.getDate() + 4 - day); // 해당 주 목요일
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const weekNum = Math.ceil((((date.getTime() - jan1.getTime()) / 86400000) + 1) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

/** 상품·구성품 이미지 업로드용 Storage 버킷 (Supabase 대시보드에서 Public 버킷 생성) */
const BUCKET_PRODUCT_IMAGES = 'product-images';

/** 프로모 배너 업로드용 Storage 버킷 (Public 버킷 생성 권장) */
const BUCKET_PROMOS = 'promos';

/** 프로모 배너 권장 크기 — 16:9 비율, 웹에서 선명하게 보이도록 */
const PROMO_BANNER_RECOMMENDED = '1200×675px (16:9)';

/** 파일을 product-images 버킷에 업로드하고 공개 URL 반환. 실패 시 null + 콘솔/alert로 에러 노출 */
async function uploadProductImage(file: File): Promise<string | null> {
  console.log('[uploadProductImage] 시작', {
    name: file.name,
    type: file.type,
    size: file.size,
    hasSupabase: !!supabase,
  });
  if (!supabase) {
    window.alert('에러 발생: Supabase 클라이언트가 초기화되지 않았습니다.');
    return null;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `products/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  try {
    const { error } = await supabase.storage.from(BUCKET_PRODUCT_IMAGES).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || `image/${safeExt}`,
    });
    if (error) {
      console.error('Product image upload failed:', error);
      window.alert(`에러 발생: ${error.message ?? '상품 이미지 업로드 실패(Supabase 오류)'}`);
      return null;
    }
    const { data } = supabase.storage.from(BUCKET_PRODUCT_IMAGES).getPublicUrl(path);
    console.log('[uploadProductImage] 업로드 성공, publicUrl:', data.publicUrl);
    return data.publicUrl;
  } catch (err) {
    console.error('Product image upload exception:', err);
    const msg = err instanceof Error ? err.message : String(err);
    window.alert(`에러 발생: ${msg}`);
    return null;
  }
}

/** 프로모 배너 이미지를 promos 버킷에 업로드하고 공개 URL 반환 */
async function uploadPromoImage(file: File): Promise<string | null> {
  if (!supabase) {
    window.alert('에러: Supabase 클라이언트가 초기화되지 않았습니다.');
    return null;
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `banners/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
  try {
    const { error } = await supabase.storage.from(BUCKET_PROMOS).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || `image/${safeExt}`,
    });
    if (error) {
      console.error('Promo image upload failed:', error);
      window.alert(`업로드 실패: ${error.message ?? 'Supabase 오류'}. Storage 버킷 "${BUCKET_PROMOS}"(Public) 및 INSERT 정책을 확인하세요.`);
      return null;
    }
    const { data } = supabase.storage.from(BUCKET_PROMOS).getPublicUrl(path);
    return data.publicUrl;
  } catch (err) {
    console.error('Promo image upload exception:', err);
    window.alert(`에러: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** 천 단위 콤마 (1,000 형식) */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/** 쇼핑(Beauty Box) 카드 박스 색상: brand=주황, sky=연하늘(패밀리) */
type Product = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  rrp_price: number | null;
  prp_price: number | null;
  is_active: boolean | null;
  stock?: number | null;
  detail_description?: string | null;
  box_theme?: 'brand' | 'sky' | null;
};

type ProductComponent = {
  id: string;
  product_id: string;
  sort_order: number;
  name: string | null;
  image_url: string | null;
  /** 항목당 이미지 여러 장 (DB image_urls 또는 [image_url] 사용) */
  image_urls: string[];
  description: string | null;
  /** 상세페이지 «Подробнее о составе» 블록 배치: 왼쪽 사진/오른쪽 텍스트 또는 그 반대 */
  layout?: 'image_left' | 'image_right';
};

type DashboardKpi = {
  totalRevenueCents: number;
  orderCount: number;
  /** 누계: 전체 기간 매출·주문 수·트래픽 (카드 표시용) */
  totalRevenueCentsAllTime: number;
  orderCountAllTime: number;
  trafficAllTime: number;
  products: {
    id: string;
    name: string;
    stock: number;
    viewCount: number;
    revenueCents: number;
    quantitySold: number;
    orderCount: number;
    reviewCount: number;
    /** 누계: 상품별 전체 기간 매출·주문·조회·리뷰 */
    revenueCentsAllTime: number;
    orderCountAllTime: number;
    viewCountAllTime: number;
    reviewCountAllTime: number;
  }[];
};
/** 주문 품목으로 그래프·상품별 매출 집계용 */
type OrderForChart = { id: string; created_at: string; total_cents?: number; items?: { id: string; name?: string; quantity?: number; price?: number }[]; snapshot_items?: { id: string; name?: string; quantity?: number; price?: number }[] };

type ProductStats = {
  viewCount: number;
  reviewCount: number;
  avgRating: number | null;
  latestReviewAt: string | null;
};

/** 관리자 리뷰 상세: 사용자명·업로드 사진 등 표시용 */
type ProductReviewSummary = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  rating: number;
  body: string | null;
  created_at: string;
  review_photos: { image_url: string }[];
};

/** 트래픽 그래프 한 점: 합계(유니크 방문자) / 로그인 / 비로그인 */
type TrafficPoint = {
  label: string;
  total: number;
  loggedIn: number;
  anonymous: number;
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

/** 프로모 배너 (상단 Promo 메뉴에 노출). Supabase 테이블 promos 사용 */
type Promo = {
  id: string;
  title: string;
  image_url: string | null;
  end_at: string | null;
  sort_order: number;
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

/** 개발자 계정 이메일 — RLS 안내 문구에 사용 */
const DEVELOPER_EMAILS = ['dvanovic91@gmail.com', 'dvavnovic91@gmail.com'];

export const Admin: React.FC = () => {
  const { isLoggedIn, initialized, isAdmin, canGrantPermission, canGrantAdminRole, userEmail } = useAuth();
  const [tab, setTab] = useState<'dashboard' | 'products' | 'skinMatch' | 'promo' | 'orders' | 'activityLogs' | 'cartAbandonment' | 'reviewManagement' | 'members'>('dashboard');

  const [products, setProducts] = useState<Product[]>([]);
  /** 상품 목록 표시 순서 (앞에서 5개가 쇼핑 슬롯 1~5). 드래그로 순서 변경 후 저장 시 main_layout_slots에 반영 */
  const [orderedProductIds, setOrderedProductIds] = useState<string[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);

  /** 상품관리에서 정의한 슬롯( main_layout_slots 기준). 개수·순서가 카탈로그·테스트 매칭과 동일 */
  const [slots, setSlots] = useState<Slot[]>([]);
  /** 카탈로그에 노출할 슬롯 개수(1~5). 저장 시 이 개수만큼 main_layout_slots에 insert */
  const [slotCount, setSlotCount] = useState(5);
  const [savingSlots, setSavingSlots] = useState(false);

  const [dashboardKpi, setDashboardKpi] = useState<DashboardKpi | null>(null);
  /** 실제 주문 목록(품목 포함): 매출 그래프·상품별 집계용. 목업이 아닐 때 사용 */
  const [ordersForChart, setOrdersForChart] = useState<OrderForChart[]>([]);
  /** 사이트 트래픽: 합계 / 로그인 / 비로그인 구분. 일/주/월 세분화, 그래프용 */
  /** 트래픽·매출 공통 기간 (통합 버튼으로 제어) */
  const [trafficPeriod, setTrafficPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [trafficByDay, setTrafficByDay] = useState<TrafficPoint[]>([]);
  const [trafficByWeek, setTrafficByWeek] = useState<TrafficPoint[]>([]);
  const [trafficByMonth, setTrafficByMonth] = useState<TrafficPoint[]>([]);
  const [components, setComponents] = useState<ProductComponent[]>([]);
  const [productStats, setProductStats] = useState<ProductStats | null>(null);
  const [productReviews, setProductReviews] = useState<ProductReviewSummary[]>([]);
  const [showProductReviews, setShowProductReviews] = useState(false);
  /** 리뷰 상세 목록 페이지 (한 화면 10개) */
  const [productReviewPage, setProductReviewPage] = useState(1);

  /** 매출 그래프 기간: 일별 / 주별 / 월별 / 특정기간 */
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriodType>('day');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  /** 그래프 Y축: 수량(전체 수량) vs 금액(루블 매출) */
  const [dashboardMetric, setDashboardMetric] = useState<'quantity' | 'revenue'>('revenue');
  /** 특정 상품만 보기 (빈 문자열이면 전체) */
  const [selectedChartProduct, setSelectedChartProduct] = useState<string>('');

  const [error, setError] = useState<string | null>(null);

  /** 상품 대표 이미지 파일 선택용 (숨김 input 트리거) */
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  /** 구성품 이미지 파일 선택용 + 업로드 대상 인덱스 */
  const componentImageInputRef = useRef<HTMLInputElement>(null);
  const componentUploadIndexRef = useRef<number>(-1);
  /** 구성품 내 이미지 인덱스 (파일 올리기 시 어느 사진 칸에 넣을지) */
  const componentUploadImgIdxRef = useRef<number>(0);
  /** 대표 이미지 업로드 중 여부 */
  const [uploadingMainImage, setUploadingMainImage] = useState(false);
  /** 업로드 중인 구성품 인덱스 (-1이면 없음) */
  const [uploadingComponentIndex, setUploadingComponentIndex] = useState<number>(-1);
  /** 저장 성공 시 토스트 표시 (타임스탬프로 키 역할) */
  const [saveSuccessAt, setSaveSuccessAt] = useState<number | null>(null);
  /** 상품 미리보기 펼침 여부 */
  const [productPreviewOpen, setProductPreviewOpen] = useState(false);
  /** 카탈로그 미리보기(저장 전) 팝오버 표시 여부 */
  const [catalogPreviewOpen, setCatalogPreviewOpen] = useState(false);
  /** 상품 미리보기 자동 스크롤 타이머 */
  const previewScrollTimerRef = useRef<number | null>(null);
  const productPreviewRef = useRef<HTMLDivElement | null>(null);

  /** 테스트 결과–슬롯 매칭: 슬롯 번호별 피부타입 목록 (슬롯 개수 = 상품관리와 동일) */
  const [skinMatchSlotTypes, setSkinMatchSlotTypes] = useState<Record<number, string[]>>({});
  /** 매칭되지 않은 피부 타입 (슬롯에 넣지 않은 타입들) */
  const [unmatchedTypes, setUnmatchedTypes] = useState<string[]>([]);
  const [skinMatchLoading, setSkinMatchLoading] = useState(false);
  const [skinMatchSaving, setSkinMatchSaving] = useState(false);
  /** 이번 세션에서 사용자가 «비우기»로 비운 슬롯 — 슬롯 개수 변경 후 재로드해도 해당 슬롯은 비워 두고 타입은 미매칭 유지 */
  const userClearedSlotsRef = useRef<Set<number>>(new Set());

  /** 프로모 배너 목록 (Promo 탭·상단 Promo 메뉴용). 드래그로 순서 변경 가능 */
  const [promos, setPromos] = useState<Promo[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promosSaving, setPromosSaving] = useState(false);
  const [selectedPromo, setSelectedPromo] = useState<Promo | null>(null);
  const [promoForm, setPromoForm] = useState({ title: '', image_url: '', end_at: '' });
  const [uploadingPromoImage, setUploadingPromoImage] = useState(false);
  const promoImageInputRef = useRef<HTMLInputElement>(null);

  /** 주문 탭: 목록 + 수령인 정보 수정. is_test=true면 가짜 주문 → 나중에 일괄 삭제 가능. inn/passport는 주문 시점 스냅샷 */
  type OrderRow = { id: string; order_number?: string | null; created_at: string; total_cents: number; points_used?: number | null; status: string; receiver_name: string | null; receiver_phone: string | null; shipping_address: string | null; tracking_url?: string | null; items?: unknown; snapshot_items?: unknown; is_test?: boolean; inn?: string | null; passport_series?: string | null; passport_number?: string | null };
  /** 가짜 주문(데모) — DB에 주문이 없을 때 목록에 표시. 사용자가 만들어 둔 데모용 */
  const FAKE_ORDERS_DEMO: OrderRow[] = [
    { id: 'demo-order-1', order_number: 'ORD-DEMO-001', created_at: new Date().toISOString(), total_cents: 45000, points_used: 0, status: 'completed', receiver_name: 'Тест Получатель', receiver_phone: '+7 999 123 4567', shipping_address: 'Москва, ул. Тестовая, 1', tracking_url: null, is_test: true },
    { id: 'demo-order-2', order_number: 'ORD-DEMO-002', created_at: new Date(Date.now() - 86400000).toISOString(), total_cents: 32000, points_used: 500, status: 'shipped', receiver_name: 'Демо Имя', receiver_phone: null, shipping_address: 'Санкт-Петербург', tracking_url: null, is_test: true },
    { id: 'demo-order-3', order_number: 'ORD-DEMO-003', created_at: new Date(Date.now() - 172800000).toISOString(), total_cents: 28000, points_used: null, status: 'pending', receiver_name: null, receiver_phone: null, shipping_address: null, tracking_url: null, is_test: true },
  ];
  const [ordersList, setOrdersList] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderRow | null>(null);
  const [orderEditForm, setOrderEditForm] = useState({ receiver_name: '', receiver_phone: '', shipping_address: '', tracking_url: '' });
  const [orderSaving, setOrderSaving] = useState(false);
  /** 주문 상태 변경(취소/환불) 중인 주문 id */
  const [orderStatusUpdating, setOrderStatusUpdating] = useState<string | null>(null);
  /** 개인정보(INN/여권) 펼쳐 본 주문 id — 팝오버로 표시, 바깥 클릭 시 닫힘 */
  const [expandedPersonalInfoOrderId, setExpandedPersonalInfoOrderId] = useState<string | null>(null);

  useEffect(() => {
    if (expandedPersonalInfoOrderId == null) return;
    const closeOnOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const openCell = document.querySelector(`[data-personal-info-popover="${expandedPersonalInfoOrderId}"]`);
      if (openCell?.contains(target)) return;
      setExpandedPersonalInfoOrderId(null);
    };
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, [expandedPersonalInfoOrderId]);

  /** 활동 로그 탭: CS 방어용 타임라인 (가격 확인·결제 버튼 클릭 등) */
  type ActivityLogRow = { id: string; user_id: string | null; action: string; metadata: Record<string, unknown>; order_id: string | null; created_at: string };
  const [activityLogsList, setActivityLogsList] = useState<ActivityLogRow[]>([]);
  const [activityLogsLoading, setActivityLogsLoading] = useState(false);
  const [activityLogsFilterUserId, setActivityLogsFilterUserId] = useState('');

  /** 장바구니 이탈 탭: CRM/리타겟팅용 (로그인 후 장바구니 담고 미결제한 명단) */
  type CartAbandonmentRow = { user_id: string; items: { id: string; name: string; quantity: number; price: number }[]; total_cents: number; created_at: string | null; updated_at: string; name: string | null; email: string | null; telegram_id: string | null };
  const [cartAbandonmentList, setCartAbandonmentList] = useState<CartAbandonmentRow[]>([]);
  const [cartAbandonmentLoading, setCartAbandonmentLoading] = useState(false);

  /** 리뷰 관리 탭: 전체 리뷰 목록 + 삭제/포인트 지급/대댓글 */
  type ReviewManagementRow = {
    id: string;
    product_id: string;
    product_name: string;
    user_id: string;
    user_name: string | null;
    user_email: string | null;
    rating: number;
    body: string | null;
    created_at: string;
    admin_reply: string | null;
    review_reward_points: number;
    review_photos: { image_url: string }[];
  };
  const [reviewManagementList, setReviewManagementList] = useState<ReviewManagementRow[]>([]);
  const [reviewManagementLoading, setReviewManagementLoading] = useState(false);
  const [editingReplyId, setEditingReplyId] = useState<string | null>(null);
  const [editingReplyText, setEditingReplyText] = useState('');
  const [reviewActionLoading, setReviewActionLoading] = useState<string | null>(null);
  const [reviewFilterUserId, setReviewFilterUserId] = useState<string | null>(null);

  /** 가입회원 관리 탭: 회원 목록 + 등급/쿠폰 지급 */
  type MemberRow = {
    id: string;
    email: string | null;
    name: string | null;
    grade: string;
    points: number;
    telegram_id: string | null;
    created_at: string;
    last_visit_at?: string | null;
    has_skin_test?: boolean;
    skin_type?: string | null;
    skin_completed_at?: string | null;
    tier: 'basic' | 'premium' | 'family';
    order_count: number;
    is_manager?: boolean;
    is_admin?: boolean;
  };
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [grantingCoupons, setGrantingCoupons] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [ordersFilterUserId, setOrdersFilterUserId] = useState<string | null>(null);
  const [specialCouponAmount, setSpecialCouponAmount] = useState<number>(100);
  /** 회원 역할 변경 후 목록 다시 불러오기용 */
  const [membersRefreshTrigger, setMembersRefreshTrigger] = useState(0);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  /** 저장 성공 토스트 3초 후 자동 숨김 */
  useEffect(() => {
    if (saveSuccessAt == null) return;
    const t = setTimeout(() => setSaveSuccessAt(null), 3000);
    return () => clearTimeout(t);
  }, [saveSuccessAt]);

  useEffect(() => {
    return () => {
      if (previewScrollTimerRef.current != null) {
        window.clearInterval(previewScrollTimerRef.current);
      }
    };
  }, []);

  // 가입회원 관리 탭: profiles + skin_test_results + orders + site_visits 간단 집계
  useEffect(() => {
    if (tab !== 'members' || !supabase || !isAdmin) return;

    const loadMembers = async () => {
      try {
        setMembersLoading(true);
        setMembersError(null);

        // 1) 기본 프로필 목록 (역할: is_manager, is_admin 포함)
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, email, name, grade, points, telegram_id, created_at, is_manager, is_admin')
          .order('created_at', { ascending: true });

        if (profilesError) {
          console.error('[Admin] profiles select 실패:', profilesError);
          setMembers([]);
          const devHint = userEmail && DEVELOPER_EMAILS.includes(userEmail.trim().toLowerCase())
            ? ' Supabase SQL Editor에서 docs/SUPABASE_PROFILES_ADMIN_RLS.sql 전체 실행 후, 본인 프로필(profiles)에 is_admin = true 인지 확인하세요.'
            : '';
          setMembersError(
            '회원 목록을 불러오지 못했습니다. Supabase profiles 테이블 RLS에서 관리자 조회 정책이 있는지 확인하세요.' + devHint
          );
          return;
        }

        const profilesSafe =
          (profilesData as { id: string; email: string | null; name: string | null; grade: string | null; points: number | null; telegram_id: string | null; created_at: string; is_manager?: boolean | null; is_admin?: boolean | null }[]) ??
          [];
        const userIds = profilesSafe.map((p) => p.id);

        if (userIds.length === 0) {
          setMembers([]);
          return;
        }

        // 2) 스킨 테스트 여부 + 최신 결과 (피부 타입, 완료일)
        const { data: skinData } = await supabase
          .from('skin_test_results')
          .select('user_id, skin_type, completed_at')
          .in('user_id', userIds);
        const skinLatestMap = new Map<
          string,
          {
            has: boolean;
            skin_type: string | null;
            completed_at: string | null;
          }
        >();
        (skinData ?? []).forEach((s: { user_id: string; skin_type: string | null; completed_at: string | null }) => {
          const prev = skinLatestMap.get(s.user_id);
          if (!prev || (s.completed_at && prev.completed_at && s.completed_at > prev.completed_at) || (!prev.completed_at && s.completed_at)) {
            skinLatestMap.set(s.user_id, {
              has: true,
              skin_type: s.skin_type ?? null,
              completed_at: s.completed_at ?? null,
            });
          }
        });

        // 3) 주문 집계: 건수와 등급 계산용 결제 완료·구매확정 합계
        const { data: ordersData } = await supabase
          .from('orders')
          .select('id, user_id, status, total_cents, is_test')
          .in('user_id', userIds);

        const orderAgg = new Map<
          string,
          {
            count: number;
            sumCentsDelivered: number;
          }
        >();

        (ordersData as { id: string; user_id: string; status: string | null; total_cents: number | null; is_test?: boolean | null }[] | null)?.forEach((o) => {
          const key = o.user_id;
          const prev =
            orderAgg.get(key) ?? {
              count: 0,
              sumCentsDelivered: 0,
            };
          const isTest = o.is_test ?? false;
          const status = o.status ?? '';
          const total = o.total_cents ?? 0;
          const next = { ...prev, count: prev.count + 1 };
          if (!isTest && (status === 'delivered' || status === 'confirmed')) {
            next.sumCentsDelivered += total;
          }
          orderAgg.set(key, next);
        });

        // 4) 마지막 방문일: site_visits 집계 (있으면 사용, 없으면 null)
        let lastVisitMap = new Map<string, string | null>();
        try {
          const { data: visitData } = await supabase
            .from('site_visits')
            .select('user_id, created_at')
            .in('user_id', userIds);
          lastVisitMap = new Map<string, string | null>();
          (visitData as { user_id: string; created_at: string }[] | null)?.forEach((v) => {
            const prev = lastVisitMap.get(v.user_id);
            if (!prev || new Date(v.created_at) > new Date(prev)) {
              lastVisitMap.set(v.user_id, v.created_at);
            }
          });
        } catch (e) {
          console.warn('[Admin] site_visits 조회 실패 (무시 가능):', e);
        }

        const mapped: MemberRow[] = profilesSafe.map((p) => {
          const agg = orderAgg.get(p.id);
          const sumRub = ((agg?.sumCentsDelivered ?? 0) / 100) as number;
          let tier: MemberRow['tier'] = 'basic';
          if (sumRub >= 100000) tier = 'family';
          else if (sumRub >= 35000) tier = 'premium';

          return {
            id: p.id,
            email: p.email,
            name: p.name,
            grade: p.grade ?? '',
            points: p.points ?? 0,
            telegram_id: p.telegram_id,
            created_at: p.created_at,
            last_visit_at: lastVisitMap.get(p.id) ?? null,
            has_skin_test: !!skinLatestMap.get(p.id)?.has,
            skin_type: skinLatestMap.get(p.id)?.skin_type ?? null,
            skin_completed_at: skinLatestMap.get(p.id)?.completed_at ?? null,
            tier,
            order_count: agg?.count ?? 0,
            is_manager: p.is_manager ?? false,
            is_admin: p.is_admin ?? false,
          };
        });

        setMembers(mapped);
        setSelectedMemberIds([]);
      } catch (e) {
        console.error('[Admin] 회원 목록 로드 중 오류:', e);
        const devHint = userEmail && DEVELOPER_EMAILS.includes(userEmail.trim().toLowerCase())
          ? ' Supabase SQL Editor에서 docs/SUPABASE_PROFILES_ADMIN_RLS.sql 실행 후, profiles.is_admin = true 인지 확인하세요.'
          : '';
        setMembersError('회원 목록을 불러오지 못했습니다. 콘솔(F12) 오류를 확인하세요.' + devHint);
        setMembers([]);
      } finally {
        setMembersLoading(false);
      }
    };

    void loadMembers();
  }, [tab, supabase, isAdmin, membersRefreshTrigger]);

  /** 실제 주문 기준 기간별 매출 시계열 (일/주/월, 상품 필터 적용). 목업 없이 항상 실제 데이터 사용 */
  const revenueChartDataReal = useMemo(() => {
    if (!ordersForChart.length) return [];
    const productIdFilter = selectedChartProduct || null;
    const getBucketKey = (createdAt: string) => {
      const d = createdAt.slice(0, 10);
      if (dashboardPeriod === 'day') return d;
      if (dashboardPeriod === 'week') return getISOWeekKey(d);
      return d.slice(0, 7);
    };
    const bucketMap = new Map<string, { revenueCents: number; quantity: number }>();
    ordersForChart.forEach((ord) => {
      const items = (ord.items ?? ord.snapshot_items ?? []) as { id: string; quantity?: number; price?: number }[];
      items.forEach((it) => {
        if (productIdFilter && it.id !== productIdFilter) return;
        const q = Math.max(0, Number(it.quantity) ?? 0);
        const priceRub = Number(it.price) ?? 0;
        const cents = Math.round(priceRub * 100) * q;
        const key = getBucketKey(ord.created_at);
        const cur = bucketMap.get(key) ?? { revenueCents: 0, quantity: 0 };
        cur.revenueCents += cents;
        cur.quantity += q;
        bucketMap.set(key, cur);
      });
    });
    const sorted = Array.from(bucketMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    if (dashboardPeriod === 'day') return sorted.slice(-7);
    if (dashboardPeriod === 'week') return sorted.slice(-12);
    return sorted.slice(-12);
  }, [ordersForChart, dashboardPeriod, selectedChartProduct]);

  /** 그래프에 넣을 매출 시계열 (실제 주문 데이터) */
  const revenueChartData = revenueChartDataReal.map(([key, b]) => {
    let label = key;
    if (key.length === 10) {
      const [, m, d] = key.split('-');
      label = `${parseInt(m ?? '0', 10)}월 ${parseInt(d ?? '0', 10)}일`;
    } else if (key.length === 7) {
      const [y, m] = key.split('-');
      label = `${y}년 ${parseInt(m ?? '0', 10)}월`;
    }
    return { label, dateKey: key, revenue: b.revenueCents / 100, quantity: b.quantity };
  });

  /** 트래픽 그래프용: 기간(일/주/월)에 따라 표시할 데이터. 일별 최근 7일 */
  const trafficChartData = useMemo(() => {
    if (trafficPeriod === 'week') return trafficByWeek;
    if (trafficPeriod === 'month') return trafficByMonth;
    return trafficByDay;
  }, [trafficPeriod, trafficByDay, trafficByWeek, trafficByMonth]);

  /** 수량/금액 + 상품 필터 적용한 그래프 데이터 (value 하나로 통일). 실제 데이터만 사용 */
  const chartData = useMemo(() => {
    if (!revenueChartData.length) return [];
    const isQuantity = dashboardMetric === 'quantity';
    return revenueChartData.map((d) => ({
      ...d,
      value: isQuantity ? d.quantity : d.revenue,
    }));
  }, [revenueChartData, dashboardMetric]);

  useEffect(() => {
    if (!supabase || !isAdmin) return;

    const load = async () => {
      if (!supabase) return;
      try {
        setError(null);
        // 기본 스키마 + image_urls, box_theme 조회. 실패 시(없는 컬럼 등) Shop과 동일 컬럼으로 재시도
        const selectFull =
          'id, name, category, description, image_url, image_urls, rrp_price, prp_price, is_active, box_theme';
        let { data: prodData, error: prodError } = await supabase
          .from('products')
          .select(selectFull);
        if (prodError) {
          console.warn('[Admin] products select 실패:', prodError.code, prodError.message);
          // 컬럼 없음(42703) 등이면 box_theme 제외하고 재시도
          const selectFallback =
            'id, name, category, description, image_url, image_urls, rrp_price, prp_price, is_active';
          const fallback = await supabase.from('products').select(selectFallback);
          if (fallback.error) {
            setError(
              '상품 목록을 불러오지 못했습니다. Supabase products 테이블 RLS에서 "authenticated" 사용자 SELECT를 허용했는지, 콘솔(F12) 오류를 확인하세요.'
            );
            console.error('[Admin] products fallback 실패:', fallback.error);
            setProducts([]);
            return;
          }
          prodData = fallback.data as (Product & { image_urls?: string[]; stock?: number; detail_description?: string | null; box_theme?: 'brand' | 'sky' | null })[];
        }
        const raw =
          (prodData as (Product & {
            image_urls?: string[];
            stock?: number;
            detail_description?: string | null;
            box_theme?: 'brand' | 'sky' | null;
          })[]) ?? [];
        const prodList = raw.slice().sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((p): Product => ({
          ...p,
          image_urls: p.image_urls ?? (p.image_url ? [p.image_url] : []),
          stock: p.stock ?? null,
          detail_description: p.detail_description ?? null,
          box_theme: p.box_theme ?? 'brand',
        }));
        setProducts(prodList);

        const { data: slotData } = await supabase
          .from('main_layout_slots')
          .select('id, slot_index, title, description, image_url, product_id, link_url');
        const slotsSorted = ((slotData ?? []) as { id: number; slot_index: number; title: string | null; description: string | null; image_url: string | null; product_id: string | null; link_url: string | null }[]).slice().sort((a, b) => a.slot_index - b.slot_index);

        if (slotsSorted.length > 0) {
          const filled = slotsSorted.map((found, i) => ({
            id: found.id,
            slot_index: found.slot_index,
            title: found.title ?? '',
            description: found.description ?? '',
            image_url: found.image_url ?? null,
            product_id: found.product_id ?? null,
            link_url: found.link_url ?? '',
          }));
          setSlots(filled);
          setSlotCount(filled.length);
          const slotProductIds = filled.map((s) => s.product_id).filter(Boolean) as string[];
          const restIds = prodList.map((p) => p.id).filter((id) => !slotProductIds.includes(id));
          setOrderedProductIds([...slotProductIds, ...restIds]);
        } else {
          setSlots([]);
          setSlotCount(1);
          setOrderedProductIds(prodList.map((p) => p.id));
        }
      } catch (e) {
        setError('관리자 데이터를 불러오지 못했습니다.');
        console.error(e);
      }
    };

    void load();
  }, [isAdmin]);

  // 대시보드 KPI: 매출, 주문 수, 상품별 재고·조회수 (선택 기간: 일/주/월에 따라 필터)
  useEffect(() => {
    if (!supabase || !isAdmin || tab !== 'dashboard') return;

    const loadKpi = async () => {
      try {
        // 선택 기간에 따른 날짜 범위: 매출/트래픽 차트와 동일 (일=최근 7일, 주=12주, 월=12달)
        const rangeEnd = new Date();
        const rangeStart = new Date();
        if (dashboardPeriod === 'day') {
          rangeStart.setDate(rangeStart.getDate() - 7);
        } else if (dashboardPeriod === 'week') {
          rangeStart.setDate(rangeStart.getDate() - 12 * 7);
        } else {
          rangeStart.setMonth(rangeStart.getMonth() - 12);
        }
        const rangeStartIso = rangeStart.toISOString();
        const rangeEndIso = rangeEnd.toISOString();

        // 실제 주문만 매출·주문 수에 반영 (is_test 가짜 주문 제외)
        let ordersList: OrderForChart[] = [];
        let ordersQuery = supabase
          .from('orders')
          .select('id, created_at, total_cents, items, snapshot_items, is_test')
          .gte('created_at', rangeStartIso)
          .lte('created_at', rangeEndIso);
        const { data: orderData, error: orderErr } = await ordersQuery;
        const excludeTest = (rows: { is_test?: boolean | null }[] | null) =>
          (rows ?? []).filter((o) => o.is_test !== true) as OrderForChart[];
        if (orderErr) {
          const { data: orderDataMin } = await supabase
            .from('orders')
            .select('id, created_at, total_cents, is_test')
            .gte('created_at', rangeStartIso)
            .lte('created_at', rangeEndIso);
          ordersList = excludeTest(orderDataMin ?? []);
        } else {
          ordersList = excludeTest(orderData ?? []);
        }
        const totalRevenueCents = ordersList.reduce((s, o) => s + (o.total_cents ?? 0), 0);
        const orderCount = ordersList.length;
        setOrdersForChart(ordersList);

        // 누계용: 전체 주문 중 실제 주문만 (가짜 주문 제외)
        const { data: orderDataAll } = await supabase
          .from('orders')
          .select('id, created_at, total_cents, items, snapshot_items, is_test');
        const ordersListAllTime = excludeTest(orderDataAll ?? []);
        const totalRevenueCentsAllTime = ordersListAllTime.reduce((s, o) => s + (o.total_cents ?? 0), 0);

        const { data: prodData } = await supabase
          .from('products')
          .select('id, name, stock');
        const productIds = (prodData ?? []).map((p: { id: string }) => p.id);
        let viewCounts: Record<string, number> = {};
        let reviewCounts: Record<string, number> = {};
        let viewCountsAllTime: Record<string, number> = {};
        let reviewCountsAllTime: Record<string, number> = {};
        if (productIds.length > 0) {
          const [viewRes, reviewRes, viewResAll, reviewResAll] = await Promise.all([
            supabase
              .from('product_views')
              .select('product_id')
              .gte('created_at', rangeStartIso)
              .lte('created_at', rangeEndIso),
            supabase
              .from('product_reviews')
              .select('product_id')
              .gte('created_at', rangeStartIso)
              .lte('created_at', rangeEndIso),
            supabase.from('product_views').select('product_id'),
            supabase.from('product_reviews').select('product_id'),
          ]);
          (viewRes.data ?? []).forEach((v: { product_id: string }) => {
            viewCounts[v.product_id] = (viewCounts[v.product_id] ?? 0) + 1;
          });
          (reviewRes.data ?? []).forEach((r: { product_id: string }) => {
            reviewCounts[r.product_id] = (reviewCounts[r.product_id] ?? 0) + 1;
          });
          (viewResAll.data ?? []).forEach((v: { product_id: string }) => {
            viewCountsAllTime[v.product_id] = (viewCountsAllTime[v.product_id] ?? 0) + 1;
          });
          (reviewResAll.data ?? []).forEach((r: { product_id: string }) => {
            reviewCountsAllTime[r.product_id] = (reviewCountsAllTime[r.product_id] ?? 0) + 1;
          });
        }

        const productRevenue: Record<string, { revenueCents: number; quantitySold: number; orderCount: number }> = {};
        const productRevenueAllTime: Record<string, { revenueCents: number; orderCount: number }> = {};
        productIds.forEach((id: string) => {
          productRevenue[id] = { revenueCents: 0, quantitySold: 0, orderCount: 0 };
          productRevenueAllTime[id] = { revenueCents: 0, orderCount: 0 };
        });
        ordersList.forEach((ord) => {
          const items = (ord.items ?? ord.snapshot_items ?? []) as { id: string; quantity?: number; price?: number }[];
          const orderProductIds = new Set<string>();
          items.forEach((it) => {
            const pid = it.id;
            const q = Math.max(0, Number(it.quantity) ?? 0);
            const priceRub = Number(it.price) ?? 0;
            const cents = Math.round(priceRub * 100) * q;
            if (pid && productRevenue[pid]) {
              productRevenue[pid].revenueCents += cents;
              productRevenue[pid].quantitySold += q;
              orderProductIds.add(pid);
            }
          });
          orderProductIds.forEach((pid) => {
            if (productRevenue[pid]) productRevenue[pid].orderCount += 1;
          });
        });
        ordersListAllTime.forEach((ord) => {
          const items = (ord.items ?? ord.snapshot_items ?? []) as { id: string; quantity?: number; price?: number }[];
          const orderProductIds = new Set<string>();
          items.forEach((it) => {
            const pid = it.id;
            const q = Math.max(0, Number(it.quantity) ?? 0);
            const priceRub = Number(it.price) ?? 0;
            const cents = Math.round(priceRub * 100) * q;
            if (pid && productRevenueAllTime[pid]) {
              productRevenueAllTime[pid].revenueCents += cents;
              orderProductIds.add(pid);
            }
          });
          orderProductIds.forEach((pid) => {
            if (productRevenueAllTime[pid]) productRevenueAllTime[pid].orderCount += 1;
          });
        });

        // 사이트 트래픽: 합계(유니크 방문자) / 로그인 / 비로그인 구분 집계 + 누계 유니크 방문자 수
        const from = new Date();
        from.setDate(from.getDate() - 400);
        const { data: visitData } = await supabase
          .from('site_visits')
          .select('user_id, session_id, created_at')
          .gte('created_at', from.toISOString());
        type Row = { user_id: string | null; session_id: string | null; created_at: string };
        const visitorKey = (r: Row) => (r.user_id ?? r.session_id ?? '').toString();
        const byDayT = new Map<string, { total: Set<string>; loggedIn: Set<string>; anonymous: Set<string> }>();
        const byWeekT = new Map<string, { total: Set<string>; loggedIn: Set<string>; anonymous: Set<string> }>();
        const byMonthT = new Map<string, { total: Set<string>; loggedIn: Set<string>; anonymous: Set<string> }>();
        const getBucket = (
          map: Map<string, { total: Set<string>; loggedIn: Set<string>; anonymous: Set<string> }>,
          key: string
        ) => {
          if (!map.has(key))
            map.set(key, { total: new Set(), loggedIn: new Set(), anonymous: new Set() });
          return map.get(key)!;
        };
        (visitData ?? []).forEach((r: Row) => {
          const key = visitorKey(r);
          if (!key) return;
          const d = r.created_at.slice(0, 10);
          const weekKey = getISOWeekKey(d);
          const [y, m] = [d.slice(0, 4), d.slice(5, 7)];
          const monthKey = `${y}-${m}`;
          const dayB = getBucket(byDayT, d);
          const weekB = getBucket(byWeekT, weekKey);
          const monthB = getBucket(byMonthT, monthKey);
          dayB.total.add(key);
          weekB.total.add(key);
          monthB.total.add(key);
          if (r.user_id) {
            dayB.loggedIn.add(r.user_id);
            weekB.loggedIn.add(r.user_id);
            monthB.loggedIn.add(r.user_id);
          } else if (r.session_id) {
            dayB.anonymous.add(r.session_id);
            weekB.anonymous.add(r.session_id);
            monthB.anonymous.add(r.session_id);
          }
        });
        // 누계 트래픽: 전체 기간 유니크 방문자 수 (조회 기간 내 모든 일별 Set 합침)
        const trafficAllTimeSet = new Set<string>();
        byDayT.forEach((b) => b.total.forEach((k) => trafficAllTimeSet.add(k)));
        const trafficAllTime = trafficAllTimeSet.size;

        setDashboardKpi({
          totalRevenueCents,
          orderCount,
          totalRevenueCentsAllTime,
          orderCountAllTime: ordersListAllTime.length,
          trafficAllTime,
          products: (prodData ?? []).map((p: { id: string; name?: string | null; stock?: number | null }) => ({
            id: p.id,
            name: p.name ?? '',
            stock: p.stock ?? 0,
            viewCount: viewCounts[p.id] ?? 0,
            revenueCents: productRevenue[p.id]?.revenueCents ?? 0,
            quantitySold: productRevenue[p.id]?.quantitySold ?? 0,
            orderCount: productRevenue[p.id]?.orderCount ?? 0,
            reviewCount: reviewCounts[p.id] ?? 0,
            revenueCentsAllTime: productRevenueAllTime[p.id]?.revenueCents ?? 0,
            orderCountAllTime: productRevenueAllTime[p.id]?.orderCount ?? 0,
            viewCountAllTime: viewCountsAllTime[p.id] ?? 0,
            reviewCountAllTime: reviewCountsAllTime[p.id] ?? 0,
          })),
        });

        const toPoint = (
          [label, b]: [string, { total: Set<string>; loggedIn: Set<string>; anonymous: Set<string> }]
        ): TrafficPoint => ({
          label,
          total: b.total.size,
          loggedIn: b.loggedIn.size,
          anonymous: b.anonymous.size,
        });
        const dayList = Array.from(byDayT.entries())
          .map(toPoint)
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(-7);
        const weekList = Array.from(byWeekT.entries())
          .map(toPoint)
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(-12);
        const monthList = Array.from(byMonthT.entries())
          .map(toPoint)
          .sort((a, b) => a.label.localeCompare(b.label))
          .slice(-12);
        setTrafficByDay(dayList);
        setTrafficByWeek(weekList);
        setTrafficByMonth(monthList);
      } catch {
        setDashboardKpi(null);
        setOrdersForChart([]);
        setTrafficByDay([]);
        setTrafficByWeek([]);
        setTrafficByMonth([]);
      }
    };

    void loadKpi();
  }, [isAdmin, tab, dashboardPeriod]);

  // 테스트 매칭 탭: 상품관리 슬롯 개수와 동일하게 DB 매칭 로드 → 슬롯별·미매칭으로 변환
  useEffect(() => {
    if (tab !== 'skinMatch') return;
    const slotCount = slots.length;
    setSkinMatchLoading(true);
    fetchMapping()
      .then((dbMap) => {
        const bySlot: Record<number, string[]> = {};
        for (let i = 1; i <= slotCount; i++) bySlot[i] = [];
        const cleared = userClearedSlotsRef.current;
        // DB에 있는 매칭만 슬롯에 넣음. config 기본값 사용 안 함 → 비우기 후 저장 시 미매칭 유지
        ALL_SKIN_TYPES.forEach((type) => {
          const slot = dbMap[type];
          if (typeof slot !== 'number' || slot < 1 || slot > slotCount) return;
          if (cleared.has(slot)) return;
          if (!bySlot[slot].includes(type)) bySlot[slot].push(type);
        });
        const assigned = new Set(Object.values(bySlot).flat());
        const unmatchedSet = new Set(ALL_SKIN_TYPES.filter((t) => !assigned.has(t)));
        cleared.forEach((slotNum) => {
          ALL_SKIN_TYPES.forEach((type) => {
            if (dbMap[type] === slotNum) unmatchedSet.add(type);
          });
        });
        setSkinMatchSlotTypes(bySlot);
        setUnmatchedTypes(Array.from(unmatchedSet));
      })
      .catch(() => {})
      .finally(() => setSkinMatchLoading(false));
  }, [tab, slots]);

  // 프로모 탭: promos 테이블 로드 (Supabase에 promos 테이블 필요: id, title, image_url, end_at, sort_order)
  useEffect(() => {
    if (tab !== 'promo' || !supabase) return;
    setPromosLoading(true);
    supabase
      .from('promos')
      .select('id, title, image_url, end_at, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          console.warn('[Admin] promos load:', error.message);
          setPromos([]);
          return;
        }
        setPromos((data as Promo[]) ?? []);
      })
      .finally(() => setPromosLoading(false));
  }, [tab]);

  // 주문 탭: orders 목록 로드 (최신순). 개인정보(inn·여권)는 가능한 한 포함해 조회
  useEffect(() => {
    if (tab !== 'orders' || !supabase) return;
    setOrdersLoading(true);
    const baseCols = 'id, order_number, created_at, total_cents, points_used, status, receiver_name, receiver_phone, shipping_address, tracking_url';
    const baseColsNoPoints = 'id, order_number, created_at, total_cents, status, receiver_name, receiver_phone, shipping_address, tracking_url';
    const baseColsMinimal = 'id, created_at, total_cents, status, receiver_name, receiver_phone, shipping_address';
    const personalCols = 'inn, passport_series, passport_number';
    let q = supabase
      .from('orders')
      .select(`${baseCols}, items, snapshot_items, is_test, ${personalCols}`)
      .order('created_at', { ascending: false });
    if (ordersFilterUserId) {
      q = q.eq('user_id', ordersFilterUserId);
    }
    q
      .then(({ data, error }) => {
        if (error) {
          console.warn('[Admin] orders load:', error.message, '— retry with personal info only (no items/is_test)');
          let q2 = supabase
            .from('orders')
            .select(`${baseColsNoPoints}, snapshot_items, ${personalCols}`)
            .order('created_at', { ascending: false });
          if (ordersFilterUserId) {
            q2 = q2.eq('user_id', ordersFilterUserId);
          }
          q2
            .then(({ data: data2, error: err2 }) => {
              if (err2) {
                console.warn('[Admin] orders retry:', err2.message, '— retry minimal (no order_number)');
                let q3 = supabase
                  .from('orders')
                  .select(`${baseColsMinimal}`)
                  .order('created_at', { ascending: false });
                if (ordersFilterUserId) {
                  q3 = q3.eq('user_id', ordersFilterUserId);
                }
                q3
                  .then(({ data: data3, error: err3 }) => {
                    if (err3) {
                      setOrdersList(FAKE_ORDERS_DEMO);
                    } else {
                      const list = (data3 as OrderRow[]) ?? [];
                      setOrdersList(list.length > 0 ? list : FAKE_ORDERS_DEMO);
                    }
                  })
                  .finally(() => setOrdersLoading(false));
                return;
              }
              const list2 = (data2 as OrderRow[]) ?? [];
              setOrdersList(list2.length > 0 ? list2 : FAKE_ORDERS_DEMO);
            })
            .finally(() => setOrdersLoading(false));
          return;
        }
        const list = (data as OrderRow[]) ?? [];
        setOrdersList(list.length > 0 ? list : FAKE_ORDERS_DEMO);
      })
      .finally(() => setOrdersLoading(false));
  }, [tab]);

  // 활동 로그 탭: activity_logs 최신순 (필터 있으면 해당 user_id만)
  useEffect(() => {
    if (tab !== 'activityLogs' || !supabase) return;
    setActivityLogsLoading(true);
    let q = supabase
      .from('activity_logs')
      .select('id, user_id, action, metadata, order_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);
    if (activityLogsFilterUserId.trim()) {
      q = q.eq('user_id', activityLogsFilterUserId.trim());
    }
    q.then(({ data, error }) => {
      if (error) {
        console.warn('[Admin] activity_logs load:', error.message);
        setActivityLogsList([]);
        return;
      }
      setActivityLogsList((data as ActivityLogRow[]) ?? []);
    })
      .finally(() => setActivityLogsLoading(false));
  }, [tab, activityLogsFilterUserId]);

  // 장바구니 이탈 탭: cart_snapshots + profiles (이메일·이름·텔레그램 연동 여부)
  useEffect(() => {
    if (tab !== 'cartAbandonment' || !supabase) return;
    setCartAbandonmentLoading(true);
    supabase
      .from('cart_snapshots')
      .select('user_id, items, total_cents, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .then(async ({ data: snapshots, error }) => {
        if (error) {
          console.warn('[Admin] cart_snapshots load:', error.message);
          setCartAbandonmentList([]);
          return;
        }
        const rows = (snapshots ?? []) as { user_id: string; items: { id: string; name: string; quantity: number; price: number }[]; total_cents: number; created_at: string | null; updated_at: string }[];
        if (rows.length === 0) {
          setCartAbandonmentList([]);
          return;
        }
        const userIds = [...new Set(rows.map((r) => r.user_id))];
        const { data: profileData } = await supabase.from('profiles').select('id, name, email, telegram_id').in('id', userIds);
        const profileMap: Record<string, { name: string | null; email: string | null; telegram_id: string | null }> = {};
        (profileData ?? []).forEach((p: { id: string; name: string | null; email: string | null; telegram_id: string | null }) => {
          profileMap[p.id] = { name: p.name ?? null, email: p.email ?? null, telegram_id: p.telegram_id ?? null };
        });
        setCartAbandonmentList(
          rows.map((r) => ({
            ...r,
            name: profileMap[r.user_id]?.name ?? null,
            email: profileMap[r.user_id]?.email ?? null,
            telegram_id: profileMap[r.user_id]?.telegram_id ?? null,
          }))
        );
      })
      .finally(() => setCartAbandonmentLoading(false));
  }, [tab]);

  // 리뷰 관리 탭: 전체 리뷰 목록 (상품명·작성자·내용·사진·대댓글·포인트 지급 여부) + 특정 회원 필터
  useEffect(() => {
    if (tab !== 'reviewManagement' || !supabase) return;
    setReviewManagementLoading(true);
    let q = supabase
      .from('product_reviews')
      .select('id, product_id, user_id, rating, body, created_at, admin_reply, review_reward_points')
      .order('created_at', { ascending: false });
    if (reviewFilterUserId) {
      q = q.eq('user_id', reviewFilterUserId);
    }
    q.then(async ({ data: reviews, error }) => {
      if (error) {
        console.warn('[Admin] product_reviews load:', error.message);
        setReviewManagementList([]);
        return;
      }
      const list = (reviews ?? []) as {
        id: string;
        product_id: string;
        user_id: string;
        rating: number;
        body: string | null;
        created_at: string;
        admin_reply?: string | null;
        review_reward_points?: number;
      }[];
      if (list.length === 0) {
        setReviewManagementList([]);
        return;
      }
      const productIds = [...new Set(list.map((r) => r.product_id))];
      const userIds = [...new Set(list.map((r) => r.user_id))];
      const reviewIds = list.map((r) => r.id);
      const [{ data: prodData }, { data: profileData }, { data: photoData }] = await Promise.all([
        supabase.from('products').select('id, name').in('id', productIds),
        supabase.from('profiles').select('id, name, email').in('id', userIds),
        supabase.from('review_photos').select('review_id, image_url').in('review_id', reviewIds),
      ]);
      const productMap: Record<string, string> = {};
      (prodData ?? []).forEach((p: { id: string; name: string }) => {
        productMap[p.id] = p.name ?? '';
      });
      const profileMap: Record<string, { name: string | null; email: string | null }> = {};
      (profileData ?? []).forEach((p: { id: string; name: string | null; email: string | null }) => {
        profileMap[p.id] = { name: p.name ?? null, email: p.email ?? null };
      });
      const photosMap: Record<string, { image_url: string }[]> = {};
      (photoData ?? []).forEach((ph: { review_id: string; image_url: string }) => {
        if (!photosMap[ph.review_id]) photosMap[ph.review_id] = [];
        photosMap[ph.review_id].push({ image_url: ph.image_url });
      });
      setReviewManagementList(
        list.map((r) => ({
          id: r.id,
          product_id: r.product_id,
          product_name: productMap[r.product_id] ?? '',
          user_id: r.user_id,
          user_name: profileMap[r.user_id]?.name ?? null,
          user_email: profileMap[r.user_id]?.email ?? null,
          rating: r.rating,
          body: r.body,
          created_at: r.created_at,
          admin_reply: r.admin_reply ?? null,
          review_reward_points: r.review_reward_points ?? 0,
          review_photos: photosMap[r.id] ?? [],
        }))
      );
    }).finally(() => setReviewManagementLoading(false));
  }, [tab, supabase, reviewFilterUserId]);

  // 선택된 상품의 구성품 로드 (image_urls 있으면 사용, 없으면 [image_url]로 보정)
  useEffect(() => {
    if (!supabase || !selectedProduct?.id) {
      setComponents([]);
      return;
    }
    supabase
      .from('product_components')
      .select('id, product_id, sort_order, name, image_url, image_urls, description, layout')
      .eq('product_id', selectedProduct.id)
      .then(
        ({ data }) => {
          const rows = ((data as (Omit<ProductComponent, 'image_urls'> & { image_urls?: string[] | null })[]) ?? []).sort(
            (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
          );
          setComponents(
            rows.map((r) => ({
              ...r,
              image_urls:
                r.image_urls && Array.isArray(r.image_urls) && r.image_urls.length > 0 ? r.image_urls : r.image_url ? [r.image_url] : [],
              layout: (r as { layout?: 'image_left' | 'image_right' }).layout ?? 'image_left',
            }))
          );
        },
        () => setComponents([])
      );
  }, [selectedProduct?.id]);

  // 선택된 상품의 조회수·리뷰 통계 (상품 탭에서만 로드)
  useEffect(() => {
    if (!supabase || !isAdmin || tab !== 'products' || !selectedProduct?.id) {
      setProductStats(null);
      setProductReviews([]);
      setShowProductReviews(false);
      return;
    }
    const productId = selectedProduct.id;
    const loadStats = async () => {
      try {
        const [{ data: viewData }, { data: reviewData }] = await Promise.all([
          supabase.from('product_views').select('id').eq('product_id', productId),
          supabase.from('product_reviews').select('id, user_id, rating, body, created_at').eq('product_id', productId),
        ]);
        const rawReviews = (reviewData ?? []) as { id: string; user_id: string | null; rating: number; body: string | null; created_at: string }[];
        const reviewsSorted = rawReviews.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const viewCount = viewData?.length ?? 0;
        const reviewIds = reviewsSorted.map((r) => r.id);
        const userIds = [...new Set(reviewsSorted.map((r) => r.user_id).filter(Boolean))] as string[];
        let profilesMap: Record<string, { name: string | null; email: string | null }> = {};
        if (userIds.length > 0) {
          const { data: profileData } = await supabase.from('profiles').select('id, name, email').in('id', userIds);
          (profileData ?? []).forEach((p: { id: string; name: string | null; email: string | null }) => {
            profilesMap[p.id] = { name: p.name ?? null, email: p.email ?? null };
          });
        }
        let photosMap: Record<string, { image_url: string }[]> = {};
        if (reviewIds.length > 0) {
          const { data: photoData } = await supabase.from('review_photos').select('review_id, image_url').in('review_id', reviewIds);
          (photoData ?? []).forEach((ph: { review_id: string; image_url: string }) => {
            if (!photosMap[ph.review_id]) photosMap[ph.review_id] = [];
            photosMap[ph.review_id].push({ image_url: ph.image_url });
          });
        }
        const reviewRows: ProductReviewSummary[] = reviewsSorted.map((r) => ({
          id: r.id,
          user_id: r.user_id,
          user_name: r.user_id ? (profilesMap[r.user_id]?.name ?? null) : null,
          user_email: r.user_id ? (profilesMap[r.user_id]?.email ?? null) : null,
          rating: r.rating,
          body: r.body,
          created_at: r.created_at,
          review_photos: photosMap[r.id] ?? [],
        }));
        const reviewCount = reviewRows.length;
        const avgRating =
          reviewCount > 0
            ? reviewRows.reduce((sum, r) => sum + (r.rating ?? 0), 0) / reviewCount
            : null;
        const latestReviewAt =
          reviewCount > 0
            ? reviewRows.reduce<string | null>(
                (latest, r) => (!latest || r.created_at > latest ? r.created_at : latest),
                null
              )
            : null;
        setProductStats({
          viewCount,
          reviewCount,
          avgRating,
          latestReviewAt,
        });
        setProductReviews(reviewRows);
        setProductReviewPage(1);
      } catch (err) {
        console.error('Failed to load product stats', err);
        setProductStats(null);
        setProductReviews([]);
        setShowProductReviews(false);
      }
    };
    void loadStats();
  }, [supabase, isAdmin, tab, selectedProduct?.id]);

  // 회원 역할 변경 (관리자만): 회원 / 매니저(보기전용) / 관리자
  const handleUpdateMemberRole = async (memberId: string, role: 'member' | 'manager' | 'admin') => {
    if (!supabase || !canGrantPermission) return;
    if (role === 'admin' && !canGrantAdminRole) return;
    try {
      setUpdatingRoleUserId(memberId);
      setMembersError(null);
      const is_manager = role === 'manager';
      const is_admin = role === 'admin';
      const { error } = await supabase.from('profiles').update({ is_manager, is_admin, updated_at: new Date().toISOString() }).eq('id', memberId);
      if (error) {
        setMembersError(error.message || '역할 변경에 실패했습니다.');
        return;
      }
      setSaveSuccessAt(Date.now());
      setMembersRefreshTrigger((t) => t + 1);
    } catch (e) {
      console.error('[Admin] 역할 변경 오류:', e);
      setMembersError('역할 변경 중 오류가 발생했습니다.');
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  // 특별 멤버십 쿠폰 수동 지급 버튼 액션 (선택 회원 + 선택 금액)
  const handleGrantMembershipCoupons = async () => {
    if (!supabase || !canGrantPermission) return;
    try {
      setGrantingCoupons(true);
      setMembersError(null);
      if (selectedMemberIds.length === 0) {
        setMembersError('쿠폰을 지급할 회원을 먼저 선택하세요.');
        return;
      }
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const quarterLabel = `special-${now.getFullYear()}-${(now.getMonth() + 1)
        .toString()
        .padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
      const rows = selectedMemberIds.map((userId) => ({
        user_id: userId,
        amount: specialCouponAmount,
        tier: 'basic' as const,
        quarter_label: quarterLabel,
        expires_at: expiresAt,
      }));
      const { error } = await supabase.from('membership_coupons').insert(rows);
      if (error) {
        console.error('[Admin] 특별 쿠폰 insert 실패:', error);
        setMembersError('특별 쿠폰 지급에 실패했습니다. Supabase membership_coupons RLS/제약 조건을 확인하세요.');
        return;
      }
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.error('[Admin] 쿠폰 지급 중 오류:', e);
      setMembersError('쿠폰 지급 중 오류가 발생했습니다. 콘솔(F12)을 확인하세요.');
    } finally {
      setGrantingCoupons(false);
    }
  };

  // 분기 멤버십 쿠폰 일괄 지급 (기존 로직 유지)
  const handleGrantQuarterCoupons = async () => {
    if (!supabase || !canGrantPermission) return;
    try {
      setGrantingCoupons(true);
      setMembersError(null);
      const { error } = await supabase.rpc('grant_membership_coupons_for_quarter');
      if (error) {
        console.error('[Admin] grant_membership_coupons_for_quarter RPC 실패:', error);
        setMembersError('분기 쿠폰 지급에 실패했습니다. Supabase SQL 함수·RLS 설정을 확인하세요.');
        return;
      }
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.error('[Admin] 분기 쿠폰 지급 중 오류:', e);
      setMembersError('분기 쿠폰 지급 중 오류가 발생했습니다. 콘솔(F12)을 확인하세요.');
    } finally {
      setGrantingCoupons(false);
    }
  };

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
    if (!supabase || !selectedProduct || !canGrantPermission) return;
    setSavingProduct(true);
    setError(null);
    try {
      // 기본 스키마 + image_urls 배열을 함께 저장 (여러 장 썸네일 지원)
      // 텍스트로 대표 URL만 바꾼 경우에도 반영되도록 image_url 을 항상 image_urls와 병합
      let mainImages: string[] = [];
      if (Array.isArray(selectedProduct.image_urls) && selectedProduct.image_urls.length) {
        mainImages = selectedProduct.image_urls.filter((u): u is string => !!u);
      }
      if (selectedProduct.image_url) {
        if (!mainImages.includes(selectedProduct.image_url)) {
          mainImages = [selectedProduct.image_url, ...mainImages];
        } else {
          // 이미 배열 안에 있으면 순서만 앞쪽으로 정렬
          mainImages = [
            selectedProduct.image_url,
            ...mainImages.filter((u) => u !== selectedProduct.image_url),
          ];
        }
      }
      if (!mainImages.length) {
        mainImages = [];
      }
      const payload: Record<string, unknown> = {
        name: selectedProduct.name,
        category: selectedProduct.category,
        description: selectedProduct.description,
        image_url: mainImages[0] ?? null,
        image_urls: mainImages,
        rrp_price: selectedProduct.rrp_price,
        prp_price: selectedProduct.prp_price,
        is_active: selectedProduct.is_active ?? true,
        box_theme: selectedProduct.box_theme ?? 'brand',
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
        setOrderedProductIds((prev) => (prev.includes(productId) ? prev : [...prev, productId]));
      }
      // 구성품 저장: 기존 삭제 후 일괄 삽입 (layout 있으면 저장 — Supabase product_components에 layout 컬럼 추가 필요)
      const compPayload = components.map((c, i) => {
        const urls = c.image_urls?.length ? c.image_urls : c.image_url ? [c.image_url] : [];
        return {
          product_id: productId,
          sort_order: i,
          name: c.name || null,
          image_url: urls[0] || null,
          image_urls: urls,
          description: c.description || null,
          layout: c.layout ?? 'image_left',
        };
      });
      await supabase.from('product_components').delete().eq('product_id', productId);
      if (compPayload.length > 0) {
        await supabase.from('product_components').insert(compPayload);
      }
      const { data: prodData } = await supabase
        .from('products')
        .select('id, name, category, description, image_url, image_urls, rrp_price, prp_price, is_active, box_theme');
      if (prodData && Array.isArray(prodData)) {
        const raw = prodData as (Product & {
          image_urls?: string[];
          stock?: number;
          detail_description?: string | null;
          box_theme?: 'brand' | 'sky' | null;
        })[];
        const list = raw.slice().sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')).map((p) => ({
          ...p,
          image_urls: p.image_urls ?? (p.image_url ? [p.image_url] : []),
          stock: p.stock ?? null,
          detail_description: p.detail_description ?? null,
        })) as Product[];
        setProducts(list);
      }
      const { data: compData } = await supabase
        .from('product_components')
        .select('id, product_id, sort_order, name, image_url, image_urls, description, layout')
        .eq('product_id', productId);
      if (compData && Array.isArray(compData)) {
        const rows = (compData as (Omit<ProductComponent, 'image_urls'> & { image_urls?: string[] | null })[]).sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
        );
        setComponents(
          rows.map((r) => ({
            ...r,
            image_urls:
              r.image_urls && Array.isArray(r.image_urls) && r.image_urls.length > 0 ? r.image_urls : r.image_url ? [r.image_url] : [],
            layout: (r as { layout?: 'image_left' | 'image_right' }).layout ?? 'image_left',
          }))
        );
      }
      setError(null);
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.error(e);
      const message =
        e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string'
          ? (e as any).message
          : null;
      const text = message ? `상품 저장에 실패했습니다: ${message}` : '상품 저장에 실패했습니다.';
      setError(text);
      window.alert(text);
    } finally {
      setSavingProduct(false);
    }
  };

  /** 오른쪽 상품 추가/수정에서 선택한 상품을 DB에서 완전 삭제 (구성품·슬롯 참조 함께 정리) */
  const handleDeleteProduct = async () => {
    if (!supabase || !selectedProduct?.id || !canGrantPermission) return;
    if (!window.confirm('이 상품을 완전히 삭제하시겠습니까? 슬롯·구성품 정보도 함께 삭제됩니다.')) return;
    setSavingProduct(true);
    setError(null);
    const productId = selectedProduct.id;
    try {
      await supabase.from('product_components').delete().eq('product_id', productId);
      await supabase.from('main_layout_slots').delete().eq('product_id', productId);
      const { error: delErr } = await supabase.from('products').delete().eq('id', productId);
      if (delErr) throw delErr;
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setOrderedProductIds((prev) => prev.filter((id) => id !== productId));
      setSelectedProduct(null);
      setComponents([]);
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.error(e);
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message) : '삭제에 실패했습니다.';
      setError(msg);
      window.alert(msg);
    } finally {
      setSavingProduct(false);
    }
  };

  const handleComponentChange = (index: number, patch: Partial<ProductComponent>) => {
    setComponents((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    );
  };

  /** 구성품 항목 추가 — 새 상품(아직 id 없음)에서도 추가 가능, 저장 시 productId 반영 */
  const handleComponentAdd = () => {
    if (!selectedProduct) return;
    setComponents((prev) => [
      ...prev,
      {
        id: `new-${Date.now()}`,
        product_id: selectedProduct.id || 'temp',
        sort_order: prev.length,
        name: '',
        image_url: null,
        image_urls: [],
        description: null,
        layout: 'image_left',
      },
    ]);
  };

  /** 구성품 항목의 이미지 URL 목록에서 한 개 변경 (인덱스까지 없으면 빈 문자열로 채움) */
  const handleComponentImageUrlsChange = (compIdx: number, imgIdx: number, url: string) => {
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== compIdx) return c;
        const base = c.image_urls ?? (c.image_url ? [c.image_url] : []);
        const next = [...base];
        while (next.length <= imgIdx) next.push('');
        next[imgIdx] = url;
        return { ...c, image_urls: next };
      })
    );
  };

  /** 구성품 항목에 이미지 한 장 추가 */
  const handleComponentImageAdd = (compIdx: number) => {
    setComponents((prev) =>
      prev.map((c, i) => (i !== compIdx ? c : { ...c, image_urls: [...(c.image_urls ?? []), ''] }))
    );
  };

  /** 구성품 항목에서 이미지 한 장 제거 */
  const handleComponentImageRemove = (compIdx: number, imgIdx: number) => {
    setComponents((prev) =>
      prev.map((c, i) => {
        if (i !== compIdx) return c;
        const next = (c.image_urls ?? []).filter((_, idx) => idx !== imgIdx);
        return { ...c, image_urls: next };
      })
    );
  };

  const handleComponentRemove = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  };

  /** 대표 이미지 파일 선택 시 업로드 후 URL 반영 (최대 2장, 단순 버전). */
  const onMainImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files ? Array.from(input.files) : [];
    console.log('[onMainImageFileChange] 호출', {
      filesLength: files.length,
    });
    if (!selectedProduct) {
      window.alert('상품을 먼저 선택해 주세요.');
      input.value = '';
      return;
    }
    if (!files.length) {
      window.alert('선택된 파일이 없습니다.');
      input.value = '';
      return;
    }
    // 한 번 선택한 파일은 바로 비워서 같은 파일 재선택도 가능하게
    input.value = '';
    setError(null);
    setUploadingMainImage(true);
    try {
      const file = files[0];
      console.log('[onMainImageFileChange] 업로드 시도 파일', { name: file.name });
      const url = await uploadProductImage(file);
      if (!url) {
        const msg =
          '이미지 업로드에 실패했습니다. Supabase Storage "product-images" 버킷(Public) 및 INSERT 정책(authenticated)을 확인하세요. 관리자 로그인 상태인지도 확인하세요.';
        setError(msg);
        window.alert(msg);
        return;
      }

      // 기존 이미지 목록 + 새 이미지 → 마지막 2장만 사용
      const existing =
        (selectedProduct.image_urls && Array.isArray(selectedProduct.image_urls) && selectedProduct.image_urls.length
          ? selectedProduct.image_urls
          : selectedProduct.image_url
          ? [selectedProduct.image_url]
          : []) ?? [];
      const merged = [...existing, url];
      const maxImages = 2;
      const start = Math.max(0, merged.length - maxImages);
      const next = merged.slice(start);

      setSelectedProduct((prev) =>
        prev
          ? ({ ...prev, image_url: next[0] ?? null, image_urls: next } as Product)
          : prev
      );
      // 썸네일은 로컬 상태만 갱신. 저장 버튼 누를 때 함께 저장됨 (자동 저장/토스트 없음)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      window.alert(`에러 발생: ${msg}`);
    } finally {
      setUploadingMainImage(false);
    }
  };

  /** 구성품 이미지 파일 선택 시 새 구성품 항목으로 추가 (최대 6장). */
  const onComponentImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = input.files ? Array.from(input.files) : [];
    console.log('[onComponentImageFileChange] 호출', {
      filesLength: files.length,
      uploadIndex: componentUploadIndexRef.current,
    });
    if (!files.length) return;
    input.value = '';
    if (!selectedProduct) {
      window.alert('상품을 먼저 저장해 주세요.');
      return;
    }
    setError(null);
    // 구성품 업로드 시작: 인덱스를 0으로 두고 로딩 오버레이 표시
    setUploadingComponentIndex(0);
    try {
      const maxImages = 6;
      const currentCount = components.length;
      if (currentCount >= maxImages) {
        window.alert('구성품 이미지는 최대 6장까지입니다.');
        return;
      }
      const toAdd = Math.min(files.length, maxImages - currentCount);
      const newComponents: ProductComponent[] = [];
      for (let i = 0; i < toAdd; i++) {
        const file = files[i];
        console.log('[onComponentImageFileChange] 업로드 시도 파일', {
          index: i,
          name: file.name,
        });
        const url = await uploadProductImage(file);
        if (!url) {
          const msg =
            '이미지 업로드에 실패했습니다. Supabase Storage "product-images" 버킷(Public) 및 INSERT 정책을 확인하세요.';
          setError(msg);
          window.alert(msg);
          return;
        }
        newComponents.push({
          id: `comp-${Date.now()}-${i}`,
          product_id: selectedProduct.id || 'temp',
          sort_order: currentCount + newComponents.length,
          name: null,
          image_url: url,
          image_urls: [url],
          description: null,
        });
      }
      if (newComponents.length > 0) {
        setComponents((prev) => [...prev, ...newComponents].slice(0, maxImages));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      window.alert(`에러 발생: ${msg}`);
    } finally {
      setUploadingComponentIndex(-1);
    }
  };

  const startPreviewScroll = () => {
    const el = productPreviewRef.current;
    if (!el || previewScrollTimerRef.current != null) return;
    el.scrollTop = 0;
    previewScrollTimerRef.current = window.setInterval(() => {
      if (!el) return;
      const maxScroll = el.scrollHeight - el.clientHeight;
      if (el.scrollTop >= maxScroll) {
        if (previewScrollTimerRef.current != null) {
          window.clearInterval(previewScrollTimerRef.current);
          previewScrollTimerRef.current = null;
        }
        return;
      }
      el.scrollTop += 2;
    }, 16);
  };

  const stopPreviewScroll = () => {
    const el = productPreviewRef.current;
    if (previewScrollTimerRef.current != null) {
      window.clearInterval(previewScrollTimerRef.current);
      previewScrollTimerRef.current = null;
    }
    if (el) el.scrollTop = 0;
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

  /** 상품 목록 순서(orderedProductIds) 기준으로 슬롯 1~5 저장 — main_layout_slots에 반영 */
  const handleSaveSlotOrder = async () => {
    if (!supabase || !canGrantPermission) return;
    setSavingSlots(true);
    setError(null);
    try {
      const { data: existing } = await supabase.from('main_layout_slots').select('id');
      if (existing?.length) {
        const { error: delErr } = await supabase.from('main_layout_slots').delete().in('id', existing.map((r) => r.id));
        if (delErr) throw delErr;
      }
      const count = Math.min(5, Math.max(1, slotCount));
      const toInsert = Array.from({ length: count }, (_, i) => {
        const productId = orderedProductIds[i] ?? null;
        const prod = productId ? products.find((p) => p.id === productId) : null;
        return {
          slot_index: i,
          title: prod?.name ?? null,
          description: null,
          image_url: null,
          product_id: productId,
          link_url: null,
        };
      });
      const { error: insErr } = await supabase.from('main_layout_slots').insert(toInsert);
      if (insErr) throw insErr;
      const { data: slotData } = await supabase
        .from('main_layout_slots')
        .select('id, slot_index, title, description, image_url, product_id, link_url');
      const slotsSortedAfterSave = ((slotData ?? []) as { id: number; slot_index: number; title: string | null; description: string | null; image_url: string | null; product_id: string | null; link_url: string | null }[]).slice().sort((a, b) => a.slot_index - b.slot_index);
      if (slotsSortedAfterSave.length > 0) {
        setSlots(
          slotsSortedAfterSave.map((found) => ({
            id: found.id,
            slot_index: found.slot_index,
            title: found.title ?? '',
            description: found.description ?? '',
            image_url: found.image_url ?? null,
            product_id: found.product_id ?? null,
            link_url: found.link_url ?? '',
          }))
        );
        setSlotCount(slotsSortedAfterSave.length);
        const slotProductIds = slotsSortedAfterSave.map((s) => s.product_id).filter(Boolean) as string[];
        const restIds = products.map((p) => p.id).filter((id) => !slotProductIds.includes(id));
        setOrderedProductIds([...slotProductIds, ...restIds]);
      }
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.error(e);
      const msg =
        e && typeof e === 'object' && 'message' in e && typeof (e as any).message === 'string'
          ? (e as any).message
          : '슬롯 순서 저장에 실패했습니다.';
      setError(msg);
      window.alert(msg);
    } finally {
      setSavingSlots(false);
    }
  };

  /** 리뷰 관리: 리뷰 삭제 (관리자) */
  const handleReviewDelete = async (reviewId: string) => {
    if (!supabase || reviewActionLoading || !canGrantPermission) return;
    if (!window.confirm('이 리뷰를 삭제할까요? 사진도 함께 삭제됩니다.')) return;
    setReviewActionLoading(reviewId);
    try {
      const { error } = await supabase.from('product_reviews').delete().eq('id', reviewId);
      if (error) throw error;
      setReviewManagementList((prev) => prev.filter((r) => r.id !== reviewId));
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.warn(e);
      window.alert('삭제에 실패했습니다.');
    } finally {
      setReviewActionLoading(null);
    }
  };

  /** 리뷰 관리: 포인트 지급 (200 일반 / 500 특별) 후 review_reward_points 저장 */
  const handleReviewReward = async (reviewId: string, points: 200 | 500) => {
    if (!supabase || reviewActionLoading || !canGrantPermission) return;
    const row = reviewManagementList.find((r) => r.id === reviewId);
    if (!row || row.review_reward_points > 0) return;
    if (!window.confirm(`${points} 포인트를 지급할까요? (${row.user_name ?? row.user_email ?? row.user_id})`)) return;
    const defaultReply =
      points === 200
        ? 'Спасибо за подробный отзыв! Дарим 200 баллов.'
        : 'Ваш отзыв выбран как особенный. Дарим 500 баллов. Спасибо!';
    const rewardReply = window.prompt('Пояснение для пользователя (ответ к отзыву):', row.admin_reply ?? defaultReply);
    if (rewardReply === null) return;
    setReviewActionLoading(reviewId);
    try {
      const { error: upErr } = await supabase.rpc('apply_points_delta', {
        p_user_id: row.user_id,
        p_delta_points: points,
        p_reason: points === 500 ? 'review_reward_special' : 'review_reward_general',
        p_source_table: 'product_reviews',
        p_source_id: reviewId,
        p_metadata: {
          product_id: row.product_id,
        },
      });
      if (upErr) throw upErr;
      const { error: revErr } = await supabase
        .from('product_reviews')
        .update({ review_reward_points: points, admin_reply: rewardReply.trim() || defaultReply })
        .eq('id', reviewId);
      if (revErr) throw revErr;
      setReviewManagementList((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, review_reward_points: points, admin_reply: rewardReply.trim() || defaultReply } : r
        )
      );
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.warn(e);
      window.alert('포인트 지급에 실패했습니다.');
    } finally {
      setReviewActionLoading(null);
    }
  };

  /** 리뷰 관리: 대댓글(admin_reply) 저장 */
  const handleReviewReplySave = async (reviewId: string, text: string) => {
    if (!supabase || reviewActionLoading || !canGrantPermission) return;
    setReviewActionLoading(reviewId);
    try {
      const { error } = await supabase.from('product_reviews').update({ admin_reply: text.trim() || null }).eq('id', reviewId);
      if (error) throw error;
      setReviewManagementList((prev) => prev.map((r) => (r.id === reviewId ? { ...r, admin_reply: text.trim() || null } : r)));
      setEditingReplyId(null);
      setEditingReplyText('');
      setSaveSuccessAt(Date.now());
    } catch (e) {
      console.warn(e);
      window.alert('대댓글 저장에 실패했습니다.');
    } finally {
      setReviewActionLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-brand-soft/40">
      <main className="relative mx-auto max-w-[96rem] px-4 py-8 sm:px-6 sm:py-10">
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
            상품관리
          </button>
          <button
            type="button"
            onClick={() => setTab('skinMatch')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'skinMatch' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            테스트 매칭
          </button>
          <button
            type="button"
            onClick={() => setTab('promo')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'promo' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            프로모
          </button>
          <button
            type="button"
            onClick={() => setTab('orders')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'orders' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            주문
          </button>
          <button
            type="button"
            onClick={() => setTab('activityLogs')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'activityLogs' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            활동 로그
          </button>
          <button
            type="button"
            onClick={() => setTab('cartAbandonment')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'cartAbandonment' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            장바구니 이탈
          </button>
          <button
            type="button"
            onClick={() => setTab('reviewManagement')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'reviewManagement' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            리뷰 관리
          </button>
          <button
            type="button"
            onClick={() => setTab('members')}
            className={`rounded-full px-3 py-1.5 ${
              tab === 'members' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            가입회원 관리
          </button>
        </nav>
      </header>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {/* 저장 성공 토스트 — 3초 후 자동 사라짐 */}
      {saveSuccessAt != null && (
        <div
          className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-xl bg-slate-800 px-6 py-3 text-sm font-medium text-white shadow-lg"
          role="alert"
        >
          저장되었습니다.
        </div>
      )}

      {/* 이미지 업로드 중 로딩 오버레이 */}
      {(uploadingMainImage || uploadingComponentIndex !== -1) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/30">
          <div className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-lg">
            이미지를 업로드하고 있습니다…
          </div>
        </div>
      )}

      {tab === 'dashboard' && (
        <section className="space-y-6">
          {/* 대시보드 제목 + 통합 기간(일/주/월). 매출·트래픽 차트 모두 이 기간 적용 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-slate-900">기간별 매출, 트래픽, 주문</h2>
            <div className="flex rounded-full bg-slate-100 p-0.5 text-sm">
              {(['day', 'week', 'month'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setDashboardPeriod(p);
                    setTrafficPeriod(p);
                  }}
                  className={`rounded-full px-3 py-1.5 ${
                    dashboardPeriod === p ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p === 'day' && '일'}
                  {p === 'week' && '주'}
                  {p === 'month' && '월'}
                </button>
              ))}
            </div>
          </div>

          {/* KPI 카드: 매출·주문 수·트래픽(선택 기간 합계) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">매출</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {formatNumber((dashboardKpi?.totalRevenueCents ?? 0) / 100) + ' ₽'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  주문 합계
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-blue-600">누계 매출</p>
                <p className="mt-0.5 text-lg font-semibold text-blue-600">
                  {formatNumber((dashboardKpi?.totalRevenueCentsAllTime ?? 0) / 100)} ₽
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">주문 수</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">{dashboardKpi?.orderCount ?? 0}</p>
                <p className="mt-0.5 text-xs text-slate-500">전체 주문</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-blue-600">누계 주문 수</p>
                <p className="mt-0.5 text-lg font-semibold text-blue-600">
                  {(dashboardKpi?.orderCountAllTime ?? 0).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:col-span-2 lg:col-span-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">트래픽</p>
                <p className="mt-1 text-2xl font-semibold text-slate-900">
                  {trafficChartData.reduce((s, d) => s + d.total, 0).toLocaleString('ko-KR')}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">선택 기간 방문자 합계</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-blue-600">누계 트래픽</p>
                <p className="mt-0.5 text-lg font-semibold text-blue-600">
                  {(dashboardKpi?.trafficAllTime ?? 0).toLocaleString('ko-KR')}
                </p>
              </div>
            </div>
          </div>

          {/* 한 행에 매출(앞/왼쪽) + 트래픽(뒤/오른쪽), 각 7일 기준 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 매출/수량 꺾은선 그래프: 상단 통합 기간(일/주/월) 적용. 수량/금액·상품 필터만 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="min-h-[72px]">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">기간별 매출 / 수량</h3>
                <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-slate-100 p-0.5">
                  <button
                    type="button"
                    onClick={() => setDashboardMetric('quantity')}
                    className={`rounded-full px-3 py-1.5 text-sm ${dashboardMetric === 'quantity' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    수량
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardMetric('revenue')}
                    className={`rounded-full px-3 py-1.5 text-sm ${dashboardMetric === 'revenue' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                  >
                    금액
                  </button>
                </span>
                <select
                  value={selectedChartProduct}
                  onChange={(e) => setSelectedChartProduct(e.target.value)}
                  className={inputClass + ' max-w-[200px]'}
                >
                  <option value="">전체</option>
                  {(dashboardKpi?.products ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.id}
                    </option>
                  ))}
                </select>
              </div>
              </div>
              {chartData.length > 0 ? (
                <div className="h-[280px] min-h-[220px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 28, right: 20, left: 40, bottom: 24 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#64748b" />
                      <YAxis
                        tick={false}
                        stroke="#64748b"
                        width={24}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          dashboardMetric === 'revenue' ? formatNumber(value) + ' ₽' : String(value),
                          dashboardMetric === 'revenue' ? '매출' : '수량',
                        ]}
                        labelFormatter={(label) => label}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }}
                        itemStyle={{ fontSize: 10 }}
                        labelStyle={{ fontSize: 10 }}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="var(--color-brand, #0d9488)"
                        strokeWidth={2}
                        dot={{ r: 4, fill: 'var(--color-brand, #0d9488)' }}
                        name={dashboardMetric === 'revenue' ? '매출' : '수량'}
                      >
                        <LabelList
                          dataKey="value"
                          position="top"
                          formatter={(v: number) => (dashboardMetric === 'revenue' ? formatNumber(v) : String(v))}
                          className="fill-slate-600"
                          style={{ fontSize: 9 }}
                          offset={6}
                        />
                      </Line>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="py-8 text-center text-slate-400">선택한 기간에 데이터가 없습니다.</p>
              )}
            </div>

            {/* 사이트 트래픽: 왼쪽 매출과 동일 높이·여백. 레전드 좌측 상단 */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="min-h-[72px]">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">사이트 트래픽 (합계 · 로그인 · 비로그인)</h3>
                <p className="text-xs text-slate-500">
                  위에서 선택한 기간(일/주/월)으로 표시됩니다. 레전드 클릭으로 라인을 끄거나 켤 수 있습니다.
                </p>
              </div>
              <div className="h-[280px] min-h-[220px] w-full min-w-0">
                {trafficChartData.length === 0 ? (
                  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50">
                    <p className="text-sm text-slate-400">데이터 없음 (site_visits 테이블 적용 후 방문 기록이 쌓이면 표시됩니다)</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trafficChartData} margin={{ top: 52, right: 20, left: 40, bottom: 24 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="#64748b" />
                      <YAxis tick={{ fontSize: 10 }} stroke="#64748b" width={42} allowDecimals={false} />
                      <Tooltip
                        formatter={(value: number | undefined, name: string | undefined) => [value ?? 0, name ?? '']}
                        labelFormatter={(label) => label}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: 11 }}
                        itemStyle={{ fontSize: 10 }}
                        labelStyle={{ fontSize: 10 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 11, marginBottom: 10 }} align="right" verticalAlign="top" />
                      <Line
                        type="monotone"
                        dataKey="total"
                        stroke="var(--color-brand, #0d9488)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'var(--color-brand, #0d9488)' }}
                        name="합계"
                      />
                      <Line
                        type="monotone"
                        dataKey="loggedIn"
                        stroke="#2563eb"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#2563eb' }}
                        name="로그인"
                      />
                      <Line
                        type="monotone"
                        dataKey="anonymous"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#94a3b8' }}
                        name="비로그인"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* 상품별 통합 테이블: 기간별 매출·주문·조회·리뷰 + 누계 + 현시점 재고 */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h3 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
              상품별 매출·주문·조회·리뷰 (기간 / 누계 / 재고)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-700">상품</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">매출</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">주문수</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">조회수</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">리뷰수</th>
                    <th className="px-4 py-2 text-right font-medium text-blue-600">누계 매출</th>
                    <th className="px-4 py-2 text-right font-medium text-blue-600">누계 주문수</th>
                    <th className="px-4 py-2 text-right font-medium text-blue-600">누계 조회수</th>
                    <th className="px-4 py-2 text-right font-medium text-blue-600">누계 리뷰수</th>
                    <th className="px-4 py-2 text-right font-medium text-slate-700">현시점 재고수량</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboardKpi?.products ?? []).map((p) => (
                    <tr key={p.id} className="border-b border-slate-50">
                      <td className="px-4 py-2 text-slate-800">{p.name}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatNumber(p.revenueCents / 100)} ₽</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.orderCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.viewCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.reviewCount}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-blue-600">{formatNumber(p.revenueCentsAllTime / 100)} ₽</td>
                      <td className="px-4 py-2 text-right tabular-nums text-blue-600">{p.orderCountAllTime}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-blue-600">{p.viewCountAllTime}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-blue-600">{p.reviewCountAllTime}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{p.stock}</td>
                    </tr>
                  ))}
                  {(!dashboardKpi?.products?.length) && (
                    <tr>
                      <td colSpan={10} className="px-4 py-6 text-center text-slate-400">데이터 없음</td>
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
          <div className="relative rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">상품 목록</h2>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCatalogPreviewOpen((v) => !v)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand"
                >
                  미리보기
                </button>
                <button
                  type="button"
                  onClick={handleSaveSlotOrder}
                  disabled={savingSlots || !canGrantPermission}
                  className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {savingSlots ? '저장 중…' : '슬롯 순서 저장'}
                </button>
              </div>
            </div>
            {catalogPreviewOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 bg-slate-900/40"
                  aria-hidden
                  onClick={() => setCatalogPreviewOpen(false)}
                />
                <div className="fixed left-1/2 top-1/2 z-50 w-[min(95vw,42rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 flex flex-col rounded-xl border border-slate-200 bg-white shadow-xl">
                  <div className="shrink-0 flex items-center justify-between border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">카탈로그 미리보기 (저장 전)</p>
                    <button
                      type="button"
                      onClick={() => setCatalogPreviewOpen(false)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      aria-label="닫기"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="shrink-0 px-4 pt-2 pb-3 text-xs text-slate-500">현재 순서·슬롯 개수대로 저장 시 카탈로그에 이렇게 노출됩니다.</p>
                  <div className="min-h-0 shrink overflow-auto px-4 pb-4">
                    {slotCount === 0 ? (
                      <p className="py-6 text-center text-xs text-slate-400">슬롯 개수를 1 이상으로 선택하면 미리보기가 표시됩니다.</p>
                    ) : (
                      <div
                        className="grid gap-2 sm:gap-3"
                        style={{ gridTemplateColumns: `repeat(${Math.min(slotCount, 5)}, minmax(0, 1fr))` }}
                      >
                        {(orderedProductIds.length ? orderedProductIds : products.map((p) => p.id))
                          .slice(0, slotCount)
                          .map((productId) => {
                            const p = products.find((pr) => pr.id === productId);
                            if (!p) return null;
                            const theme = (p.box_theme ?? 'brand') === 'sky' ? 'sky' : 'brand';
                            const rrp = p.rrp_price != null ? Number(p.rrp_price) : null;
                            const prp = p.prp_price != null ? Number(p.prp_price) : p.rrp_price != null ? Number(p.rrp_price) : null;
                            return (
                              <article
                                key={p.id}
                                className={`flex min-w-0 flex-col overflow-hidden rounded-xl border px-2 py-3 sm:px-3 sm:py-4 ${
                                  theme === 'sky' ? 'border-sky-200 bg-sky-50/60' : 'border-brand/20 bg-brand-soft/25'
                                }`}
                              >
                                <p className={`min-w-0 truncate text-[11px] font-medium leading-tight sm:text-xs ${theme === 'sky' ? 'text-sky-700' : 'text-brand'}`}>
                                  {p.name || '—'}
                                </p>
                                <div className="mt-2 aspect-square w-full min-h-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white/80 sm:mt-3">
                                  {p.image_url ? (
                                    <img src={p.image_url} alt="" className="h-full w-full object-contain" />
                                  ) : (
                                    <span className="flex h-full items-center justify-center text-[10px] text-slate-400">이미지 없음</span>
                                  )}
                                </div>
                                <div className="mt-2 flex min-w-0 flex-col gap-0.5 sm:mt-3">
                                  {rrp != null && prp != null && (
                                    <span className="whitespace-nowrap text-[11px] text-slate-500 line-through sm:text-xs">
                                      {formatNumber(rrp)} руб.
                                    </span>
                                  )}
                                  <span className="whitespace-nowrap text-xs font-semibold text-slate-900 sm:text-sm">
                                    {prp != null ? `${formatNumber(prp)} руб.` : '—'}
                                  </span>
                                </div>
                                <div
                                  className={`mt-2 w-full shrink-0 rounded-full py-2 text-center text-[11px] font-semibold text-white sm:mt-3 sm:py-2.5 sm:text-xs ${
                                    theme === 'sky' ? 'bg-sky-600' : 'bg-brand'
                                  }`}
                                >
                                  <span className="whitespace-nowrap">В корзину</span>
                                </div>
                              </article>
                            );
                          })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            <p className="mb-2 text-xs text-slate-500">
              드래그해서 순서를 바꾸면 쇼핑 페이지(뷰티박스 메뉴) 노출 순서가 바뀝니다. 아래에서 슬롯 개수를 선택하거나, 슬롯 추가/삭제 시 자동으로 반영됩니다. 위에서 1~{slotCount}개가 카탈로그에 노출됩니다.
            </p>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-600">슬롯 개수:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSlotCount(n)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    slotCount === n ? 'bg-brand text-white' : 'border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand'
                  }`}
                >
                  {n}
                </button>
              ))}
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
                    box_theme: 'brand',
                  })
                }
                className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand"
              >
                새 상품
              </button>
            </div>
            <ul className="divide-y divide-slate-100 text-sm">
              {(orderedProductIds.length ? orderedProductIds : products.map((p) => p.id)).map((productId, index) => {
                const p = products.find((pr) => pr.id === productId);
                if (!p) return null;
                const slotNum = index + 1;
                const isSlot = slotNum <= slotCount;
                return (
                  <li
                    key={p.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', String(index));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromIdx = Number(e.dataTransfer.getData('text/plain'));
                      if (fromIdx === index) return;
                      const toSlotNum = index + 1;
                      setOrderedProductIds((prev) => {
                        const list = [...prev];
                        const [moved] = list.splice(fromIdx, 1);
                        list.splice(index, 0, moved);
                        return list;
                      });
                      setSlotCount((prev) => (toSlotNum > prev ? Math.min(5, toSlotNum) : prev));
                    }}
                    className="flex cursor-move items-center gap-2 px-2 py-2 hover:bg-slate-50"
                    onClick={(ev) => { if ((ev.target as HTMLElement).closest('button')) return; setSelectedProduct(p); }}
                  >
                    {isSlot && (
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-600"
                        aria-label={`슬롯 ${slotNum}`}
                      >
                        {slotNum}
                      </span>
                    )}
                    {!isSlot && <span className="w-7 shrink-0" />}
                    <div className="min-w-0 flex-1">
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
                    </div>
                  </li>
                );
              })}
              {products.length === 0 && (
                <li className="px-2 py-4 text-xs text-slate-400">
                  등록된 상품이 없습니다.
                  <span className="mt-2 block text-amber-600">
                    쇼핑 페이지에는 보이는데 여기만 비었다면 Supabase → Table Editor → products → RLS에서 &quot;authenticated&quot; 사용자 SELECT 허용 정책을 추가하세요.
                  </span>
                </li>
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">상품추가/수정</h2>
              {selectedProduct && (
                <div className="flex shrink-0 items-center gap-2">
                  {selectedProduct.id && (
                    <button
                      type="button"
                      onClick={handleDeleteProduct}
                      disabled={savingProduct || !canGrantPermission}
                      className="rounded-full border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      제품 삭제
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveProduct}
                    disabled={savingProduct || !canGrantPermission}
                    className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-60"
                  >
                    {savingProduct ? '저장 중…' : '저장'}
                  </button>
                </div>
              )}
            </div>
            {selectedProduct && (
              <div className="space-y-4 text-sm">
                {/* 선택된 상품 한눈에 보기: 조회수·주문·재고·리뷰 — 4열 동일 높이로 맞춤 */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 lg:grid-cols-4">
                  <div className="flex min-h-[4rem] flex-col">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">조회수</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      {productStats ? formatNumber(productStats.viewCount) : '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">상품 상세 페이지 진입 횟수</p>
                  </div>
                  <div className="flex min-h-[4rem] flex-col">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">주문 수</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">—</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">주문 연동은 추후 확장 예정</p>
                  </div>
                  <div className="flex min-h-[4rem] flex-col">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">최근 주문</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">—</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">주문 데이터 연동 후 표시</p>
                  </div>
                  <div className="flex min-h-[4rem] flex-col">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">재고 · 리뷰</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">
                      재고 {formatNumber(Number(selectedProduct.stock ?? 0))}개
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      <button
                        type="button"
                        className="text-left underline-offset-2 hover:underline"
                        onClick={() => {
                          if (!selectedProduct?.id) return;
                          setProductReviewPage(1);
                          setShowProductReviews(true);
                        }}
                      >
                        리뷰 {productStats ? productStats.reviewCount : 0}개
                        {productStats?.avgRating != null && (
                          <span className="ml-1 text-amber-500">· ★ {productStats.avgRating.toFixed(1)}</span>
                        )}
                      </button>
                    </p>
                  </div>
                </div>

                {showProductReviews && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="font-semibold">리뷰 상세 (해당 제품 상세페이지 리뷰)</p>
                      {selectedProduct?.id && (
                        <Link
                          to={`/product/${selectedProduct.id}#product-reviews`}
                          className="rounded-full border border-brand bg-white px-3 py-1.5 text-xs font-medium text-brand hover:bg-brand/5"
                        >
                          제품 상세페이지에서 보기
                        </Link>
                      )}
                    </div>
                    {productReviews.length === 0 && <p className="py-6 text-center text-slate-400">아직 리뷰가 없습니다.</p>}
                    {productReviews.length > 0 && (
                      <>
                        <ul className="space-y-3">
                          {productReviews
                            .slice((productReviewPage - 1) * 10, productReviewPage * 10)
                            .map((r) => (
                              <li key={r.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                  <span className="font-medium text-slate-800">
                                    {r.user_name || r.user_email || '—'}
                                  </span>
                                  <span className="text-[11px] text-slate-500">
                                    {new Date(r.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                                  </span>
                                </div>
                                <div className="mt-2 flex items-center gap-1 text-amber-500">
                                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                                </div>
                                {r.body && <p className="mt-2 text-slate-700">{r.body}</p>}
                                {r.review_photos && r.review_photos.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {r.review_photos.map((ph, i) => (
                                      <a
                                        key={i}
                                        href={ph.image_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-white"
                                      >
                                        <img src={ph.image_url} alt="" className="h-full w-full object-cover" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </li>
                            ))}
                        </ul>
                        {productReviews.length > 10 && (
                          <div className="mt-3 flex items-center justify-center gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              disabled={productReviewPage <= 1}
                              onClick={() => setProductReviewPage((p) => Math.max(1, p - 1))}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] disabled:opacity-40"
                            >
                              Назад
                            </button>
                            <span className="text-[11px] text-slate-500">
                              {productReviewPage} / {Math.ceil(productReviews.length / 10)}
                            </span>
                            <button
                              type="button"
                              disabled={productReviewPage >= Math.ceil(productReviews.length / 10)}
                              onClick={() => setProductReviewPage((p) => p + 1)}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] disabled:opacity-40"
                            >
                              Вперёд
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
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
                    <label className={labelClass}>제품 박스 색상 (Beauty Box 메뉴 카드)</label>
                    <select
                      className={inputClass}
                      value={selectedProduct.box_theme ?? 'brand'}
                      onChange={(e) => handleProductField('box_theme', e.target.value as 'brand' | 'sky')}
                    >
                      <option value="brand">주황색 (기본)</option>
                      <option value="sky">연하늘색 (패밀리 케어)</option>
                    </select>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
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
                </div>

                {/* ① 썸네일·상세 페이지 대표 이미지 (최대 2장) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <label className={`${labelClass} font-semibold text-slate-800`}>
                    ① 썸네일·상세 페이지 대표 이미지 (최대 2장)
                  </label>
                  <p className="mb-2 text-xs text-slate-500">
                    쇼핑/상세 페이지에 쓰이는 대표 사진입니다. 최대 2장까지 업로드할 수 있고, 아래에서 순서를 바꿀 수 있습니다.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={mainImageInputRef}
                    className="hidden"
                    onChange={onMainImageFileChange}
                  />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-12">
                    <div className="flex-1 space-y-3 sm:basis-1/3 sm:max-w-xs">
                      <input
                        type="url"
                        className={inputClass}
                        value={selectedProduct.image_url ?? ''}
                        onChange={(e) => handleProductField('image_url', e.target.value || null)}
                        placeholder="https://... 또는 아래 버튼으로 업로드 (첫 번째 이미지)"
                      />
                      <button
                        type="button"
                        onClick={() => mainImageInputRef.current?.click()}
                        disabled={uploadingMainImage}
                        className="w-full rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-700 hover:border-brand hover:text-brand disabled:opacity-60"
                      >
                        {uploadingMainImage ? '업로드 중…' : '파일 올리기'}
                      </button>
                    </div>
                    <div className="mt-4 shrink-0 space-y-2 sm:mt-0 sm:flex-1 sm:basis-2/3 sm:pl-16">
                      <p className="text-xs text-slate-500">이미지 순서 (1 → 2)</p>
                      <div className="flex flex-wrap gap-2">
                        {(selectedProduct.image_urls && selectedProduct.image_urls.length
                          ? selectedProduct.image_urls.slice(0, 2)
                          : selectedProduct.image_url
                          ? [selectedProduct.image_url]
                          : []
                        ).map((url, idx, arr) => (
                          <div key={idx} className="flex flex-col items-center gap-1">
                            <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              <img
                                src={url}
                                alt={`썸네일 ${idx + 1}`}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <span className="absolute left-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-[10px] font-semibold text-white">
                                {idx + 1}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() =>
                                  setSelectedProduct((prev) => {
                                    if (!prev) return prev;
                                    const list =
                                      (prev.image_urls && prev.image_urls.length
                                        ? [...prev.image_urls]
                                        : prev.image_url
                                        ? [prev.image_url]
                                        : []) ?? [];
                                    if (idx === 0 || idx >= list.length) return prev;
                                    const tmp = list[idx - 1];
                                    list[idx - 1] = list[idx];
                                    list[idx] = tmp;
                                    return {
                                      ...prev,
                                      image_url: list[0] ?? null,
                                      image_urls: list,
                                    } as Product;
                                  })
                                }
                                className="rounded-full border border-slate-200 px-1 text-[10px] text-slate-600 disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={idx === arr.length - 1}
                                onClick={() =>
                                  setSelectedProduct((prev) => {
                                    if (!prev) return prev;
                                    const list =
                                      (prev.image_urls && prev.image_urls.length
                                        ? [...prev.image_urls]
                                        : prev.image_url
                                        ? [prev.image_url]
                                        : []) ?? [];
                                    if (idx === list.length - 1 || idx >= list.length) return prev;
                                    const tmp = list[idx + 1];
                                    list[idx + 1] = list[idx];
                                    list[idx] = tmp;
                                    return {
                                      ...prev,
                                      image_url: list[0] ?? null,
                                      image_urls: list,
                                    } as Product;
                                  })
                                }
                                className="rounded-full border border-slate-200 px-1 text-[10px] text-slate-600 disabled:opacity-40"
                              >
                                ↓
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedProduct((prev) => {
                                  if (!prev) return prev;
                                  const list =
                                    (prev.image_urls && prev.image_urls.length
                                      ? [...prev.image_urls]
                                      : prev.image_url
                                      ? [prev.image_url]
                                      : []) ?? [];
                                  if (idx < 0 || idx >= list.length) return prev;
                                  list.splice(idx, 1);
                                  return {
                                    ...prev,
                                    image_url: list[0] ?? null,
                                    image_urls: list,
                                  } as Product;
                                })
                              }
                              className="text-[10px] text-red-600 hover:underline"
                            >
                              삭제
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ② 상세 페이지 구성품 이미지 (최대 6장) */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <label className={`${labelClass} font-semibold text-slate-800`}>
                      ② 상세 페이지 구성품 이미지 (최대 6장)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        componentUploadIndexRef.current = -1;
                        componentImageInputRef.current?.click();
                      }}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand hover:text-brand"
                    >
                      + 사진 추가
                    </button>
                  </div>
                  <p className="mb-3 text-xs text-slate-500">
                    상세 페이지 하단 구성품 그리드. 항목당 사진 여러 장 넣을 수 있습니다.
                  </p>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    ref={componentImageInputRef}
                    className="hidden"
                    onChange={onComponentImageFileChange}
                  />
                  <div className="mt-2">
                    {components.length === 0 && (
                      <p className="py-2 text-center text-xs text-slate-400">구성품을 추가하세요.</p>
                    )}
                    {components.length > 0 && (
                      <div className="flex flex-col gap-3">
                        {components.map((comp, idx, arr) => {
                          const url =
                            (comp.image_urls && comp.image_urls.length
                              ? comp.image_urls[0]
                              : comp.image_url) ?? '';
                          return (
                            <div key={comp.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-start sm:gap-4">
                              <div className="flex shrink-0 items-center gap-2">
                                <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  {url && (
                                    <img
                                      src={url}
                                      alt={`구성품 ${idx + 1}`}
                                      className="h-full w-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                      }}
                                    />
                                  )}
                                  <span className="absolute left-1 top-1 rounded-full bg-slate-900/70 px-1.5 text-[10px] font-semibold text-white">
                                    {idx + 1}
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <select
                                    value={comp.layout ?? 'image_left'}
                                    onChange={(e) => handleComponentChange(idx, { layout: e.target.value as 'image_left' | 'image_right' })}
                                    className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                    title="상세페이지 «Подробнее о составе» 블록 배치"
                                  >
                                    <option value="image_left">왼쪽 사진 / 오른쪽 텍스트</option>
                                    <option value="image_right">왼쪽 텍스트 / 오른쪽 사진</option>
                                  </select>
                                  <div className="flex gap-1">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() =>
                                        setComponents((prev) => {
                                          const list = [...prev];
                                          if (idx === 0) return prev;
                                          const tmp = list[idx - 1];
                                          list[idx - 1] = list[idx];
                                          list[idx] = tmp;
                                          return list;
                                        })
                                      }
                                      className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 disabled:opacity-40"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === arr.length - 1}
                                      onClick={() =>
                                        setComponents((prev) => {
                                          const list = [...prev];
                                          if (idx === list.length - 1) return prev;
                                          const tmp = list[idx + 1];
                                          list[idx + 1] = list[idx];
                                          list[idx] = tmp;
                                          return list;
                                        })
                                      }
                                      className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600 disabled:opacity-40"
                                    >
                                      ↓
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleComponentRemove(idx)}
                                    className="text-left text-[10px] text-red-600 hover:underline"
                                  >
                                    삭제
                                  </button>
                                </div>
                              </div>
                              <div className="min-w-0 flex-1 space-y-1">
                                <input
                                  type="text"
                                  placeholder="이름 (상세 블록 제목)"
                                  className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-800"
                                  value={comp.name ?? ''}
                                  onChange={(e) => handleComponentChange(idx, { name: e.target.value || null })}
                                />
                                <textarea
                                  placeholder="설명 (상세 블록 오른쪽/왼쪽 텍스트)"
                                  className="min-h-[60px] w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-700"
                                  value={comp.description ?? ''}
                                  onChange={(e) => handleComponentChange(idx, { description: e.target.value || null })}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'skinMatch' && (
        <section className="mt-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">테스트 결과–상품 매칭</h2>
            <p className="mb-4 text-xs text-slate-500">
              피부 타입을 아래 슬롯으로 드래그하면, 해당 타입 결과일 때 그 슬롯의 상품 상세로 연결됩니다. 슬롯 개수·상품은 상품관리 탭과 동일합니다. 저장 버튼을 눌러 반영하세요.
            </p>
            {skinMatchLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
            ) : (
              <>
                {/* 매칭되지 않은 피부 타입: 위쪽 긴 직사각형 */}
                <div
                  className="mb-4 flex min-h-[3.5rem] flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-100/80 px-4 py-3"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData('text/plain');
                    try {
                      const { type, fromSlot } = JSON.parse(raw) as { type: string; fromSlot: number };
                      if (!type) return;
                      if (fromSlot === 0) return; // 이미 미매칭
                      setSkinMatchSlotTypes((prev) => {
                        const next = { ...prev };
                        next[fromSlot] = (next[fromSlot] ?? []).filter((t) => t !== type);
                        return next;
                      });
                      setUnmatchedTypes((prev) => (prev.includes(type) ? prev : [...prev, type]));
                    } catch {
                      // ignore
                    }
                  }}
                >
                  <span className="mr-2 shrink-0 text-xs font-semibold text-slate-500">매칭되지 않은 피부 타입</span>
                  {unmatchedTypes.map((type) => (
                    <span
                      key={type}
                      draggable
                      onDragStart={(ev) => {
                        ev.dataTransfer.setData('text/plain', JSON.stringify({ type, fromSlot: 0 }));
                        ev.dataTransfer.effectAllowed = 'move';
                      }}
                      className="cursor-grab rounded-full bg-slate-400 px-2.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing"
                    >
                      {type}
                    </span>
                  ))}
                </div>

                {/* 슬롯 1~5: 활성 개수만 드롭 가능, 나머지는 회색·비활성 */}
                {slots.length === 0 ? (
                  <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-800">
                    슬롯이 없습니다. 상품관리 탭에서 슬롯 개수를 선택하고 「슬롯 순서 저장」을 누르면 슬롯이 생성됩니다.
                  </p>
                ) : (
                  <div className="mb-4 flex flex-wrap gap-3">
                    {([1, 2, 3, 4, 5] as const).map((slotNum) => {
                      const isActive = slotNum <= slots.length;
                      const slotInfo = slots[slotNum - 1];
                      const productName = slotInfo?.product_id ? products.find((p) => p.id === slotInfo.product_id)?.name ?? slotInfo?.title : slotInfo?.title;
                      const slotLabel = productName ? `슬롯 ${slotNum} (${productName})` : `슬롯 ${slotNum}`;
                      return (
                        <div
                          key={slotNum}
                          className={`min-w-[7rem] flex-1 rounded-lg border-2 border-dashed p-3 ${
                            isActive
                              ? 'border-slate-200 bg-slate-50/50'
                              : 'cursor-not-allowed border-slate-100 bg-slate-100/60 opacity-70'
                          }`}
                          onDragOver={isActive ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } : undefined}
                          onDrop={isActive ? (e) => {
                            e.preventDefault();
                            const raw = e.dataTransfer.getData('text/plain');
                            try {
                              const { type, fromSlot } = JSON.parse(raw) as { type: string; fromSlot: number };
                              if (!type) return;
                              setSkinMatchSlotTypes((prev) => {
                                const next = { ...prev };
                                if (fromSlot > 0) next[fromSlot] = (next[fromSlot] ?? []).filter((t) => t !== type);
                                next[slotNum] = [...(next[slotNum] ?? []), type];
                                return next;
                              });
                              if (fromSlot === 0) setUnmatchedTypes((prev) => prev.filter((t) => t !== type));
                            } catch {
                              // ignore
                            }
                          } : undefined}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className={`text-xs font-semibold ${isActive ? 'text-slate-600' : 'text-slate-400'}`}>
                              {slotLabel}
                              {!isActive && ' (비활성)'}
                            </p>
                            {isActive && (skinMatchSlotTypes[slotNum] ?? []).length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const types = skinMatchSlotTypes[slotNum] ?? [];
                                  if (types.length === 0) return;
                                  userClearedSlotsRef.current.add(slotNum);
                                  setSkinMatchSlotTypes((prev) => {
                                    const next = { ...prev };
                                    next[slotNum] = [];
                                    return next;
                                  });
                                  setUnmatchedTypes((prev) => [...prev, ...types]);
                                }}
                                className="shrink-0 rounded px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-200 hover:text-slate-700"
                              >
                                비우기
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(skinMatchSlotTypes[slotNum] ?? []).map((type) => (
                              <span
                                key={type}
                                draggable={isActive}
                                onDragStart={isActive ? (ev) => {
                                  ev.dataTransfer.setData('text/plain', JSON.stringify({ type, fromSlot: slotNum }));
                                  ev.dataTransfer.effectAllowed = 'move';
                                } : undefined}
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium text-white active:cursor-grabbing ${
                                  isActive ? 'cursor-grab bg-brand/90' : 'cursor-default bg-slate-400'
                                }`}
                              >
                                {type}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    if (!canGrantPermission) return;
                    setSkinMatchSaving(true);
                    setError(null);
                    const slotByType: Record<string, number> = {};
                    const activeSlotMax = slots.length;
                    Object.keys(skinMatchSlotTypes).forEach((key) => {
                      const slotNum = Number(key);
                      if (!Number.isInteger(slotNum) || slotNum < 1 || slotNum > activeSlotMax) return;
                      (skinMatchSlotTypes[slotNum] ?? []).forEach((type) => {
                        slotByType[type] = slotNum;
                      });
                    });
                    const toDelete = ALL_SKIN_TYPES.filter((t) => !(t in slotByType));
                    const { error: delErr } = await deleteMappingForTypes(toDelete);
                    if (delErr) {
                      setError('미매칭 삭제 실패: ' + delErr.message);
                      setSkinMatchSaving(false);
                      window.alert('미매칭 타입 삭제에 실패했습니다. Supabase 테이블 skin_type_slot_mapping에 DELETE 정책(예: authenticated 사용자 허용)이 있는지 확인하세요.\n\n' + delErr.message);
                      return;
                    }
                    const { error: err } = await saveMapping(slotByType);
                    if (err) {
                      setError('매칭 저장 실패: ' + err.message);
                      setSkinMatchSaving(false);
                      return;
                    }
                    setSaveSuccessAt(Date.now());
                    setError(null);
                    userClearedSlotsRef.current.clear();
                    fetchMapping().then((dbMap) => {
                      const slotCount = slots.length;
                      const bySlot: Record<number, string[]> = {};
                      for (let i = 1; i <= slotCount; i++) bySlot[i] = [];
                      // DB에만 있는 매칭 사용(기본값 없음) → 비운 타입이 슬롯으로 복원되지 않음
                      ALL_SKIN_TYPES.forEach((type) => {
                        const slot = dbMap[type];
                        if (typeof slot !== 'number' || slot < 1 || slot > slotCount) return;
                        if (!bySlot[slot].includes(type)) bySlot[slot].push(type);
                      });
                      setSkinMatchSlotTypes(bySlot);
                      const assigned = new Set(Object.values(bySlot).flat());
                      setUnmatchedTypes(ALL_SKIN_TYPES.filter((t) => !assigned.has(t)));
                    }).catch(() => {});
                    setSkinMatchSaving(false);
                  }}
                  disabled={skinMatchSaving || !canGrantPermission}
                  className="w-full rounded-full border border-brand bg-brand-soft/30 py-2 text-sm font-medium text-brand hover:bg-brand-soft/50 disabled:opacity-50"
                >
                  {skinMatchSaving ? '저장 중…' : '매칭 저장'}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {tab === 'promo' && (
        <section className="mt-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">프로모 배너</h2>
            {promosLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">불러오는 중…</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-4">
                  {promos.map((p, index) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', JSON.stringify({ index, id: p.id }));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const raw = e.dataTransfer.getData('text/plain');
                        try {
                          const { index: from } = JSON.parse(raw) as { index: number; id: string };
                          const list = [...promos];
                          const [removed] = list.splice(from, 1);
                          list.splice(index, 0, removed);
                          setPromos(list.map((pr, i) => ({ ...pr, sort_order: i })));
                        } catch {
                          // ignore
                        }
                      }}
                      className="flex w-[180px] shrink-0 cursor-grab flex-col rounded-lg border border-slate-200 bg-slate-50/50 p-2 active:cursor-grabbing"
                    >
                      <span className="mb-1 shrink-0 text-slate-400" title="드래그하여 순서 변경">⋮⋮</span>
                      <div className="aspect-video w-full shrink-0 overflow-hidden rounded bg-slate-200">
                        {p.image_url ? (
                          <img src={p.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-slate-400">이미지 없음</span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPromo(p);
                            setPromoForm({
                              title: p.title,
                              image_url: p.image_url ?? '',
                              end_at: p.end_at ? p.end_at.slice(0, 10) : '',
                            });
                          }}
                          className="rounded px-2 py-1 text-xs text-sky-600 hover:bg-sky-50"
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!window.confirm('이 프로모를 삭제하시겠습니까?')) return;
                            if (!supabase) return;
                            const { error } = await supabase.from('promos').delete().eq('id', p.id);
                            if (error) {
                              window.alert('삭제 실패: ' + error.message);
                              return;
                            }
                            setPromos((prev) => prev.filter((pr) => pr.id !== p.id));
                            setSaveSuccessAt(Date.now());
                          }}
                          className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                      <p className="mt-2 truncate text-center text-sm font-medium text-slate-800">{p.title || '—'}</p>
                      <p className="text-center text-xs text-slate-500">
                        {p.end_at ? `~ ${new Date(p.end_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : '종료일 미설정'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mb-4 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!supabase || promosSaving || !canGrantPermission) return;
                      setPromosSaving(true);
                      setError(null);
                      try {
                        for (let i = 0; i < promos.length; i++) {
                          await supabase.from('promos').update({ sort_order: i }).eq('id', promos[i].id);
                        }
                        setSaveSuccessAt(Date.now());
                      } catch (e) {
                        setError(e instanceof Error ? e.message : '순서 저장 실패');
                      } finally {
                        setPromosSaving(false);
                      }
                    }}
                    disabled={promosSaving || promos.length === 0 || !canGrantPermission}
                    className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                  >
                    {promosSaving ? '저장 중…' : '순서 저장'}
                  </button>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                  <h3 className="mb-3 text-xs font-semibold text-slate-700">
                    {selectedPromo ? '프로모 수정' : '프로모 추가'}
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">제목</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={promoForm.title}
                        onChange={(e) => setPromoForm((f) => ({ ...f, title: e.target.value }))}
                        placeholder="프로모 제목"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">이미지 URL 또는 파일 업로드</label>
                      <div className="flex gap-2">
                        <input
                          type="url"
                          className="min-w-0 flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
                          value={promoForm.image_url}
                          onChange={(e) => setPromoForm((f) => ({ ...f, image_url: e.target.value }))}
                          placeholder="https://... 또는 아래에서 파일 올리기"
                        />
                        <input
                          ref={promoImageInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            setUploadingPromoImage(true);
                            try {
                              const url = await uploadPromoImage(file);
                              if (url) setPromoForm((f) => ({ ...f, image_url: url }));
                            } finally {
                              setUploadingPromoImage(false);
                              e.target.value = '';
                            }
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => promoImageInputRef.current?.click()}
                          disabled={uploadingPromoImage}
                          className="shrink-0 rounded border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {uploadingPromoImage ? '업로드 중…' : '파일 올리기'}
                        </button>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">* 권장 배너 크기: {PROMO_BANNER_RECOMMENDED}</p>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">종료일 (까지, 연·월·일 4·2·2자, 오늘 이후만)</label>
                      <input
                        type="date"
                        min={new Date().toISOString().slice(0, 10)}
                        className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                        value={promoForm.end_at}
                        onChange={(e) => setPromoForm((f) => ({ ...f, end_at: e.target.value }))}
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!supabase || !canGrantPermission) return;
                          if (!promoForm.title.trim()) {
                            window.alert('제목을 입력하세요.');
                            return;
                          }
                          const today = new Date().toISOString().slice(0, 10);
                          if (promoForm.end_at && promoForm.end_at < today) {
                            window.alert('종료일은 오늘 이후만 입력할 수 있습니다.');
                            return;
                          }
                          setPromosSaving(true);
                          setError(null);
                          try {
                            const payload = {
                              title: promoForm.title.trim(),
                              image_url: promoForm.image_url.trim() || null,
                              end_at: promoForm.end_at ? new Date(promoForm.end_at).toISOString() : null,
                              sort_order: selectedPromo ? selectedPromo.sort_order : promos.length,
                            };
                            if (selectedPromo) {
                              const { error: err } = await supabase.from('promos').update(payload).eq('id', selectedPromo.id);
                              if (err) throw err;
                              setPromos((prev) => prev.map((pr) => (pr.id === selectedPromo.id ? { ...pr, ...payload } : pr)));
                              setSelectedPromo(null);
                            } else {
                              const { data, error: err } = await supabase.from('promos').insert(payload).select('id').single();
                              if (err) throw err;
                              setPromos((prev) => [...prev, { ...payload, id: (data as { id: string }).id }]);
                            }
                            setPromoForm({ title: '', image_url: '', end_at: '' });
                            setSaveSuccessAt(Date.now());
                          } catch (e) {
                            setError(e instanceof Error ? e.message : '저장 실패');
                          } finally {
                            setPromosSaving(false);
                          }
                        }}
                        disabled={promosSaving || !canGrantPermission}
                        className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                      >
                        {selectedPromo ? '수정 저장' : '추가'}
                      </button>
                      {selectedPromo && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPromo(null);
                            setPromoForm({ title: '', image_url: '', end_at: '' });
                          }}
                          className="rounded-full border border-slate-200 px-4 py-1.5 text-xs text-slate-600"
                        >
                          취소
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {tab === 'orders' && (
        <section className="mt-4 w-full min-w-0 space-y-4 xl:max-w-[96rem]">
          {/* 포인트 정책 요약 테이블: 관리자 주문 탭 상단에 정리 */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <h2 className="border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-900">포인트 정책 요약</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    <th className="px-4 py-2 text-left font-medium text-slate-700">구분</th>
                    <th className="px-4 py-2 text-left font-medium text-slate-700">내용</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-600">테스트 완료 후 가입</td>
                    <td className="px-4 py-2 text-slate-600">300 pt (피부 테스트 완료 후 가입 시 1회)</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-600">텔레그램 연동</td>
                    <td className="px-4 py-2 text-slate-600">200 pt (연동 시 1회, 재연동 시 중복 지급 불가)</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-600">결제 시 포인트 사용</td>
                    <td className="px-4 py-2 text-slate-600">최대 1 000 pt (1 pt = 1 ₽), 주문 금액의 10% 한도</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-600">리뷰 포인트 지급 (일반)</td>
                    <td className="px-4 py-2 text-slate-600">200 pt</td>
                  </tr>
                  <tr className="border-b border-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-600">리뷰 포인트 지급 (특별)</td>
                    <td className="px-4 py-2 text-slate-600">500 pt</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xs font-semibold text-slate-900">주문 목록</h2>
              {ordersFilterUserId && (
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                    특정 회원 주문만 보기
                  </span>
                  <button
                    type="button"
                    onClick={() => setOrdersFilterUserId(null)}
                    className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] text-slate-600 hover:bg-slate-50"
                  >
                    필터 해제
                  </button>
                </div>
              )}
            </div>
            <p className="mb-3 text-[11px] text-slate-500">
              주문을 클릭하면 수령인(ФИО)·전화·배송 주소를 수정할 수 있습니다. 고객이 나중에 수령인 정보 변경을 요청할 때 여기서 수정하세요. 금액은 포인트 사용 반영 후 결제금액입니다.
            </p>
            {/* 주문 상태·배송 레전드: 결제 관련(좌) / 배송 관련(우). flex-wrap으로 환불 등이 잘리지 않게 */}
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5 sm:gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600">결제</span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700 whitespace-nowrap" title="결제 대기">대기</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 whitespace-nowrap" title="결제 완료">완료</span>
                <span className="rounded bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 whitespace-nowrap" title="결제 실패">실패</span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-600 whitespace-nowrap" title="취소됨">취소</span>
                <span className="rounded bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800 whitespace-nowrap" title="환불 처리">환불</span>
              </div>
              <div className="h-4 w-px shrink-0 bg-slate-200" aria-hidden />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold text-slate-600 shrink-0">배송</span>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-800 whitespace-nowrap">제품준비</span>
                <span className="rounded bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-800 whitespace-nowrap">배송준비</span>
                <span className="rounded bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 whitespace-nowrap">발송</span>
                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 whitespace-nowrap">도착/확정</span>
              </div>
            </div>
            {ordersLoading ? (
              <p className="py-6 text-center text-xs text-slate-500">불러오는 중…</p>
            ) : ordersList.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">주문이 없습니다.</p>
            ) : (
              <div className="w-full max-w-full overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">주문번호</th>
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">주문일</th>
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">결제금액</th>
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">사용 포인트</th>
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">상태</th>
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">배송현황</th>
                      <th className="min-w-[100px] pb-1.5 pr-2 font-medium whitespace-nowrap">주문 품목</th>
                      <th className="min-w-[80px] pb-1.5 pr-2 font-medium whitespace-nowrap">수령인</th>
                      <th className="min-w-[100px] pb-1.5 pr-2 font-medium whitespace-nowrap">전화</th>
                      <th className="min-w-[220px] pb-1.5 pr-2 font-medium whitespace-nowrap">배송지</th>
                      <th className="pb-1.5 pr-2 font-medium whitespace-nowrap">개인정보</th>
                      <th className="min-w-[160px] pb-1.5 pl-2 font-medium whitespace-nowrap">조치</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordersList.map((o) => (
                      <tr
                        key={o.id}
                        onClick={() => {
                          setSelectedOrder(o);
                          setOrderEditForm({
                            receiver_name: o.receiver_name ?? '',
                            receiver_phone: o.receiver_phone ?? '',
                            shipping_address: o.shipping_address ?? '',
                            tracking_url: o.tracking_url ?? '',
                          });
                        }}
                        className={`cursor-pointer border-b border-slate-100 hover:bg-slate-50 ${o.is_test ? 'bg-amber-50/50' : ''}`}
                      >
                        <td className="py-1.5 pr-2 font-medium text-slate-800 whitespace-nowrap">{o.order_number ?? o.id.slice(0, 8)}</td>
                        <td className="py-1.5 pr-2 text-slate-700 whitespace-nowrap">
                          {new Date(o.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">{(o.total_cents / 100).toLocaleString('ko-KR')} ₽</td>
                        <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">{o.points_used != null && o.points_used > 0 ? `${(o.points_used / 100).toLocaleString('ko-KR')} P` : '—'}</td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          {o.status === 'pending' && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">대기</span>}
                          {o.status === 'completed' && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">완료</span>}
                          {o.status === 'product_preparing' && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">제품준비</span>}
                          {o.status === 'shipping_soon' && <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800">배송준비</span>}
                          {o.status === 'shipped' && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">발송</span>}
                          {o.status === 'delivered' && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">도착</span>}
                          {o.status === 'confirmed' && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">구매확정</span>}
                          {o.status === 'failed' && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-800">실패</span>}
                          {o.status === 'canceled' && <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">취소</span>}
                          {o.status === 'refunded' && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">환불</span>}
                          {o.status && !['pending', 'completed', 'product_preparing', 'shipping_soon', 'shipped', 'delivered', 'confirmed', 'failed', 'canceled', 'refunded'].includes(o.status) && <span className="text-slate-600">{o.status}</span>}
                          {!o.status && '—'}
                        </td>
                        <td className="py-1.5 pr-2 whitespace-nowrap">
                          {(() => {
                            const s = o.status;
                            if (s === 'product_preparing') return <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-medium text-blue-800">제품준비중</span>;
                            if (s === 'shipping_soon') return <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-800">배송준비중</span>;
                            if (s === 'shipped') return <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-medium text-sky-800">발송중</span>;
                            if (s === 'delivered' || s === 'confirmed') return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">발송완료</span>;
                            return <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">준비중</span>;
                          })()}
                        </td>
                        <td className="truncate py-1.5 pr-2 text-slate-700" title={formatOrderItemsSummary(o.items ?? o.snapshot_items)}>{formatOrderItemsSummary(o.items ?? o.snapshot_items)}</td>
                        <td className="truncate py-1.5 pr-2" title={o.receiver_name ?? ''}>{o.receiver_name || '—'}</td>
                        <td className="truncate py-1.5 pr-2 whitespace-nowrap">{o.receiver_phone || '—'}</td>
                        <td className="truncate py-1.5 pr-2 text-slate-600" title={o.shipping_address ?? ''}>{o.shipping_address || '—'}</td>
                        <td className="relative shrink-0 py-1.5 pr-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="relative inline-block" data-personal-info-popover={o.id}>
                            <button
                              type="button"
                              onClick={() => setExpandedPersonalInfoOrderId((prev) => (prev === o.id ? null : o.id))}
                              className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                            >
                              개인정보
                            </button>
                            {expandedPersonalInfoOrderId === o.id && (
                              <div className="absolute right-0 top-full z-50 mt-1 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 shadow-lg">
                              <p className="mb-2 border-b border-slate-100 pb-1.5 text-[11px] font-semibold text-slate-600">주문 시점 저장 데이터</p>
                              <p className="text-xs text-slate-800">INN: {o.inn ?? '—'}</p>
                              <p className="mt-1 text-xs text-slate-800">여권: {[o.passport_series, o.passport_number].filter(Boolean).join(' ') || '—'}</p>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="shrink-0 py-1.5 pl-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-nowrap items-center gap-1">
                            {(o.status === 'pending' || o.status === 'completed' || o.status === 'product_preparing' || o.status === 'shipping_soon') && (
                              <button
                                type="button"
                                disabled={orderStatusUpdating === o.id || !canGrantPermission}
                                onClick={async () => {
                                  if (!supabase || !canGrantPermission) return;
                                  if (!window.confirm('이 주문을 취소 처리하시겠습니까?')) return;
                                  setOrderStatusUpdating(o.id);
                                  try {
                                    const { error } = await supabase.from('orders').update({ status: 'canceled' }).eq('id', o.id);
                                    if (error) throw error;
                                    setOrdersList((prev) => prev.map((ord) => (ord.id === o.id ? { ...ord, status: 'canceled' } : ord)));
                                  } catch (err) {
                                    console.error(err);
                                    window.alert(err instanceof Error ? err.message : '취소 처리 실패');
                                  } finally {
                                    setOrderStatusUpdating(null);
                                  }
                                }}
                                className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                              >
                                취소
                              </button>
                            )}
                            {o.status === 'completed' && (
                              <>
                                <button
                                  type="button"
                                  disabled={orderStatusUpdating === o.id || !canGrantPermission}
                                  onClick={async () => {
                                    if (!supabase || !canGrantPermission) return;
                                    setOrderStatusUpdating(o.id);
                                    try {
                                      const { error } = await supabase.from('orders').update({ status: 'shipping_soon' }).eq('id', o.id);
                                      if (error) throw error;
                                      setOrdersList((prev) => prev.map((ord) => (ord.id === o.id ? { ...ord, status: 'shipping_soon' } : ord)));
                                    } catch (err) {
                                      console.error(err);
                                      window.alert(err instanceof Error ? err.message : '상태 변경 실패');
                                    } finally {
                                      setOrderStatusUpdating(null);
                                    }
                                  }}
                                  className="rounded border border-indigo-300 px-2 py-0.5 text-[11px] text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 whitespace-nowrap"
                                >
                                  배송준비
                                </button>
                                <button
                                  type="button"
                                  disabled={orderStatusUpdating === o.id || !canGrantPermission}
                                  onClick={async () => {
                                    if (!supabase || !canGrantPermission) return;
                                    if (!window.confirm('이 주문을 환불 처리하시겠습니까? (상태만 "환불"로 변경됩니다. 실제 결제 취소는 PG에서 별도 진행하세요.)')) return;
                                    setOrderStatusUpdating(o.id);
                                    try {
                                      const { error } = await supabase.from('orders').update({ status: 'refunded' }).eq('id', o.id);
                                      if (error) throw error;
                                      setOrdersList((prev) => prev.map((ord) => (ord.id === o.id ? { ...ord, status: 'refunded' } : ord)));
                                    } catch (err) {
                                      console.error(err);
                                      window.alert(err instanceof Error ? err.message : '환불 처리 실패');
                                    } finally {
                                      setOrderStatusUpdating(null);
                                    }
                                  }}
                                  className="rounded border border-violet-300 px-2 py-0.5 text-[11px] text-violet-700 hover:bg-violet-50 disabled:opacity-50"
                                >
                                  환불
                                </button>
                              </>
                            )}
                            {o.status === 'product_preparing' && (
                              <button
                                type="button"
                                disabled={orderStatusUpdating === o.id || !canGrantPermission}
                                onClick={async () => {
                                  if (!supabase || !canGrantPermission) return;
                                  setOrderStatusUpdating(o.id);
                                  try {
                                    const { error } = await supabase.from('orders').update({ status: 'shipping_soon' }).eq('id', o.id);
                                    if (error) throw error;
                                    setOrdersList((prev) => prev.map((ord) => (ord.id === o.id ? { ...ord, status: 'shipping_soon' } : ord)));
                                  } catch (err) {
                                    console.error(err);
                                    window.alert(err instanceof Error ? err.message : '상태 변경 실패');
                                  } finally {
                                    setOrderStatusUpdating(null);
                                  }
                                }}
                                className="rounded border border-indigo-300 px-2 py-0.5 text-[11px] text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                              >
                                배송준비
                              </button>
                            )}
                            {o.status === 'shipping_soon' && (
                              <button
                                type="button"
                                disabled={orderStatusUpdating === o.id || !canGrantPermission}
                                onClick={async () => {
                                  if (!supabase || !canGrantPermission) return;
                                  if (!window.confirm('발송 처리하시겠습니까? (고객에게 배송중으로 보입니다. 트래킹 URL은 수령인 수정 모달에서 추후 입력 가능합니다.)')) return;
                                  setOrderStatusUpdating(o.id);
                                  try {
                                    const { error } = await supabase.from('orders').update({ status: 'shipped' }).eq('id', o.id);
                                    if (error) throw error;
                                    setOrdersList((prev) => prev.map((ord) => (ord.id === o.id ? { ...ord, status: 'shipped' } : ord)));
                                  } catch (err) {
                                    console.error(err);
                                    window.alert(err instanceof Error ? err.message : '상태 변경 실패');
                                  } finally {
                                    setOrderStatusUpdating(null);
                                  }
                                }}
                                className="rounded border border-sky-300 px-2 py-0.5 text-[11px] text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                              >
                                발송
                              </button>
                            )}
                            {o.status === 'shipped' && (
                              <button
                                type="button"
                                disabled={orderStatusUpdating === o.id || !canGrantPermission}
                                onClick={async () => {
                                  if (!supabase || !canGrantPermission) return;
                                  setOrderStatusUpdating(o.id);
                                  try {
                                    const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', o.id);
                                    if (error) throw error;
                                    setOrdersList((prev) => prev.map((ord) => (ord.id === o.id ? { ...ord, status: 'delivered' } : ord)));
                                  } catch (err) {
                                    console.error(err);
                                    window.alert(err instanceof Error ? err.message : '상태 변경 실패');
                                  } finally {
                                    setOrderStatusUpdating(null);
                                  }
                                }}
                                className="rounded border border-emerald-300 px-2 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                              >
                                도착
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'members' && (() => {
        const adminList = members.filter((m) => m.is_admin || m.is_manager);
        const regularMembers = members.filter((m) => !m.is_admin && !m.is_manager);
        const selectedRegularIds = selectedMemberIds.filter((id) => regularMembers.some((m) => m.id === id));
        return (
        <section className="mt-4 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">가입회원 관리</h2>
              <p className="mt-1 text-[11px] text-slate-500">
                관리자 명단과 일반 회원을 구분해 표시합니다. 등급·포인트·스킨 테스트·텔레그램 연동을 확인할 수 있습니다.
              </p>
            </div>
            {canGrantPermission && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleGrantQuarterCoupons}
                disabled={grantingCoupons}
                className="rounded-full border border-brand px-3 py-1.5 text-[11px] font-medium text-brand hover:bg-brand/5 disabled:opacity-50"
              >
                분기 쿠폰 지급
              </button>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[11px] text-slate-600">
                  <span>특별 쿠폰 금액</span>
                  <select
                    value={specialCouponAmount}
                    onChange={(e) => setSpecialCouponAmount(Number(e.target.value) || 100)}
                    className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                  >
                    <option value={100}>100 ₽</option>
                    <option value={300}>300 ₽</option>
                    <option value={500}>500 ₽</option>
                    <option value={1000}>1000 ₽</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleGrantMembershipCoupons}
                  disabled={grantingCoupons}
                  className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
                >
                  {grantingCoupons ? '특별 쿠폰 지급 중…' : '특별 쿠폰 지급'}
                </button>
              </div>
            </div>
            )}
          </div>

          {membersError && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {membersError}
            </div>
          )}

          {/* 좌: 관리자 명단 / 우: 포인트&쿠폰 정책 — 내용 높이만큼만 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* 관리자 명단: 절반 폭, 왼쪽 */}
            {adminList.length > 0 ? (
              <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-3 shrink-0 text-xs font-semibold text-slate-800">관리자 명단</h3>
                <div className="min-h-0 flex-1 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium">회원</th>
                        <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium">역할</th>
                        {canGrantPermission && (
                          <th className="whitespace-nowrap px-3 py-1.5 text-left font-medium">권한 변경</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {adminList.map((m) => (
                        <tr key={m.id} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-3 py-2">
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-900">{m.name || '—'}</span>
                              <span className="text-[11px] text-slate-500">{m.email || '—'}</span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${m.is_admin ? 'bg-brand/20 text-brand' : 'bg-slate-200 text-slate-700'}`}>
                              {m.is_admin ? '관리자' : '매니저(보기전용)'}
                            </span>
                          </td>
                          {canGrantPermission && (
                            <td className="whitespace-nowrap px-3 py-2">
                              {(() => {
                                const isDeveloperMember = m.email && DEVELOPER_EMAILS.includes(m.email.trim().toLowerCase());
                                return isDeveloperMember ? (
                                  <span className="inline-block rounded border border-slate-200 bg-slate-100 px-2 py-1 text-[11px] text-slate-500 cursor-not-allowed" title="개발자 계정은 권한 변경 불가">
                                    관리자
                                  </span>
                                ) : (
                                  <select
                                    value={m.is_admin ? 'admin' : 'manager'}
                                    onChange={(e) => handleUpdateMemberRole(m.id, e.target.value as 'member' | 'manager' | 'admin')}
                                    disabled={updatingRoleUserId === m.id}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50"
                                  >
                                    <option value="member">회원</option>
                                    <option value="manager">매니저(보기전용)</option>
                                    <option value="admin" disabled={!canGrantAdminRole}>관리자</option>
                                  </select>
                                );
                              })()}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                <h3 className="mb-3 shrink-0 text-xs font-semibold text-slate-800">관리자 명단</h3>
                <p className="text-[11px] text-slate-500">등록된 관리자가 없습니다.</p>
              </div>
            )}

            {/* 포인트(좌) & 쿠폰지급 규정(우): 내용 높이만큼만 */}
            <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="grid min-h-0 flex-1 grid-cols-1 border-b border-slate-100 sm:grid-cols-2">
                <div className="flex flex-col border-b border-slate-100 sm:border-b-0 sm:border-r border-slate-100">
                  <h3 className="shrink-0 border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-900">포인트 &amp; 쿠폰 정책</h3>
                  <div className="flex-1 overflow-auto px-4 py-2">
                    <h4 className="pb-1 text-[11px] font-semibold text-slate-700">포인트 정책 요약</h4>
                    <ul className="space-y-1 text-[11px] text-slate-600">
                      <li>테스트 완료 300 pt</li>
                      <li>텔레그램 연동 200 pt (연동 시 1회, 재연동 시 중복 X)</li>
                      <li>결제 시 포인트 사용 최대 1000 pt (주문 금액의 10% 한도)</li>
                      <li>리뷰 포인트 (일반) 200 pt</li>
                      <li>리뷰 포인트 (특별) 500 pt</li>
                    </ul>
                  </div>
                </div>
                <div className="flex flex-col">
                  <h3 className="shrink-0 border-b border-slate-100 px-4 py-3 text-xs font-semibold text-slate-900">쿠폰지급 규정</h3>
                  <div className="flex-1 overflow-auto px-4 py-2">
                    <ul className="space-y-1 text-[11px] text-slate-600">
                      <li>분기별 구독 회원 대상으로 쿠폰 일괄 지급 (분기 후 소멸)</li>
                      <li className="pl-3">일반 100p, 프리미엄 200p, 가족등급 300p</li>
                      <li>향후 바우처 개발하여 코드로 활성화</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 일반 회원 목록 */}
          <div>
            <h3 className="mb-2 text-xs font-semibold text-slate-800">일반 회원</h3>
          <div className="relative overflow-x-auto overflow-y-visible rounded-xl border border-slate-200 bg-white z-30">
            <table className="min-w-full text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70">
                <tr>
                  {canGrantPermission && (
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">
                    <input
                      type="checkbox"
                      className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand"
                      checked={regularMembers.length > 0 && selectedRegularIds.length === regularMembers.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedMemberIds(regularMembers.map((m) => m.id));
                        } else {
                          setSelectedMemberIds((prev) => prev.filter((id) => !regularMembers.some((m) => m.id === id)));
                        }
                      }}
                    />
                  </th>
                  )}
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">회원</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">회원등급</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-slate-700">보유 포인트</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">주문 수</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">스킨 테스트</th>
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">텔레그램</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">가입일</th>
                  <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">마지막 방문</th>
                  {canGrantPermission && <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-700">권한</th>}
                  <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-slate-700">조치</th>
                </tr>
              </thead>
              <tbody>
                {membersLoading && (
                  <tr>
                    <td colSpan={canGrantPermission ? 11 : 10} className="px-3 py-6 text-center text-[11px] text-slate-500">
                      회원 목록을 불러오는 중입니다…
                    </td>
                  </tr>
                )}
                {!membersLoading && regularMembers.length === 0 && (
                  <tr>
                    <td colSpan={canGrantPermission ? 11 : 10} className="px-3 py-6 text-center text-[11px] text-slate-500">
                      등록된 일반 회원이 없습니다.
                    </td>
                  </tr>
                )}
                {!membersLoading &&
                  regularMembers.map((m) => (
                    <tr key={m.id} className="border-t border-slate-100">
                      {canGrantPermission && (
                      <td className="whitespace-nowrap px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          className="h-3 w-3 rounded border-slate-300 text-brand focus:ring-brand"
                          checked={selectedMemberIds.includes(m.id)}
                          onChange={(e) => {
                            setSelectedMemberIds((prev) =>
                              e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id)
                            );
                          }}
                        />
                      </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2 text-slate-800">
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-slate-900">{m.name || '—'}</span>
                          <span className="text-[11px] text-slate-500">{m.email || '—'}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {m.tier === 'family'
                          ? '가족'
                          : m.tier === 'premium'
                          ? '프리미엄'
                          : '일반'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-slate-800">
                        <div className="inline-flex items-center gap-1">
                          <span>{m.points.toLocaleString('ru-RU')} pt</span>
                          <button
                            type="button"
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 bg-white text-[11px] text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                              window.open(`/profile/points?userId=${m.id}`, '_blank');
                            }}
                            title="포인트 내역"
                          >
                            ★
                          </button>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums text-slate-700">
                        {m.order_count}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center text-slate-700">
                        {m.has_skin_test ? (
                          <div className="flex flex-col items-center gap-0.5 text-[11px]">
                            <span className="text-slate-700">
                              {m.skin_type ?? '-'}
                            </span>
                            {m.skin_completed_at && (
                              <span className="text-slate-500">
                                {new Date(m.skin_completed_at).toLocaleDateString('ru-RU')}
                              </span>
                            )}
                          </div>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center text-slate-700">
                        {m.telegram_id ? '연동' : '미연동'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString('ru-RU') : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
                        {m.last_visit_at ? new Date(m.last_visit_at).toLocaleString('ru-RU') : '—'}
                      </td>
                      {canGrantPermission && (
                      <td className="whitespace-nowrap px-3 py-2">
                        <select
                          value="member"
                          onChange={(e) => handleUpdateMemberRole(m.id, e.target.value as 'member' | 'manager' | 'admin')}
                          disabled={updatingRoleUserId === m.id}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700 disabled:opacity-50"
                        >
                          <option value="member">회원</option>
                          <option value="manager">매니저</option>
                          {canGrantAdminRole && <option value="admin">관리자</option>}
                        </select>
                      </td>
                      )}
                      <td className="whitespace-nowrap px-3 py-2 text-center">
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setOrdersFilterUserId(m.id);
                              setTab('orders');
                            }}
                            className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
                          >
                            주문
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReviewFilterUserId(m.id);
                              setTab('reviewManagement');
                            }}
                            className="rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50"
                          >
                            리뷰
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          </div>
        </section>
        );
      })()}

      {tab === 'activityLogs' && (
        <section className="mt-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-xs font-semibold text-slate-900">활동 로그 (CS 타임라인)</h2>
            <p className="mb-3 text-[11px] text-slate-500">
              고객이 결제 단계에서 본 가격(checkout_price_viewed)과 결제 버튼 클릭(clicked_pay_button) 시각·메타데이터. 특정 user_id로 필터하면 해당 고객 타임라인만 볼 수 있습니다.
            </p>
            <div className="mb-2 flex gap-2">
              <input
                type="text"
                placeholder="user_id (UUID) 필터"
                value={activityLogsFilterUserId}
                onChange={(e) => setActivityLogsFilterUserId(e.target.value)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs"
              />
            </div>
            {activityLogsLoading ? (
              <p className="py-6 text-center text-xs text-slate-500">불러오는 중…</p>
            ) : activityLogsList.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">로그가 없거나 필터에 맞는 항목이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="pb-1.5 pr-2 font-medium">시각</th>
                      <th className="pb-1.5 pr-2 font-medium">user_id</th>
                      <th className="pb-1.5 pr-2 font-medium">action</th>
                      <th className="min-w-[200px] pb-1.5 font-medium">metadata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLogsList.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-700">
                          {new Date(row.created_at).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' })}
                        </td>
                        <td className="max-w-[10rem] truncate py-1.5 pr-2 font-mono text-[11px]" title={row.user_id ?? ''}>{row.user_id ?? '—'}</td>
                        <td className="py-1.5 pr-2 font-medium">{row.action}</td>
                        <td className="min-w-[200px] max-w-[400px] py-1.5 text-slate-600" title={JSON.stringify(row.metadata)}>
                          {row.action === 'checkout_price_viewed' && row.metadata && (
                            <span>final_cents: {(row.metadata as { final_cents?: number }).final_cents ?? '—'} · total_cents: {(row.metadata as { total_cents?: number }).total_cents ?? '—'}</span>
                          )}
                          {row.action === 'clicked_pay_button' && row.metadata && (
                            <span>final_cents: {(row.metadata as { final_cents?: number }).final_cents ?? '—'} (클릭 시점)</span>
                          )}
                          {row.action !== 'checkout_price_viewed' && row.action !== 'clicked_pay_button' && JSON.stringify(row.metadata)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'cartAbandonment' && (
        <section className="mt-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-xs font-semibold text-slate-900">장바구니 이탈 명단 (CRM/리타겟팅)</h2>
            <p className="mb-2 text-[11px] text-slate-500">
              로그인 후 장바구니에 담고 결제하지 않은 사용자. 텔레그램 연동된 경우 알림·추가 할인 쿠폰 등 CRM에 활용할 수 있습니다.
            </p>
            <p className="mb-3 text-[11px] italic text-slate-400">
              ※ 향후 모수가 많아지면 타이머 기능을 켜서, 장바구니 담은 뒤 xx시간 지난 고객만 따로 추리는 로직 구상 필요.
            </p>
            {cartAbandonmentLoading ? (
              <p className="py-6 text-center text-xs text-slate-500">불러오는 중…</p>
            ) : cartAbandonmentList.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">명단이 없습니다.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600">
                      <th className="pb-1.5 pr-2 font-medium">이메일</th>
                      <th className="pb-1.5 pr-2 font-medium">이름</th>
                      <th className="pb-1.5 pr-2 font-medium">텔레그램</th>
                      <th className="pb-1.5 pr-2 font-medium">장바구니 금액</th>
                      <th className="pb-1.5 pr-2 font-medium">장바구니에 담은 시간</th>
                      <th className="pb-1.5 pr-2 font-medium">마지막 갱신</th>
                      <th className="pb-1.5 font-medium">품목 요약</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cartAbandonmentList.map((r) => (
                      <tr key={r.user_id} className="border-b border-slate-100">
                        <td className="py-1.5 pr-2 text-slate-800">{r.email ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-slate-700">{r.name ?? '—'}</td>
                        <td className="py-1.5 pr-2">
                          {r.telegram_id ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">연동됨</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-1.5 pr-2">{(r.total_cents / 100).toLocaleString('ko-KR')} ₽</td>
                        <td className="py-1.5 pr-2 text-slate-600">{r.created_at ? new Date(r.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                        <td className="py-1.5 pr-2 text-slate-600">{new Date(r.updated_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                        <td className="max-w-[200px] py-1.5 text-slate-600" title={r.items.map((i) => `${i.name} ×${i.quantity}`).join(', ')}>
                          {r.items.slice(0, 2).map((i) => `${i.name} ×${i.quantity}`).join(', ')}{r.items.length > 2 ? ` 외 ${r.items.length - 2}건` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {tab === 'reviewManagement' && (
        <section className="mt-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-1 text-xs font-semibold text-slate-900">리뷰 관리</h2>
            <p className="mb-4 text-[11px] text-slate-500">
              전체 리뷰 목록. 삭제, 리뷰 포인트 지급(일반 200 / 특별 500), 대댓글 작성이 가능합니다.
            </p>
            {reviewManagementLoading ? (
              <p className="py-8 text-center text-xs text-slate-500">불러오는 중…</p>
            ) : reviewManagementList.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">등록된 리뷰가 없습니다.</p>
            ) : (
              <ul className="space-y-6">
                {reviewManagementList.map((r) => (
                  <li key={r.id} className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                    {/* 상품 정보 + 작성자 + 작성일 */}
                    <div className="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-2">
                      <Link to={`/product/${r.product_id}#product-reviews`} className="text-sm font-medium text-brand hover:underline">
                        {r.product_name || r.product_id}
                      </Link>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-slate-600">{r.user_name ?? r.user_email ?? r.user_id}</span>
                      <span className="text-[11px] text-slate-400">{new Date(r.created_at).toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      {r.review_reward_points > 0 && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          {r.review_reward_points}pt 지급됨
                        </span>
                      )}
                    </div>
                    {/* 별점 + 댓글 내용 */}
                    <div className="mb-2 flex items-center gap-1 text-amber-500 text-sm">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</div>
                    {r.body && <p className="mb-2 whitespace-pre-wrap text-sm text-slate-700">{r.body}</p>}
                    {/* 리뷰 사진 */}
                    {r.review_photos.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {r.review_photos.map((ph, i) => (
                          <a key={i} href={ph.image_url} target="_blank" rel="noopener noreferrer" className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <img src={ph.image_url} alt="" className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                    {/* 관리자 대댓글: 표시 또는 편집 */}
                    <div className="mb-3 rounded bg-white p-2 border border-slate-100">
                      <p className="mb-1 text-[11px] font-medium text-slate-500">관리자 대댓글</p>
                      {editingReplyId === r.id ? (
                        <div>
                          <textarea
                            rows={2}
                            className="mb-2 w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
                            value={editingReplyText}
                            onChange={(e) => setEditingReplyText(e.target.value)}
                            placeholder="대댓글 입력…"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={reviewActionLoading === r.id}
                              onClick={() => handleReviewReplySave(r.id, editingReplyText)}
                              className="rounded bg-brand px-2 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-50"
                            >
                              저장
                            </button>
                            <button
                              type="button"
                              onClick={() => { setEditingReplyId(null); setEditingReplyText(''); }}
                              className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                            >
                              취소
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <p className={r.admin_reply ? 'text-sm text-slate-700' : 'text-xs text-slate-400'}>{r.admin_reply || '—'}</p>
                          <button
                            type="button"
                            onClick={() => { setEditingReplyId(r.id); setEditingReplyText(r.admin_reply ?? ''); }}
                            className="shrink-0 rounded border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-100"
                          >
                            {r.admin_reply ? '수정' : '대댓글 달기'}
                          </button>
                        </div>
                      )}
                    </div>
                    {/* 조치 버튼: 삭제 / 200pt / 500pt */}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={reviewActionLoading != null}
                        onClick={() => handleReviewDelete(r.id)}
                        className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        삭제
                      </button>
                      {r.review_reward_points === 0 && (
                        <>
                          <button
                            type="button"
                            disabled={reviewActionLoading != null}
                            onClick={() => handleReviewReward(r.id, 200)}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                          >
                            200pt 지급 (일반)
                          </button>
                          <button
                            type="button"
                            disabled={reviewActionLoading != null}
                            onClick={() => handleReviewReward(r.id, 500)}
                            className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            500pt 지급 (특별)
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 주문 수령인 정보 수정 모달 */}
      {selectedOrder != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSelectedOrder(null)}>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">수령인 정보 수정 · 주문 {selectedOrder.order_number ?? selectedOrder.id.slice(0, 8)}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">ФИО (수령인 이름)</label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={orderEditForm.receiver_name}
                  onChange={(e) => setOrderEditForm((f) => ({ ...f, receiver_name: e.target.value }))}
                  placeholder="IVANOV IVAN IVANOVICH"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Телефон</label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={orderEditForm.receiver_phone}
                  onChange={(e) => setOrderEditForm((f) => ({ ...f, receiver_phone: e.target.value }))}
                  placeholder="+7 ..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Адрес доставки</label>
                <textarea
                  rows={3}
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={orderEditForm.shipping_address}
                  onChange={(e) => setOrderEditForm((f) => ({ ...f, shipping_address: e.target.value }))}
                  placeholder="Индекс, город, улица, дом..."
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">배송 추적 URL (СДЭК, Почта России 등)</label>
                <input
                  type="url"
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  value={orderEditForm.tracking_url}
                  onChange={(e) => setOrderEditForm((f) => ({ ...f, tracking_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={orderSaving}
                onClick={async () => {
                  if (!supabase || orderSaving) return;
                  setOrderSaving(true);
                  setError(null);
                  const payload = {
                    receiver_name: orderEditForm.receiver_name.trim() || null,
                    receiver_phone: orderEditForm.receiver_phone.trim() || null,
                    shipping_address: orderEditForm.shipping_address.trim() || null,
                    tracking_url: orderEditForm.tracking_url.trim() || null,
                  };
                  try {
                    const { data: updated, error: err } = await supabase
                      .from('orders')
                      .update(payload)
                      .eq('id', selectedOrder.id)
                      .select('id, receiver_name, receiver_phone, shipping_address, tracking_url')
                      .single();
                    if (err) {
                      console.error('[Admin] order update failed:', err);
                      setError(err.message || '저장 실패. 관리자 RLS 정책 확인 필요.');
                      return;
                    }
                    if (!updated) {
                      setError('저장 후 데이터를 불러오지 못했습니다.');
                      return;
                    }
                    setOrdersList((prev) =>
                      prev.map((o) =>
                        o.id === selectedOrder.id
                          ? { ...o, ...payload }
                          : o
                      )
                    );
                    setSelectedOrder(null);
                    setSaveSuccessAt(Date.now());
                  } catch (e) {
                    setError(e instanceof Error ? e.message : '저장 실패');
                  } finally {
                    setOrderSaving(false);
                  }
                }}
                className="rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {orderSaving ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-full border border-slate-200 px-4 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
};

