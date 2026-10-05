export type RightsType = '院线' | '电视' | '流媒体' | '航空' | '非院线'
export type Territory = '中国大陆' | '中国香港' | '中国台湾' | '新加坡' | '马来西亚' | '东南亚区域' | '北美'
/** 国际发行：独占只在同一作品、同一地区、同一语言内判定 */
export type Language = '普通话' | '粤语' | '英语' | '马来语'
export type WindowStatus = '草案' | '冲突' | '留待核验' | '已确认'

export interface LicenseWindow {
  id: string
  workId: string
  work: string
  channel: string
  rights: RightsType
  territory: Territory
  /** 语言轨：字幕/配音语言。旧窗口缺省时按普通话补全 */
  language: Language
  /** 批次号：窗口与条款意见、审批快照按同一批次归档，写入失败时按批次号重试 */
  batchId: string
  /** 批次内序号：同一作品/地区/语言的重叠独占按序号先到先得 */
  seq: number
  start: string
  end: string
  exclusive: boolean
  sublicense: boolean
  priority: number
  status: WindowStatus
}

/** 意见状态：未完成意见在窗口日期/独占/语言改动后失效，需重算后重新处理 */
export type CommentStatus = '待处理' | '已解决' | '已失效'

export interface RightsComment {
  id: string
  channel: string
  anchor: string
  author: string
  role: string
  content: string
  status: CommentStatus
  /** 锚定窗口，未锚定（undefined）的人工意见不参与自动失效 */
  windowId?: string
  /** 意见所属批次，须与窗口批次一致才能随审批包导出 */
  batchId?: string
  /** 意见所依据的窗口指纹（start|end|exclusive|language）；变化即失效 */
  basis?: string
  /** 冲突规则编号，系统重算时据此去重重发 */
  issueId?: string
  severity?: '高' | '中'
}

export interface DraftVersion {
  id: string
  author: string
  time: string
  summary: string
  changes: string[]
}

/** 审批快照：提交成功后按批次冻结，审批包只能引用同批次快照，避免引用旧窗口 */
export interface ApprovalSnapshot {
  batchId: string
  committedAt: string
  windows: LicenseWindow[]
  comments: RightsComment[]
  /** 提交批次时仍需人工核验的窗口（后到独占） */
  heldWindowIds: string[]
  issueSummary: { 高: number; 中: number }
  /** 提交内容指纹：提交后窗口/意见再改动即过期，审批包必须重提后导出 */
  fingerprint: string
}
