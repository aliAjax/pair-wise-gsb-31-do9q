<template>
  <section class="page exchanges-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">交换管理</p>
        <h1>让每一次交换都有期限</h1>
      </div>
    </div>

    <div class="stats-row">
      <span>全部 {{ stats.total }}</span>
      <span>待确认 {{ stats.pending }}</span>
      <span>已同意 {{ stats.accepted }}</span>
      <span>已完成 {{ stats.completed }}</span>
      <span>已关闭 {{ stats.expired + stats.rejected }}</span>
    </div>

    <div class="segmented">
      <button :class="{ active: tab === 'sent' }" type="button" @click="tab = 'sent'">我发起的</button>
      <button :class="{ active: tab === 'received' }" type="button" @click="tab = 'received'">我收到的</button>
      <select v-model="exchangeStore.statusFilter">
        <option value="all">全部状态</option>
        <option v-for="option in EXCHANGE_STATUS_OPTIONS" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
    </div>

    <p class="exchanges-hint">待确认请求 72 小时内未处理会自动关闭，关闭后双方物品恢复可交换，可重新发起。</p>

    <div v-if="visibleExchanges.length" class="exchange-list">
      <ExchangeCard
        v-for="exchange in visibleExchanges"
        :key="exchange.id"
        :exchange="exchange"
        :items="itemStore.items"
        :users="authStore.users"
        @accept="exchangeStore.accept"
        @reject="exchangeStore.reject"
        @complete="exchangeStore.complete"
        @expired="handleExpired"
      />
    </div>
    <EmptyState
      v-else
      title="暂无交换请求"
      :description="PAGE_MESSAGES.exchangeEmpty"
      mark="换"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import EmptyState from '@/components/common/EmptyState.vue';
import ExchangeCard from '@/components/common/ExchangeCard.vue';
import { EXCHANGE_STATUS_OPTIONS } from '@/constants/exchange';
import { PAGE_MESSAGES } from '@/constants/messages';
import { useExchangeStats } from '@/hooks/useExchangeStats';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { message } from '@/utils/message';

const authStore = useAuthStore();
const itemStore = useItemStore();
const exchangeStore = useExchangeStore();
const tab = ref<'sent' | 'received'>('sent');

const mine = computed(() => {
  if (!authStore.currentUser) return [];
  const list = tab.value === 'sent' ? exchangeStore.sent(authStore.currentUser.id) : exchangeStore.received(authStore.currentUser.id);
  return exchangeStore.statusFilter === 'all'
    ? list
    : list.filter((item) => item.status === exchangeStore.statusFilter);
});
const visibleExchanges = computed(() => mine.value);
const stats = useExchangeStats(() => exchangeStore.exchanges);

// 倒计时归零（或切回页面 / 定时扫描）时，执行到期自动关闭
const handleExpired = async () => {
  const closed = await exchangeStore.sweepExpired();
  if (closed > 0) {
    message('有待确认请求超过 72 小时，已自动关闭，物品恢复可交换', 'info');
  }
};

let sweepTimer: ReturnType<typeof setInterval> | undefined;
const onVisible = () => {
  if (document.visibilityState === 'visible') void handleExpired();
};

onMounted(() => {
  void handleExpired();
  // 兜底：页面长时间停留时每分钟扫描一次，防止计时器不精确
  sweepTimer = setInterval(() => void handleExpired(), 1000 * 60);
  document.addEventListener('visibilitychange', onVisible);
});

onBeforeUnmount(() => {
  if (sweepTimer) clearInterval(sweepTimer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>
