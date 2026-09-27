import { EXCHANGE_ACTION_FLOW, EXCHANGE_PENDING_TTL_MS, ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { FORM_MESSAGES, PAGE_MESSAGES } from '@/constants/messages';
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
    expires_at: new Date(Date.now() - 1000 * 60 * 60 + EXCHANGE_PENDING_TTL_MS).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
  },
];

const isPendingExpired = (exchange: Exchange, now: number) =>
  exchange.status === ExchangeStatus.PENDING && new Date(exchange.expires_at).getTime() <= now;

/** 物品没有被其他待确认请求占用时，恢复为可交换 */
const releaseItemIfFree = async (exchanges: Exchange[], exceptId: string, itemId: string) => {
  const stillLocked = exchanges.some(
    (entry) =>
      entry.id !== exceptId &&
      entry.status === ExchangeStatus.PENDING &&
      (entry.from_item_id === itemId || entry.to_item_id === itemId),
  );
  if (stillLocked) return;
  const item = await itemApi.detail(itemId);
  if (item?.status === ItemStatus.BOOKED) {
    await itemApi.setStatus(itemId, ItemStatus.AVAILABLE);
  }
};

export const exchangeApi = {
  async list(): Promise<Exchange[]> {
    const stored = await storage.get<Exchange[]>(STORAGE_KEYS.exchanges, []);
    const exchanges = stored.length ? stored : seedExchanges;
    const now = Date.now();
    let changed = !stored.length;

    // 版本兼容：老数据没有 expires_at，按 created_at + 72h 补齐
    const normalized = exchanges.map((exchange) => {
      if (exchange.expires_at) return exchange;
      changed = true;
      return {
        ...exchange,
        expires_at: new Date(new Date(exchange.created_at).getTime() + EXCHANGE_PENDING_TTL_MS).toISOString(),
      };
    });

    // 到期清扫：待确认超过 72 小时自动关闭，保留原记录和关闭原因
    const closedIds: string[] = [];
    const swept = normalized.map((exchange) => {
      if (!isPendingExpired(exchange, now)) return exchange;
      changed = true;
      closedIds.push(exchange.id);
      return {
        ...exchange,
        status: ExchangeStatus.EXPIRED,
        closed_reason: PAGE_MESSAGES.exchangeAutoClosed,
        updated_at: new Date(now).toISOString(),
      };
    });

    if (changed) {
      await storage.set(STORAGE_KEYS.exchanges, swept);
    }

    // 关闭的请求释放双方物品；仍有效的请求确保双方物品处于占用中
    for (const id of closedIds) {
      const closed = swept.find((exchange) => exchange.id === id);
      if (!closed) continue;
      await releaseItemIfFree(swept, closed.id, closed.from_item_id);
      await releaseItemIfFree(swept, closed.id, closed.to_item_id);
    }
    for (const exchange of swept) {
      if (exchange.status !== ExchangeStatus.PENDING) continue;
      for (const itemId of [exchange.from_item_id, exchange.to_item_id]) {
        const item = await itemApi.detail(itemId);
        if (item?.status === ItemStatus.AVAILABLE) {
          await itemApi.setStatus(itemId, ItemStatus.BOOKED);
        }
      }
    }

    return swept;
  },

  async create(draft: ExchangeDraft): Promise<Exchange> {
    const exchanges = await this.list();
    const targetItem = await itemApi.detail(draft.to_item_id);
    if (!targetItem || targetItem.status !== ItemStatus.AVAILABLE) {
      throw new Error('目标物品当前不可交换');
    }
    const offerItem = await itemApi.detail(draft.from_item_id);
    if (!offerItem || offerItem.status !== ItemStatus.AVAILABLE) {
      throw new Error(FORM_MESSAGES.exchangeItemOccupied);
    }
    const now = Date.now();
    // 同一物品重发时永远新建请求，过期/拒绝的旧单保留原记录不复活
    const nextExchange: Exchange = {
      ...draft,
      id: storage.createId('exchange'),
      status: draft.status ?? ExchangeStatus.PENDING,
      expires_at: new Date(now + EXCHANGE_PENDING_TTL_MS).toISOString(),
      created_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    };
    await itemApi.setStatus(draft.from_item_id, ItemStatus.BOOKED);
    await itemApi.setStatus(draft.to_item_id, ItemStatus.BOOKED);
    await storage.set(STORAGE_KEYS.exchanges, [nextExchange, ...exchanges]);
    return nextExchange;
  },

  async transition(id: string, status: ExchangeStatus): Promise<Exchange> {
    // list() 会先把超时未确认的请求清扫为已关闭
    const exchanges = await this.list();
    const current = exchanges.find((item) => item.id === id);
    if (!current) throw new Error('交换请求不存在');
    if (current.status === ExchangeStatus.EXPIRED) {
      throw new Error(FORM_MESSAGES.exchangeExpired);
    }
    if (!EXCHANGE_ACTION_FLOW[current.status].includes(status)) {
      throw new Error('当前状态不允许该操作');
    }
    const nextExchange: Exchange = { ...current, status, updated_at: new Date().toISOString() };
    const nextExchanges = exchanges.map((item) => (item.id === id ? nextExchange : item));
    if (status === ExchangeStatus.COMPLETED) {
      await itemApi.setStatus(current.from_item_id, ItemStatus.EXCHANGED);
      await itemApi.setStatus(current.to_item_id, ItemStatus.EXCHANGED);
    }
    if (status === ExchangeStatus.REJECTED) {
      await releaseItemIfFree(nextExchanges, id, current.from_item_id);
      await releaseItemIfFree(nextExchanges, id, current.to_item_id);
    }
    await storage.set(STORAGE_KEYS.exchanges, nextExchanges);
    return nextExchange;
  },
};
