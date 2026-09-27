<template>
  <article class="exchange-card">
    <header>
      <span class="status-pill" :class="statusToneClass(exchange.status)">
        {{ formatExchangeStatus(exchange.status) }}
      </span>
      <small>{{ formatDate(exchange.updated_at) }}</small>
    </header>
    <div class="exchange-card__items">
      <div>
        <span>拿出</span>
        <strong>{{ fromItem?.title ?? '未知物品' }}</strong>
      </div>
      <div>
        <span>换取</span>
        <strong>{{ toItem?.title ?? '未知物品' }}</strong>
      </div>
    </div>
    <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>
    <p v-if="isPending" class="exchange-card__deadline">
      {{ formatRemainingTime(exchange.expires_at, now) }} · {{ formatDate(exchange.expires_at) }} 到期
    </p>
    <p v-else-if="exchange.status === ExchangeStatus.EXPIRED" class="exchange-card__closed">
      关闭原因：{{ exchange.closed_reason ?? formatStatusMessage(exchange.status) }}
    </p>
    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canOperate" class="exchange-card__actions">
        <button v-if="isPending && !isLocallyExpired" type="button" @click="$emit('accept', exchange.id)">
          同意
        </button>
        <button v-if="isPending && !isLocallyExpired" type="button" @click="$emit('reject', exchange.id)">
          拒绝
        </button>
        <button v-if="exchange.status === ExchangeStatus.ACCEPTED" type="button" @click="$emit('complete', exchange.id)">
          完成
        </button>
      </div>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import { ExchangeStatus } from '@/constants/exchange';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import {
  formatDate,
  formatExchangeStatus,
  formatRemainingTime,
  formatStatusMessage,
  statusToneClass,
} from '@/utils/formatters';

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
}>();

defineEmits<{
  accept: [id: string];
  reject: [id: string];
  complete: [id: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));
const isPending = computed(() => props.exchange.status === ExchangeStatus.PENDING);

// 剩余时间倒计时：每 30 秒刷新一次，到期后隐藏操作按钮，等待系统清扫关闭
const now = ref(Date.now());
let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    now.value = Date.now();
  }, 30 * 1000);
});
onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer);
});
const isLocallyExpired = computed(
  () => isPending.value && new Date(props.exchange.expires_at).getTime() <= now.value,
);

const canOperate = computed(
  () =>
    authStore.currentUser?.id === props.exchange.to_user_id ||
    (authStore.currentUser?.id === props.exchange.from_user_id && props.exchange.status === ExchangeStatus.ACCEPTED),
);
</script>
