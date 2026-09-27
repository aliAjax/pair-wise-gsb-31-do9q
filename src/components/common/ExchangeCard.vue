<template>
  <article class="exchange-card">
    <header>
      <span class="status-pill" :class="statusToneClass(exchange.status)">
        {{ formatExchangeStatus(exchange.status) }}
      </span>
      <small>{{ formatDate(exchange.updated_at) }}</small>
    </header>

    <!-- 待确认：展示剩余有效期，到期瞬间触发自动关闭 -->
    <div v-if="exchange.status === ExchangeStatus.PENDING" class="exchange-card__deadline" :class="{ urgent: isUrgent }">
      <span>距自动关闭</span>
      <strong>{{ formatCountdown(remainingMs) }}</strong>
    </div>
    <!-- 已拒绝 / 已关闭：展示保留下来的关闭原因 -->
    <div v-else-if="isClosed" class="exchange-card__reason">
      <span>关闭原因</span>
      <strong>{{ formatCloseReason(exchange.status, exchange.close_reason) }}</strong>
    </div>

    <div class="exchange-card__items">
      <div>
        <span>拿出</span>
        <strong>{{ fromItem?.title ?? '未知物品' }}</strong>
        <small v-if="fromItem">当前状态：{{ formatItemStatus(fromItem.status) }}</small>
      </div>
      <div>
        <span>换取</span>
        <strong>{{ toItem?.title ?? '未知物品' }}</strong>
        <small v-if="toItem">当前状态：{{ formatItemStatus(toItem.status) }}</small>
      </div>
    </div>
    <p>{{ exchange.message || formatStatusMessage(exchange.status) }}</p>
    <footer>
      <span v-if="fromUser && toUser">{{ fromUser.nickname }} → {{ toUser.nickname }}</span>
      <div v-if="canOperate" class="exchange-card__actions">
        <button v-if="exchange.status === ExchangeStatus.PENDING" type="button" @click="$emit('accept', exchange.id)">
          同意
        </button>
        <button v-if="exchange.status === ExchangeStatus.PENDING" type="button" @click="$emit('reject', exchange.id)">
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

import { ExchangeStatus, getExchangeRemainingMs } from '@/constants/exchange';
import type { Exchange } from '@/models/exchange';
import type { Item } from '@/models/item';
import type { User } from '@/models/user';
import { useAuthStore } from '@/stores/authStore';
import {
  formatCloseReason,
  formatCountdown,
  formatDate,
  formatExchangeStatus,
  formatItemStatus,
  formatStatusMessage,
  statusToneClass,
} from '@/utils/formatters';

const props = defineProps<{
  exchange: Exchange;
  items: Item[];
  users: User[];
}>();

const emit = defineEmits<{
  accept: [id: string];
  reject: [id: string];
  complete: [id: string];
  expired: [id: string];
}>();

const authStore = useAuthStore();
const fromItem = computed(() => props.items.find((item) => item.id === props.exchange.from_item_id));
const toItem = computed(() => props.items.find((item) => item.id === props.exchange.to_item_id));
const fromUser = computed(() => props.users.find((user) => user.id === props.exchange.from_user_id));
const toUser = computed(() => props.users.find((user) => user.id === props.exchange.to_user_id));
const canOperate = computed(
  () =>
    authStore.currentUser?.id === props.exchange.to_user_id ||
    (authStore.currentUser?.id === props.exchange.from_user_id && props.exchange.status === ExchangeStatus.ACCEPTED),
);

const isClosed = computed(
  () => props.exchange.status === ExchangeStatus.REJECTED || props.exchange.status === ExchangeStatus.EXPIRED,
);

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
let expiredFired = false;

const remainingMs = computed(() => getExchangeRemainingMs(props.exchange.expires_at, now.value));
// 剩余不足 6 小时进入紧迫样式
const isUrgent = computed(() => remainingMs.value <= 1000 * 60 * 60 * 6);

onMounted(() => {
  if (props.exchange.status !== ExchangeStatus.PENDING) return;
  timer = setInterval(() => {
    now.value = Date.now();
    if (remainingMs.value <= 0 && !expiredFired) {
      expiredFired = true;
      if (timer) clearInterval(timer);
      emit('expired', props.exchange.id);
    }
  }, 1000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>
