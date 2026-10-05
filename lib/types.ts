export type RightsType = '院线' | '电视' | '流媒体' | '航空' | '非院线'
export type Territory = '中国大陆' | '中国香港' | '中国台湾' | '新加坡' | '马来西亚' | '东南亚区域' | '北美'
export type Language = '普通话' | '粤语' | '英语' | '日语' | '韩语'
export type WindowStatus = '草案' | '冲突' | '已确认' | '待核验'

export interface LicenseWindow {
  id: string
  workId: string
  work: string
  channel: string
  rights: RightsType
  territory: Territory
  language: Language
  start: string
  end: string
  exclusive: boolean
  sublicense: boolean
  priority: number
  status: WindowStatus
  batchNo: string
}

export interface RightsComment {
  id: string
  channel: string
  anchor: string
  windowId: string
  author: string
  role: string
  content: string
  resolved: boolean
  invalid: boolean
  batchNo: string
}

export interface DraftVersion {
  id: string
  author: string
  time: string
  summary: string
  changes: string[]
}

export interface WriteBatch {
  batchNo: string
  windowIds: string[]
  status: '写入中' | '成功' | '失败'
  attempts: number
  message?: string
  createdAt: string
}

export interface ApprovalSnapshot {
  id: string
  batchNo: string
  version: number
  generatedAt: string
  windows: LicenseWindow[]
  comments: RightsComment[]
}
