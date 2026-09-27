export enum ExchangeStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  COMPLETED = 'completed',
  EXPIRED = 'expired',
}

/** 待确认请求的有效期：72 小时，超时由系统自动关闭 */
export const EXCHANGE_PENDING_TTL_MS = 1000 * 60 * 60 * 72;

export const EXCHANGE_STATUS_OPTIONS = [
  { label: '待确认', value: ExchangeStatus.PENDING },
  { label: '已同意', value: ExchangeStatus.ACCEPTED },
  { label: '已拒绝', value: ExchangeStatus.REJECTED },
  { label: '已完成', value: ExchangeStatus.COMPLETED },
  { label: '已关闭', value: ExchangeStatus.EXPIRED },
];

// PENDING -> EXPIRED 由 exchangeApi 的到期清扫自动完成，不经过用户操作
export const EXCHANGE_ACTION_FLOW: Record<ExchangeStatus, ExchangeStatus[]> = {
  [ExchangeStatus.PENDING]: [ExchangeStatus.ACCEPTED, ExchangeStatus.REJECTED],
  [ExchangeStatus.ACCEPTED]: [ExchangeStatus.COMPLETED],
  [ExchangeStatus.REJECTED]: [],
  [ExchangeStatus.COMPLETED]: [],
  [ExchangeStatus.EXPIRED]: [],
};

export const EXCHANGE_STORAGE_HINTS = {
  statusKey: 'reswap:exchanges',
  statusTouchedBy: ['models/exchange.ts', 'stores/exchangeStore.ts', 'components/common/ExchangeCard.vue'],
};
