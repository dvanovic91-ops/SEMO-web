/**
 * 목업 데이터 통합 모듈
 *
 * 목업 일괄 제거 방법:
 * 1. 이 파일(src/data/mocks/index.ts)과 README를 삭제
 * 2. 아래 "사용처"에서 mock import 제거 후 실제 API(Supabase 등)로 교체
 *
 * 사용처:
 * - Admin.tsx: 대시보드 매출 그래프(일/주/월/기간), 상품별 매출
 * - ProfileReviews.tsx: 내 리뷰 목록
 * - ProfileOrders.tsx: 주문 내역
 * - ProfileTestResults.tsx: 테스트 결과
 * - ProfilePoints.tsx: 포인트 내역(목업 시)
 * - (추가 목업은 모두 여기에서 export하고 위 사용처 목록에 기록)
 */

// —— 플래그: true면 목업 사용. 한꺼번에 제거 시 각 사용처에서 이 조건 제거하고 API만 사용하도록 수정
export const USE_MOCK_DASHBOARD = true;
export const USE_MOCK_REVIEWS = true;
export const USE_MOCK_ORDERS = true;
export const USE_MOCK_TEST_RESULTS = true;
export const USE_MOCK_POINTS = true;

// —— 프로필: 리뷰
export const mockReviews: { id: string; product: string; text: string; date: string; rating: number }[] = [
  { id: '1', product: 'Beauty Box — Весна 2026', text: 'Очень понравился набор, крем идеально подошёл.', date: '2026-02-20', rating: 5 },
  { id: '2', product: 'Сыворотка для лица', text: 'Быстрая доставка, качество отличное.', date: '2026-01-08', rating: 4 },
];

// —— 프로필: 주문 (Order 타입은 ProfileOrders에서 re-export)
export interface MockOrderItem {
  id: string;
  name: string;
  quantity: number;
  price: number;
}
export interface MockShipmentTracking {
  status: string;
  message: string;
  date?: string;
}
export interface MockOrder {
  id: string;
  date: string;
  total: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  items: MockOrderItem[];
  tracking?: MockShipmentTracking[];
}
export const mockOrders: MockOrder[] = [
  {
    id: 'ORD-2026-001',
    date: '2026-02-25',
    total: 15900,
    status: 'shipped',
    items: [{ id: 'i1', name: 'Beauty Box — Весна 2026', quantity: 1, price: 15900 }],
    tracking: [
      { status: 'shipped', message: 'Отправлено', date: '2026-02-26' },
      { status: 'in_transit', message: 'В пути', date: '2026-02-27' },
    ],
  },
  {
    id: 'ORD-2026-002',
    date: '2026-01-10',
    total: 8900,
    status: 'delivered',
    items: [{ id: 'i2', name: 'Сыворотка для лица', quantity: 1, price: 8900 }],
    tracking: [{ status: 'delivered', message: 'Доставлено', date: '2026-01-15' }],
  },
];

// —— 프로필: 포인트 내역 (잔액과 합계 일치하도록 유지)
export interface MockPointHistoryItem {
  id: string;
  label: string;
  amount: number;
  date: string;
}
/** 목업 현재 잔액 (아래 mockPointHistory 합계와 동일하게 둠) */
export const mockPointBalance = 900;
export const mockPointHistory: MockPointHistoryItem[] = [
  { id: '1', label: 'Регистрация', amount: 100, date: '2026-01-15' },
  { id: '2', label: 'Тест типа кожи', amount: 50, date: '2026-02-01' },
  { id: '3', label: 'Заказ #1001', amount: -200, date: '2026-02-10' },
  { id: '4', label: 'Бонус', amount: 550, date: '2026-02-12' },
  { id: '5', label: 'Тест типа кожи (бонус)', amount: 400, date: '2026-02-15' },
];
// 100+50-200+550+400 = 900

// —— 프로필: 테스트 결과
export const mockTestResults: { id: string; type: string; date: string }[] = [
  { id: '1', type: 'Комбинированная', date: '2026-02-28' },
  { id: '2', type: 'Нормальная', date: '2026-01-15' },
];

// —— 대시보드: 매출 시계열 (일별·주별·월별·기간 선택 시 사용할 목업)
export type DashboardPeriodType = 'day' | 'week' | 'month' | 'range';

export interface RevenueDataPoint {
  /** 표시용 라벨 (예: "3 мар", "Неделя 1", "Март 2026") */
  label: string;
  /** 날짜 정렬/필터용 (YYYY-MM-DD 또는 주/월의 대표일) */
  dateKey: string;
  /** 매출 (루블) */
  revenue: number;
  /** 해당 기간에 팔린 상품 요약 (목업) */
  products?: { name: string; amount: number }[];
}

/** 일별 매출 목업 (최근 14일) */
function getDayLabels(count: number): RevenueDataPoint[] {
  const points: RevenueDataPoint[] = [];
  const now = new Date();
  const productNames = ['Beauty Box — Весна 2026', 'Сыворотка для лица', 'Крем для рук', 'Маска для лица'];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const revenue = 8000 + Math.floor(Math.random() * 12000) + (i === 0 ? 5000 : 0);
    const numProducts = 1 + Math.floor(Math.random() * 2);
    const products = Array.from({ length: numProducts }, (_, j) => ({
      name: productNames[j % productNames.length],
      amount: Math.floor(revenue / numProducts) + (j === 0 ? revenue % numProducts : 0),
    }));
    points.push({
      label: d.getDate() + ' ' + ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()],
      dateKey,
      revenue,
      products,
    });
  }
  return points;
}

/** 주별 매출 목업 (최근 8주) */
function getWeekLabels(count: number): RevenueDataPoint[] {
  const points: RevenueDataPoint[] = [];
  const productNames = ['Beauty Box — Весна 2026', 'Сыворотка для лица', 'Крем для рук'];
  for (let i = count - 1; i >= 0; i--) {
    const revenue = 35000 + Math.floor(Math.random() * 45000);
    const weekLabel = 'Неделя ' + (count - i);
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const dateKey = d.toISOString().slice(0, 10);
    points.push({
      label: weekLabel,
      dateKey,
      revenue,
      products: [
        { name: productNames[0], amount: Math.floor(revenue * 0.5) },
        { name: productNames[1], amount: Math.floor(revenue * 0.3) },
        { name: productNames[2], amount: revenue - Math.floor(revenue * 0.5) - Math.floor(revenue * 0.3) },
      ],
    });
  }
  return points;
}

/** 월별 매출 목업 (최근 12개월) */
function getMonthLabels(count: number): RevenueDataPoint[] {
  const points: RevenueDataPoint[] = [];
  const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const now = new Date();
  const productNames = ['Beauty Box — Весна 2026', 'Сыворотка для лица', 'Крем для рук', 'Маска для лица'];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const revenue = 80000 + Math.floor(Math.random() * 120000);
    const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-01';
    points.push({
      label: monthNames[d.getMonth()] + ' ' + d.getFullYear(),
      dateKey,
      revenue,
      products: [
        { name: productNames[0], amount: Math.floor(revenue * 0.4) },
        { name: productNames[1], amount: Math.floor(revenue * 0.25) },
        { name: productNames[2], amount: Math.floor(revenue * 0.2) },
        { name: productNames[3], amount: revenue - Math.floor(revenue * 0.85) },
      ],
    });
  }
  return points;
}

/**
 * 기간별 매출 목업 반환
 * range 시 startDate, endDate 사용 (문자열 YYYY-MM-DD)
 */
export function getMockRevenueSeries(
  period: DashboardPeriodType,
  startDate?: string,
  endDate?: string
): RevenueDataPoint[] {
  if (period === 'day') return getDayLabels(14);
  if (period === 'week') return getWeekLabels(8);
  if (period === 'month') return getMonthLabels(12);
  if (period === 'range' && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    const points: RevenueDataPoint[] = [];
    const productNames = ['Beauty Box — Весна 2026', 'Сыворотка для лица', 'Крем для рук'];
    for (let i = 0; i < Math.min(days, 90); i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (d > end) break;
      const dateKey = d.toISOString().slice(0, 10);
      const revenue = 5000 + Math.floor(Math.random() * 15000);
      points.push({
        label: d.getDate() + ' ' + ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()],
        dateKey,
        revenue,
        products: [
          { name: productNames[0], amount: Math.floor(revenue * 0.6) },
          { name: productNames[1], amount: revenue - Math.floor(revenue * 0.6) },
        ],
      });
    }
    return points;
  }
  return getDayLabels(14);
}

/** 상품별 매출 합계 목업 (대시보드 하단 표용) */
export const mockProductBreakdown: { productName: string; revenue: number; orderCount: number }[] = [
  { productName: 'Beauty Box — Весна 2026', revenue: 125000, orderCount: 8 },
  { productName: 'Сыворотка для лица', revenue: 89000, orderCount: 12 },
  { productName: 'Крем для рук', revenue: 45000, orderCount: 15 },
  { productName: 'Маска для лица', revenue: 32000, orderCount: 6 },
];
