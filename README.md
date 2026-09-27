# ReSwap 二手闲置物品交换平台

```bash
pnpm install
pnpm dev
```

访问地址：`http://localhost:18415`

## 项目介绍

ReSwap 是一个纯前端以物换物 Web 应用。用户可以本地模拟登录、发布闲置物品、浏览他人物品、发起交换请求，并在浏览器内管理交换记录。

## 主要功能

- 首页瀑布流浏览、分类筛选、关键词搜索。
- 物品详情、物主资料、选择自己的物品发起交换。
- 发布物品，支持本地 base64 图片上传、分类和成色选择。
- 交换管理，区分我发起的和我收到的请求，支持同意、拒绝、完成。
- 待确认请求 72 小时有效期：超时自动关闭并保留原记录，双方物品恢复可交换。
- 个人中心，编辑资料、上传头像、查看我发布的物品。
- 主题切换、全局错误处理和 Vant 提示。

## 交换请求 72 小时有效期

- 发起交换后请求进入「待确认」，同时双方物品变为「占用中」（`ItemStatus.BOOKED`），不能再被其他请求占用，首页默认只展示「可交换」物品。
- 待确认请求携带 `expires_at`（创建时间 + 72 小时）。`exchangeApi.list()` 每次读取时自动清扫：超时请求变为「已关闭」（`ExchangeStatus.EXPIRED`），原记录（留言、时间、双方物品）全部保留，并写入 `closed_reason` 关闭原因。
- 请求关闭或被拒绝后，双方物品恢复「可交换」；个人中心会重新显示物品可交换。
- 到期后物主无法再确认：操作接口会拒绝并提示「该交换请求已超时关闭，无法确认」。
- 已完成、已拒绝的历史记录不受清扫影响；同一物品再次发起交换时一律新建请求，过期旧单不会被复活。
- 交换列表的卡片展示剩余有效期（每 30 秒刷新）和关闭原因；交换管理页和个人中心会定时/进入时触发清扫。
- 有效期规则可用 `npm run test:expiry` 验证（node 运行 `test/expiry.test.ts`，覆盖到期关闭、物品释放、无法确认、重发新单等场景）。

## 启动与构建

```bash
pnpm install
pnpm dev
```

```bash
pnpm build
```

生产部署：执行 `pnpm build` 后，将 `dist/` 目录交给 Nginx 或任意静态文件服务器托管。

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| UI | Vant + Tailwind CSS |
| 持久化 | localStorage + IndexedDB（idb-keyval） |
| 工具库 | dayjs、lodash-es |

## 项目目录结构

```text
src/
├── api/              # userApi.ts, itemApi.ts, exchangeApi.ts：本地数据 API 层
├── stores/           # authStore.ts, itemStore.ts, exchangeStore.ts, themeStore.ts
├── models/           # user.ts, item.ts, exchange.ts：独立数据模型
├── types/            # 共享类型补充
├── components/common/# 共享业务组件和 GlobalErrorBoundary
├── hooks/            # useAuth.ts, useLocalStorage.ts, useExchangeStats.ts
├── pages/            # Home, ItemDetail, Publish, Exchanges, Profile
├── router/           # index.ts + guards.ts
├── utils/            # storage.ts, formatters.ts, validators.ts, message.ts, themeUtils.ts
├── constants/        # item.ts, exchange.ts, themes.ts, messages.ts
├── App.vue
├── main.ts
└── styles.css
```

## 数据持久化说明

- `utils/storage.ts` 统一封装 localStorage 和 IndexedDB。
- 所有 `api/*Api.ts` 通过 `storage.ts` 读写数据，不在组件里直接写业务数据。
- 存储层包含序列化、版本号、过期清理、存储 key 管理。
- 首次启动会写入演示用户、物品和交换请求。

## 横切关注点

- 主题切换：`stores/themeStore.ts`、`constants/themes.ts`、`utils/themeUtils.ts`、`App.vue`、`components/common/CategoryFilter.vue`、`components/common/UserBrief.vue`、`components/common/ItemCard.vue`。
- 全局错误处理/提示：`utils/message.ts`、`components/common/GlobalErrorBoundary.tsx`、`stores/authStore.ts`、`stores/itemStore.ts`、`stores/exchangeStore.ts`、`components/common/ImageUploader.vue`。

## 枚举出现位置清单

### ItemStatus

定义位置：`src/constants/item.ts`

出现位置：

- `src/models/item.ts`
- `src/constants/messages.ts`
- `src/api/itemApi.ts`
- `src/api/exchangeApi.ts`
- `src/stores/itemStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/components/common/ItemCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Publish.vue`
- `src/pages/Profile.vue`

### ExchangeStatus

定义位置：`src/constants/exchange.ts`

出现位置：

- `src/models/exchange.ts`
- `src/constants/messages.ts`
- `src/api/exchangeApi.ts`
- `src/stores/exchangeStore.ts`
- `src/router/guards.ts`
- `src/utils/formatters.ts`
- `src/hooks/useExchangeStats.ts`
- `src/components/common/ExchangeCard.vue`
- `src/pages/ItemDetail.vue`
- `src/pages/Exchanges.vue`

## 分层与高耦合约束

本项目保留提示词要求的“严禁合并职责到单一文件”：模型、常量、API、store、页面、组件、hooks、utils 均独立拆分。

同时保留“屎山代码设计要求”的低内聚高耦合特征：

- `utils/formatters.ts` 同时负责日期、物品状态、交换状态、成色、信用等级文本。
- `constants/messages.ts` 同时包含页面提示、表单校验、日志式文案和状态文案。
- `ItemStatus` 与 `ExchangeStatus` 被模型、API、store、组件、页面、router guards、formatters 多处引用。
- `utils/storage.ts` 是存储入口，但全应用 API 和 store 都依赖它的 key 与数据结构。

例如本次新增 `ItemStatus.BOOKED`（占用中）与 `ExchangeStatus.EXPIRED`（已关闭）时，实际触达了：`src/constants/item.ts`、`src/constants/exchange.ts`、`src/models/exchange.ts`、`src/api/itemApi.ts`、`src/api/exchangeApi.ts`、`src/stores/exchangeStore.ts`、`src/utils/formatters.ts`、`src/constants/messages.ts`、`src/hooks/useExchangeStats.ts`、`src/components/common/ExchangeCard.vue`、`src/pages/ItemDetail.vue`、`src/pages/Exchanges.vue`、`src/pages/Profile.vue`、`src/App.vue` 等文件。

## 环境变量

当前项目无必需环境变量。

## License

MIT
