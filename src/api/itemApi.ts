import { ItemCondition, ItemStatus } from '@/constants/item';
import type { Item, ItemDraft } from '@/models/item';

import { storage, STORAGE_KEYS } from '@/utils/storage';

const seedItems: Item[] = [
  {
    id: 'item_camera',
    user_id: 'user_lin',
    title: '富士拍立得 Mini 旧机',
    description: '成色干净，附一包相纸，想换小型蓝牙音箱或桌面灯。',
    category: '数码',
    condition: ItemCondition.GOOD,
    images: [],
    // 存在待确认交换请求 item_chair -> item_camera，确认期间双方物品被占用
    status: ItemStatus.BOOKED,
    location: '杭州 · 西湖',
    created_at: new Date().toISOString(),
  },
  {
    id: 'item_books',
    user_id: 'user_chen',
    title: '设计与产品书 6 本',
    description: '搬家清书柜，适合产品/视觉入门，接受换绿植、咖啡器具。',
    category: '书籍',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.AVAILABLE,
    location: '苏州 · 工业园',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
  },
  {
    id: 'item_chair',
    user_id: 'user_me',
    title: '可折叠露营椅',
    description: '去年买的，露营两次，有轻微使用痕迹，想换收纳盒。',
    category: '运动',
    condition: ItemCondition.GOOD,
    images: [],
    // 发起人拿出的物品同样在待确认期间被占用
    status: ItemStatus.BOOKED,
    location: '上海 · 徐汇',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
  },
  {
    id: 'item_speaker',
    user_id: 'user_lin',
    title: '马歇尔风格蓝牙音箱',
    description: '桌面小音箱，音质温暖，想换数码配件或好书。',
    category: '数码',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.AVAILABLE,
    location: '杭州 · 西湖',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
  },
  {
    id: 'item_jacket',
    user_id: 'user_chen',
    title: '日系工装夹克 M 码',
    description: '只穿过两次，版型偏大，想换运动装备或家居小物。',
    category: '服饰',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.AVAILABLE,
    location: '苏州 · 工业园',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
  },
  {
    id: 'item_lamp',
    user_id: 'user_lin',
    title: '木质小夜灯',
    description: '暖光，适合床头。已完成交换，保留记录用于状态展示。',
    category: '家居',
    condition: ItemCondition.LIKE_NEW,
    images: [],
    status: ItemStatus.EXCHANGED,
    location: '杭州 · 西湖',
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 90).toISOString(),
  },
];

export const itemApi = {
  async list(): Promise<Item[]> {
    const items = await storage.get<Item[]>(STORAGE_KEYS.items, []);
    if (items.length) return items;
    // 返回持久化后的副本，避免后续更新直接改动内存中的种子数组
    return storage.set(STORAGE_KEYS.items, seedItems);
  },

  async detail(id: string): Promise<Item | undefined> {
    const items = await this.list();
    return items.find((item) => item.id === id);
  },

  async create(draft: ItemDraft): Promise<Item> {
    const items = await this.list();
    const nextItem: Item = {
      ...draft,
      id: storage.createId('item'),
      status: draft.status ?? ItemStatus.AVAILABLE,
      created_at: new Date().toISOString(),
    };
    await storage.set(STORAGE_KEYS.items, [nextItem, ...items]);
    return nextItem;
  },

  async update(id: string, patch: Partial<Item>): Promise<Item> {
    const items = await this.list();
    const current = items.find((item) => item.id === id);
    if (!current) throw new Error('物品不存在');
    const nextItem = { ...current, ...patch };
    await storage.set(
      STORAGE_KEYS.items,
      items.map((item) => (item.id === id ? nextItem : item)),
    );
    return nextItem;
  },

  async setStatus(id: string, status: ItemStatus): Promise<Item> {
    return this.update(id, { status });
  },

  /** 原子地批量修改多件物品状态，避免并发 read-modify-write 丢失更新 */
  async setStatusMany(updates: { id: string; status: ItemStatus }[]): Promise<Item[]> {
    if (!updates.length) return this.list();
    const items = await this.list();
    const patchMap = new Map(updates.map((entry) => [entry.id, entry.status]));
    const nextItems = items.map((item) =>
      patchMap.has(item.id) ? { ...item, status: patchMap.get(item.id) as ItemStatus } : item,
    );
    await storage.set(STORAGE_KEYS.items, nextItems);
    return nextItems;
  },
};
