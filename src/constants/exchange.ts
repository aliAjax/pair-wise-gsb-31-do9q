export enum ExchangeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

/** 待确认请求的有效期：72 小时（毫秒） */
export const PENDING_EXCHANGE_TTL = 1000 * 60 * 60 * 72;

export const EXCHANGE_STATUS_OPTIONS = [
  { label: '待确认', value: ExchangeStatus.PENDING },
  { label: '已同意', value: ExchangeStatus.ACCEPTED },
  { label: '已拒绝', value: ExchangeStatus.REJECTED },
  { label: '已完成', value: ExchangeStatus.COMPLETED },
  { label: '已关闭', value: ExchangeStatus.EXPIRED },
];

export const EXCHANGE_ACTION_FLOW: Record<ExchangeStatus, ExchangeStatus[]> = {
  [ExchangeStatus.PENDING]: [ExchangeStatus.ACCEPTED, ExchangeStatus.REJECTED],
  [ExchangeStatus.ACCEPTED]: [ExchangeStatus.COMPLETED],
  [ExchangeStatus.REJECTED]: [],
  [ExchangeStatus.COMPLETED]: [],
  // 到期自动关闭后，物主无法再确认：已关闭单不允许任何流转，重发需新建请求
  [ExchangeStatus.EXPIRED]: [],
};

export const EXCHANGE_STORAGE_HINTS = {
  statusKey: 'reswap:exchanges',
  statusTouchedBy: ['models/exchange.ts', 'stores/exchangeStore.ts', 'components/common/ExchangeCard.vue'],
};

/** 计算待确认请求的截止时间（ISO 字符串） */
export const buildExpiresAt = (createdAt: string, ttl: number = PENDING_EXCHANGE_TTL) =>
  new Date(new Date(createdAt).getTime() + ttl).toISOString();

/** 请求是否已超过待确认有效期 */
export const isExchangeExpired = (expiresAt: string, now: number = Date.now()) =>
  new Date(expiresAt).getTime() <= now;

/** 距离截止还剩多少毫秒（不会小于 0） */
export const getExchangeRemainingMs = (expiresAt: string, now: number = Date.now()) =>
  Math.max(0, new Date(expiresAt).getTime() - now);
