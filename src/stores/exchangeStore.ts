import { defineStore } from 'pinia';

import { exchangeApi } from '@/api/exchangeApi';
import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange, ExchangeDraft } from '@/models/exchange';
import { useItemStore } from '@/stores/itemStore';
import { message } from '@/utils/message';

export const useExchangeStore = defineStore('exchanges', {
  state: () => ({
    exchanges: [] as Exchange[],
    statusFilter: 'all' as ExchangeStatus | 'all',
    loading: false,
  }),
  getters: {
    sent: (state) => (userId: string) => state.exchanges.filter((item) => item.from_user_id === userId),
    received: (state) => (userId: string) => state.exchanges.filter((item) => item.to_user_id === userId),
    filtered: (state) => {
      if (state.statusFilter === 'all') return state.exchanges;
      return state.exchanges.filter((item) => item.status === state.statusFilter);
    },
  },
  actions: {
    async hydrate() {
      this.loading = true;
      try {
        this.exchanges = await exchangeApi.list();
        // list() 内部会做到期自动关闭并释放物品，刷新物品缓存保证个人页看到“可交换”
        await useItemStore().hydrate();
      } finally {
        this.loading = false;
      }
    },
    async create(draft: ExchangeDraft) {
      // 业务校验失败（物品被占用等）抛出由调用方处理；成功才提示
      const exchange = await exchangeApi.create({ ...draft, status: ExchangeStatus.PENDING });
      this.exchanges = await exchangeApi.list();
      await useItemStore().hydrate();
      message('交换请求已发出，物主需在 72 小时内确认', 'success');
      return exchange;
    },
    async accept(id: string) {
      try {
        await exchangeApi.transition(id, ExchangeStatus.ACCEPTED);
        this.exchanges = await exchangeApi.list();
        await useItemStore().hydrate();
        message('已同意交换', 'success');
      } catch (error) {
        message(error instanceof Error ? error.message : '操作失败', 'error');
        await this.hydrate();
      }
    },
    async reject(id: string) {
      try {
        await exchangeApi.transition(id, ExchangeStatus.REJECTED);
        this.exchanges = await exchangeApi.list();
        await useItemStore().hydrate();
        message('已拒绝交换，双方物品已恢复可交换', 'success');
      } catch (error) {
        message(error instanceof Error ? error.message : '操作失败', 'error');
        await this.hydrate();
      }
    },
    async complete(id: string) {
      try {
        await exchangeApi.transition(id, ExchangeStatus.COMPLETED);
        this.exchanges = await exchangeApi.list();
        await useItemStore().hydrate();
        message('交换已完成，双方物品状态已更新', 'success');
      } catch (error) {
        message(error instanceof Error ? error.message : '操作失败', 'error');
        await this.hydrate();
      }
    },
    /** 到期自动关闭扫描；有关闭发生时刷新本地状态并返回数量 */
    async sweepExpired() {
      const closed = await exchangeApi.sweepExpired();
      if (closed > 0) {
        this.exchanges = await exchangeApi.list();
        await useItemStore().hydrate();
      }
      return closed;
    },
  },
});
