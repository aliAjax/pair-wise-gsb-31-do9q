<template>
  <van-config-provider :theme="vantTheme">
    <GlobalErrorBoundary>
      <div class="app-shell">
        <header class="topbar">
          <RouterLink class="brand" to="/home">
            <span>ReSwap</span>
            <small>物尽其用</small>
          </RouterLink>
          <nav>
            <RouterLink to="/home">首页</RouterLink>
            <RouterLink to="/publish">发布</RouterLink>
            <RouterLink to="/exchanges">交换</RouterLink>
            <RouterLink to="/profile">我的</RouterLink>
          </nav>
          <button class="theme-toggle" type="button" @click="themeStore.toggle">
            {{ themeStore.token.label }}
          </button>
        </header>
        <main>
          <RouterView />
        </main>
      </div>
    </GlobalErrorBoundary>
  </van-config-provider>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { RouterLink, RouterView } from 'vue-router';
import { ConfigProvider as VanConfigProvider } from 'vant';

import GlobalErrorBoundary from '@/components/common/GlobalErrorBoundary';
import { useAuthStore } from '@/stores/authStore';
import { useExchangeStore } from '@/stores/exchangeStore';
import { useItemStore } from '@/stores/itemStore';
import { useThemeStore } from '@/stores/themeStore';
import { toVantTheme } from '@/utils/themeUtils';

const authStore = useAuthStore();
const itemStore = useItemStore();
const exchangeStore = useExchangeStore();
const themeStore = useThemeStore();
const vantTheme = computed(() => toVantTheme(themeStore.theme));

// 待确认请求 72 小时到期自动关闭：全局定时扫描，保证任何页面都能释放物品
let expiryTimer: ReturnType<typeof setInterval> | undefined;
const sweep = () => void exchangeStore.sweepExpired();
const onVisible = () => {
  if (document.visibilityState === 'visible') sweep();
};

onMounted(async () => {
  themeStore.hydrate();
  await Promise.all([authStore.hydrate(), itemStore.hydrate(), exchangeStore.hydrate()]);
  await exchangeStore.sweepExpired();
  expiryTimer = setInterval(sweep, 1000 * 30);
  document.addEventListener('visibilitychange', onVisible);
});

onBeforeUnmount(() => {
  if (expiryTimer) clearInterval(expiryTimer);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>
