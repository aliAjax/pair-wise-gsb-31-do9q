import { ExchangeStatus } from '@/constants/exchange';

export interface Exchange {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_item_id: string;
  to_item_id: string;
  status: ExchangeStatus;
  message: string;
  /** 待确认请求的截止时间；到期后自动关闭（非待确认单为发起时算出的初始值，仅作记录保留） */
  expires_at: string;
  /** 关闭原因：仅在已拒绝 / 已关闭（到期自动关闭）时填写，已完成或进行中为空 */
  close_reason: string;
  created_at: string;
  updated_at: string;
}

export type ExchangeDraft = Omit<
  Exchange,
  'id' | 'status' | 'expires_at' | 'close_reason' | 'created_at' | 'updated_at'
> & {
  status?: ExchangeStatus;
};
