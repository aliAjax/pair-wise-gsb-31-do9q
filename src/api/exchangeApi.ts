import { buildExpiresAt, EXCHANGE_ACTION_FLOW, ExchangeStatus, isExchangeExpired } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { CLOSE_REASON_MAP, EXCHANGE_RULE_MESSAGES } from '@/constants/messages';
import type { Exchange, ExchangeDraft } from '@/models/exchange';

import { itemApi } from './itemApi';
import { storage, STORAGE_KEYS } from '@/utils/storage';

const seedExchanges: Exchange[] = [
  {
    id: 'exchange_seed',
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'item_chair',
    to_item_id: 'item_camera',
    status: ExchangeStatus.PENDING,
    message: '露营椅换拍立得，可以同城当面交换。',
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    expires_at: buildExpiresAt(new Date(Date.now() - 1000 * 60 * 60).toISOString()),
    close_reason: '',
  },
];

/** 读取原始交换记录（不做任何到期处理），避免与自动关闭逻辑递归 */
async function readRaw(): Promise<Exchange[]> {
  const exchanges = await storage.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
  if (exchanges.length) return exchanges;
  // 返回持久化后的副本，避免后续状态流转直接改动内存中的种子数组
  return storage.set(STORAGE_KEYS.exchanges, seedExchanges);
}

async function persist(exchanges: Exchange[]): Promise<Exchange[]> {
  await storage.set(STORAGE_KEYS.exchanges, exchanges);
  return exchanges;
}

/**
 * 把仍占用物品的请求里的物品恢复为可交换（仅在物品确实处于交换中时改，避免覆盖已下架等状态）。
 * 单次原子批量写入，避免并发更新相互覆盖。
 */
async function releaseItems(exchange: Exchange): Promise<void> {
  const items = await itemApi.list();
  const ids = new Set([exchange.from_item_id, exchange.to_item_id]);
  const updates = items
    .filter((item) => ids.has(item.id) && item.status === ItemStatus.BOOKED)
    .map((item) => ({ id: item.id, status: ItemStatus.AVAILABLE }));
  if (updates.length) {
    await itemApi.setStatusMany(updates);
  }
}

/**
 * 到期扫描：把所有超过 72 小时仍待确认的请求自动关闭，
 * 保留原记录（仅写入关闭原因），并恢复双方物品为可交换。
 * 返回被自动关闭的请求数量。
 */
async function sweepExpired(exchanges: Exchange[]): Promise<{ exchanges: Exchange[]; closed: number }> {
  const now = Date.now();
  const due = exchanges.filter(
    (item) => item.status === ExchangeStatus.PENDING && isExchangeExpired(item.expires_at, now),
  );
  if (!due.length) return { exchanges, closed: 0 };

  const dueIds = new Set(due.map((item) => item.id));
  const closedAt = new Date().toISOString();
  // 一次性原子释放所有到期请求占用的物品
  const items = await itemApi.list();
  const dueItemIds = new Set(due.flatMap((item) => [item.from_item_id, item.to_item_id]));
  const releases = items
    .filter((item) => dueItemIds.has(item.id) && item.status === ItemStatus.BOOKED)
    .map((item) => ({ id: item.id, status: ItemStatus.AVAILABLE }));
  if (releases.length) await itemApi.setStatusMany(releases);
  const next = exchanges.map((item) =>
    dueIds.has(item.id)
      ? {
          ...item,
          status: ExchangeStatus.EXPIRED,
          close_reason: CLOSE_REASON_MAP[ExchangeStatus.EXPIRED] ?? '',
          updated_at: closedAt,
        }
      : item,
  );
  await persist(next);
  return { exchanges: next, closed: due.length };
}

export const exchangeApi = {
  async list(): Promise<Exchange[]> {
    const raw = await readRaw();
    // 兼容历史数据：为缺少截止时间的待确认记录补算 72 小时有效期
    const backfilled = raw.map((item) =>
      item.status === ExchangeStatus.PENDING && !item.expires_at
        ? { ...item, expires_at: buildExpiresAt(item.created_at), close_reason: item.close_reason ?? '' }
        : item,
    );
    const changed = backfilled.some((item, index) => item !== raw[index]);
    const { exchanges } = await sweepExpired(changed ? await persist(backfilled) : backfilled);
    return exchanges;
  },

  async create(draft: ExchangeDraft): Promise<Exchange> {
    const exchanges = await this.list();
    const targetItem = await itemApi.detail(draft.to_item_id);
    if (!targetItem || targetItem.status !== ItemStatus.AVAILABLE) {
      throw new Error(EXCHANGE_RULE_MESSAGES.targetUnavailable);
    }
    const ownItem = await itemApi.detail(draft.from_item_id);
    if (!ownItem || ownItem.status !== ItemStatus.AVAILABLE) {
      throw new Error(EXCHANGE_RULE_MESSAGES.ownItemUnavailable);
    }
    // 双方物品都不能处于任何未结束的交换流程，防止一单占用期间再被发起
    const locked = exchanges.some(
      (item) =>
        (item.status === ExchangeStatus.PENDING || item.status === ExchangeStatus.ACCEPTED) &&
        (item.from_item_id === draft.from_item_id ||
          item.from_item_id === draft.to_item_id ||
          item.to_item_id === draft.from_item_id ||
          item.to_item_id === draft.to_item_id),
    );
    if (locked) {
      throw new Error(EXCHANGE_RULE_MESSAGES.itemInExchange);
    }

    const createdAt = new Date().toISOString();
    const nextExchange: Exchange = {
      ...draft,
      id: storage.createId('exchange'),
      status: draft.status ?? ExchangeStatus.PENDING,
      created_at: createdAt,
      updated_at: createdAt,
      expires_at: buildExpiresAt(createdAt),
      close_reason: '',
    };
    // 待确认期间双方物品进入交换中，被占用（原子批量写入）
    await itemApi.setStatusMany([
      { id: draft.from_item_id, status: ItemStatus.BOOKED },
      { id: draft.to_item_id, status: ItemStatus.BOOKED },
    ]);
    await persist([nextExchange, ...exchanges]);
    return nextExchange;
  },

  async transition(id: string, status: ExchangeStatus): Promise<Exchange> {
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    // 到期后物主无法再确认：任何对已关闭单的流转都拒绝
    if (current.status === ExchangeStatus.EXPIRED) {
      throw new Error(EXCHANGE_RULE_MESSAGES.expiredCannotConfirm);
    }
    if (current.status === ExchangeStatus.PENDING && isExchangeExpired(current.expires_at)) {
      // 并发兜底：点击确认时刚好跨过截止点，先触发一次扫描关闭并释放物品，再拒绝本次确认
      await this.list();
      throw new Error(EXCHANGE_RULE_MESSAGES.expiredCannotConfirm);
    }
    if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
      throw new Error('当前状态不允许该操作');
    }
    const nextExchange: Exchange = {
      ...current,
      status,
      close_reason:
        status === ExchangeStatus.REJECTED ? (CLOSE_REASON_MAP[ExchangeStatus.REJECTED] ?? '') : current.close_reason,
      updated_at: new Date().toISOString(),
    };
    if (status === ExchangeStatus.COMPLETED) {
      await itemApi.setStatusMany([
        { id: current.from_item_id, status: ItemStatus.EXCHANGED },
        { id: current.to_item_id, status: ItemStatus.EXCHANGED },
      ]);
    } else if (status === ExchangeStatus.REJECTED) {
      // 被拒绝后双方物品恢复可交换
      await releaseItems(current);
    }
    await persist(exchanges.map((item) => (item.id === id ? nextExchange : item)));
    return nextExchange;
  },

  /** 供界面定时调用的到期扫描入口，返回新关闭的请求数量 */
  async sweepExpired(): Promise<number> {
    const { closed } = await sweepExpired(await readRaw());
    return closed;
  },
};
