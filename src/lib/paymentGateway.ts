/**
 * 결제 게이트웨이 추상화
 * - 지금은 PG 미연동: executePayment는 즉시 성공만 반환
 * - 추후 Stripe / 러시아 로컬 PG 연동 시 이 파일의 executePayment 구현만 교체
 */

export type PaymentSuccess = {
  success: true;
  /** PG사 거래 고유번호 (Stripe payment_intent_id 등) */
  externalTransactionId?: string | null;
  /** PG사 원문 응답 (분쟁·영수증 확인용) */
  rawResponse?: Record<string, unknown> | null;
};

export type PaymentFailure = {
  success: false;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export type PaymentResult = PaymentSuccess | PaymentFailure;

/** 결제 승인 요청 파라미터 (PG 연동 시 확장) */
export type PaymentRequest = {
  orderId: string;
  totalCents: number;
  /** 통화 코드 (추후 PG별 확장) */
  currency?: string;
};

/**
 * 실제 결제 승인 수행.
 * - 현재: PG 미연동이므로 항상 success: true 반환
 * - PG 연동 시: 여기서 Stripe/로컬 PG API 호출 후 externalTransactionId, rawResponse 반환
 */
export async function executePayment(_request: PaymentRequest): Promise<PaymentResult> {
  // TODO: PG 연동 시 이 블록을 PG사 API 호출로 교체
  await new Promise((r) => setTimeout(r, 100)); // 시뮬레이션 지연
  return { success: true };
}
