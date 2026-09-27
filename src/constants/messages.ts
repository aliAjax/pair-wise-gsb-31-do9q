import { ExchangeStatus } from './exchange';
import { ItemStatus } from './item';

export const PAGE_MESSAGES = {
  homeEmpty: '暂时没有符合条件的闲置物品',
  publishReady: '发布后会同步写入 localStorage 和 IndexedDB',
  exchangeEmpty: '还没有交换请求，先去首页挑一件合眼缘的物品',
  profileUpdated: '个人资料已更新',
};

export const FORM_MESSAGES = {
  requiredTitle: '物品标题不能为空',
  requiredDescription: '请描述你希望交换的物品',
  requiredPhone: '请填写联系方式',
  imageLimit: '最多上传 4 张图片',
  exchangeNeedOwnItem: '请先发布一件可交换物品',
};

export const LOG_MESSAGES = {
  storageHydrated: 'storage hydrated with status maps',
  itemStatusUsed: `ItemStatus includes ${ItemStatus.AVAILABLE}, ${ItemStatus.BOOKED}, ${ItemStatus.EXCHANGED}, ${ItemStatus.OFFLINE}`,
  exchangeStatusUsed: `ExchangeStatus includes ${ExchangeStatus.PENDING}, ${ExchangeStatus.ACCEPTED}, ${ExchangeStatus.REJECTED}, ${ExchangeStatus.COMPLETED}, ${ExchangeStatus.EXPIRED}`,
};

/** 交换请求关闭原因文案（已拒绝 / 已关闭） */
export const CLOSE_REASON_MAP: Partial<Record<ExchangeStatus, string>> = {
  [ExchangeStatus.EXPIRED]: '物主 72 小时内未处理，请求已自动关闭',
  [ExchangeStatus.REJECTED]: '物主已拒绝该交换请求',
};

/** 关闭类状态（记录保留但不再可操作） */
export const CLOSED_EXCHANGE_REASON_DEFAULT = '该交换请求已关闭';

export const EXCHANGE_RULE_MESSAGES = {
  targetUnavailable: '目标物品当前不可交换',
  ownItemUnavailable: '你选择的物品当前不可交换',
  itemInExchange: '该物品正处于交换流程中，暂时无法发起新请求',
  expiredClosed: '该请求超过 72 小时未确认，已自动关闭',
  expiredCannotConfirm: '请求已到期关闭，物主无法再确认，可重新发起交换',
};

export const STATUS_MESSAGE_MAP = {
  [ItemStatus.AVAILABLE]: '这件物品可发起交换',
  [ItemStatus.BOOKED]: '这件物品正在交换确认中，暂时被占用',
  [ItemStatus.EXCHANGED]: '这件物品已完成交换',
  [ItemStatus.OFFLINE]: '这件物品已下架',
  [ExchangeStatus.PENDING]: '等待对方确认，72 小时内未处理将自动关闭',
  [ExchangeStatus.ACCEPTED]: '交换已同意，可确认完成',
  [ExchangeStatus.REJECTED]: '交换请求已拒绝',
  [ExchangeStatus.COMPLETED]: '交换流程已完成',
  [ExchangeStatus.EXPIRED]: '超过 72 小时未确认，请求已自动关闭',
};
