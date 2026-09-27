/* eslint-disable no-console */
// 交换请求 72 小时有效期的逻辑验证脚本（node 运行，非单元测试框架）
// 运行方式见 package.json 注释或 README；通过 esbuild 打包后执行。

import { exchangeApi } from '@/api/exchangeApi';
import { itemApi } from '@/api/itemApi';
import { ExchangeStatus } from '@/constants/exchange';
import { ItemStatus } from '@/constants/item';
import { FORM_MESSAGES, PAGE_MESSAGES } from '@/constants/messages';
import type { Exchange } from '@/models/exchange';
import { storage, STORAGE_KEYS } from '@/utils/storage';

// ---- localStorage 内存版 shim（必须在 import storage 前生效，这里模块内直接覆盖全局即可） ----
const localStore = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => localStore.get(key) ?? null,
  setItem: (key: string, value: string) => void localStore.set(key, String(value)),
  removeItem: (key: string) => void localStore.delete(key),
};

let failures = 0;
const assert = (condition: boolean, label: string) => {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}`);
  }
};

const itemStatus = async (id: string) => (await itemApi.detail(id))?.status;

const main = async () => {
  console.log('1. 种子数据：待确认请求占用双方物品，并带有 72h 截止时间');
  const seeded = await exchangeApi.list();
  const seed = seeded.find((item) => item.id === 'exchange_seed');
  assert(Boolean(seed), '种子交换请求存在');
  assert(seed!.status === ExchangeStatus.PENDING, '种子请求为待确认');
  assert(Boolean(seed!.expires_at), '种子请求带有 expires_at');
  const ttlHours = (new Date(seed!.expires_at).getTime() - new Date(seed!.created_at).getTime()) / 3600000;
  assert(ttlHours === 72, `有效期为 72 小时（实际 ${ttlHours}）`);
  assert((await itemStatus('item_camera')) === ItemStatus.BOOKED, '目标物品被占用');
  assert((await itemStatus('item_chair')) === ItemStatus.BOOKED, '发起人物品被占用');

  console.log('2. 到期自动关闭：保留原记录与关闭原因，物品恢复可交换');
  const expiredDraft: Exchange = {
    id: 'exchange_old',
    from_user_id: 'user_chen',
    to_user_id: 'user_me',
    from_item_id: 'item_books',
    to_item_id: 'item_chair',
    status: ExchangeStatus.PENDING,
    message: '老请求，已超时',
    expires_at: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 100).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 100).toISOString(),
  };
  await storage.set(STORAGE_KEYS.exchanges, [expiredDraft, ...seeded]);
  const swept = await exchangeApi.list();
  const closed = swept.find((item) => item.id === 'exchange_old');
  assert(closed!.status === ExchangeStatus.EXPIRED, '超时请求被自动关闭');
  assert(closed!.closed_reason === PAGE_MESSAGES.exchangeAutoClosed, '关闭原因已写入原记录');
  assert(closed!.message === '老请求，已超时', '原始留言等记录内容保留');
  assert((await itemStatus('item_books')) === ItemStatus.AVAILABLE, '到期后物品恢复可交换');
  assert((await itemStatus('item_chair')) === ItemStatus.BOOKED, '仍被有效请求占用的物品不释放');

  console.log('3. 到期后物主无法再确认');
  let expiredError = '';
  try {
    await exchangeApi.transition('exchange_old', ExchangeStatus.ACCEPTED);
  } catch (error) {
    expiredError = error instanceof Error ? error.message : '';
  }
  assert(expiredError === FORM_MESSAGES.exchangeExpired, `确认被拒绝并提示原因（${expiredError}）`);
  const afterFailedConfirm = (await exchangeApi.list()).find((item) => item.id === 'exchange_old');
  assert(afterFailedConfirm!.status === ExchangeStatus.EXPIRED, '状态保持已关闭');

  console.log('4. 拒绝释放双方物品');
  await exchangeApi.transition('exchange_seed', ExchangeStatus.REJECTED);
  assert((await itemStatus('item_camera')) === ItemStatus.AVAILABLE, '拒绝后目标物品恢复可交换');
  assert((await itemStatus('item_chair')) === ItemStatus.AVAILABLE, '拒绝后发起人物品恢复可交换');

  console.log('5. 同一物品重发时新建请求，不复活旧单');
  const recreated = await exchangeApi.create({
    from_user_id: 'user_me',
    to_user_id: 'user_lin',
    from_item_id: 'item_chair',
    to_item_id: 'item_camera',
    message: '再次发起同一批物品的交换',
  });
  const all = await exchangeApi.list();
  assert(recreated.id !== 'exchange_seed', '生成全新的请求 id');
  assert(all.some((item) => item.id === 'exchange_seed' && item.status === ExchangeStatus.REJECTED), '旧单保持已拒绝');
  assert(all.some((item) => item.id === recreated.id && item.status === ExchangeStatus.PENDING), '新请求为待确认');
  assert((await itemStatus('item_camera')) === ItemStatus.BOOKED, '新请求重新占用物品');

  console.log('6. 占用中的物品不可再被发起交换');
  let targetError = '';
  try {
    await exchangeApi.create({
      from_user_id: 'user_chen',
      to_user_id: 'user_lin',
      from_item_id: 'item_books',
      to_item_id: 'item_camera',
      message: '抢占已占用的目标物品',
    });
  } catch (error) {
    targetError = error instanceof Error ? error.message : '';
  }
  assert(targetError === '目标物品当前不可交换', `被占用的目标物品不可发起（${targetError}）`);
  let offerError = '';
  try {
    await exchangeApi.create({
      from_user_id: 'user_me',
      to_user_id: 'user_chen',
      from_item_id: 'item_chair',
      to_item_id: 'item_keyboard',
      message: '拿已占用的物品去交换',
    });
  } catch (error) {
    offerError = error instanceof Error ? error.message : '';
  }
  assert(offerError === FORM_MESSAGES.exchangeItemOccupied, `被占用的发起物不可再交换（${offerError}）`);

  console.log('7. 老版本数据兼容：缺少 expires_at 的记录自动补齐');
  const legacy: Exchange = {
    id: 'exchange_legacy',
    from_user_id: 'user_chen',
    to_user_id: 'user_me',
    from_item_id: 'item_books',
    to_item_id: 'item_chair',
    status: ExchangeStatus.REJECTED,
    message: '历史数据',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
    updated_at: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
  } as Exchange;
  delete (legacy as Partial<Exchange>).expires_at;
  await storage.set(STORAGE_KEYS.exchanges, [legacy, ...(await exchangeApi.list())]);
  const migrated = (await exchangeApi.list()).find((item) => item.id === 'exchange_legacy');
  assert(Boolean(migrated!.expires_at), 'expires_at 已按 created_at + 72h 补齐');
  assert(migrated!.status === ExchangeStatus.REJECTED, '已拒绝的历史记录不受清扫影响');

  console.log('8. 已完成记录不受有效期影响');
  await exchangeApi.transition(recreated.id, ExchangeStatus.ACCEPTED);
  await exchangeApi.transition(recreated.id, ExchangeStatus.COMPLETED);
  assert((await itemStatus('item_camera')) === ItemStatus.EXCHANGED, '完成后物品为已交换');
  const completedList = await exchangeApi.list();
  const completed = completedList.find((item) => item.id === recreated.id);
  assert(completed!.status === ExchangeStatus.COMPLETED, '已完成记录保持原状态');

  if (failures > 0) {
    console.error(`\n${failures} 项断言失败`);
    process.exit(1);
  }
  console.log('\n全部断言通过');
};

void main();
