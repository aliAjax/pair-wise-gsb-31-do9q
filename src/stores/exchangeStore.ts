import { defineStore } from 'pinia';

import { exchangeApi } from '@/api/exchangeApi';
import { ExchangeStatus } from '@/constants/exchange';
import { PAGE_MESSAGES } from '@/constants/messages';
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
    // exchangeApi.list() 会顺带清扫到期请求并释放物品，所以物品列表也要一起刷新
    async refreshAll() {
      this.exchanges = await exchangeApi.list();
      const itemStore = useItemStore();
      await itemStore.hydrate();
    },
    async hydrate() {
      this.loading = true;
      try {
        await this.refreshAll();
      } finally {
        this.loading = false;
      }
    },
    async sweepExpired() {
      const pendingBefore = new Set(
        this.exchanges.filter((item) => item.status === ExchangeStatus.PENDING).map((item) => item.id),
      );
      await this.refreshAll();
      const closedCount = this.exchanges.filter(
        (item) => item.status === ExchangeStatus.EXPIRED && pendingBefore.has(item.id),
      ).length;
      if (closedCount > 0) {
        message(PAGE_MESSAGES.exchangeAutoClosedNotice, 'info');
      }
    },
    async create(draft: ExchangeDraft) {
      try {
        const exchange = await exchangeApi.create({ ...draft, status: ExchangeStatus.PENDING });
        await this.refreshAll();
        message('交换请求已发出，72 小时内等待对方确认', 'success');
        return exchange;
      } catch (error) {
        message(error instanceof Error ? error.message : '发起交换失败', 'error');
        return null;
      }
    },
    async accept(id: string) {
      await this.runTransition(id, ExchangeStatus.ACCEPTED, '已同意交换');
    },
    async reject(id: string) {
      await this.runTransition(id, ExchangeStatus.REJECTED, '已拒绝交换，双方物品恢复可交换');
    },
    async complete(id: string) {
      await this.runTransition(id, ExchangeStatus.COMPLETED, '交换已完成，双方物品状态已更新');
    },
    async runTransition(id: string, status: ExchangeStatus, successText: string) {
      try {
        await exchangeApi.transition(id, status);
        await this.refreshAll();
        message(successText, 'success');
      } catch (error) {
        // 到期后物主无法再确认：刷新列表让卡片变成已关闭，并提示原因
        await this.refreshAll();
        message(error instanceof Error ? error.message : '操作失败', 'error');
      }
    },
  },
});
