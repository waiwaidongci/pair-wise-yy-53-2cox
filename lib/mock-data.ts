import type { ApprovalSnapshot, DraftVersion, LicenseWindow, RightsComment } from './types'

/** 当前提审批次：窗口、条款意见、审批快照都挂到同一批次 */
export const CURRENT_BATCH_ID = 'B-20261005-18'
/** 历史批次，已确认窗口沿用 */
export const LEGACY_BATCH_ID = 'B-20260928-09'

export const initialWindows: LicenseWindow[] = [
  { id: 'RW-101', workId: 'W-001', work: '《远山回声》', channel: '星海影院', rights: '院线', territory: '中国大陆', language: '普通话', batchId: CURRENT_BATCH_ID, seq: 1, start: '2026-10-18', end: '2026-12-05', exclusive: true, sublicense: false, priority: 1, status: '冲突' },
  { id: 'RW-102', workId: 'W-001', work: '《远山回声》', channel: '云帆视频', rights: '流媒体', territory: '中国大陆', language: '普通话', batchId: 'B-20261001-17', seq: 2, start: '2026-11-20', end: '2027-11-19', exclusive: true, sublicense: false, priority: 2, status: '冲突' },
  { id: 'RW-103', workId: 'W-001', work: '《远山回声》', channel: '南华卫视', rights: '电视', territory: '中国大陆', language: '普通话', batchId: CURRENT_BATCH_ID, seq: 5, start: '2027-01-08', end: '2027-03-31', exclusive: false, sublicense: true, priority: 4, status: '草案' },
  { id: 'RW-106', workId: 'W-001', work: '《远山回声》', channel: '粤光影音', rights: '流媒体', territory: '中国大陆', language: '粤语', batchId: CURRENT_BATCH_ID, seq: 4, start: '2026-11-01', end: '2027-02-28', exclusive: true, sublicense: false, priority: 2, status: '草案' },
  { id: 'RW-110', workId: 'W-001', work: '《远山回声》', channel: '云帆视频', rights: '流媒体', territory: '中国香港', language: '粤语', batchId: CURRENT_BATCH_ID, seq: 3, start: '2026-12-10', end: '2027-06-09', exclusive: true, sublicense: false, priority: 2, status: '草案' },
  { id: 'RW-104', workId: 'W-002', work: '《深港口岸》', channel: '云帆视频', rights: '流媒体', territory: '新加坡', language: '粤语', batchId: LEGACY_BATCH_ID, seq: 1, start: '2026-12-01', end: '2027-05-31', exclusive: true, sublicense: false, priority: 1, status: '已确认' },
  { id: 'RW-108', workId: 'W-002', work: '《深港口岸》', channel: '星马传媒', rights: '流媒体', territory: '新加坡', language: '普通话', batchId: CURRENT_BATCH_ID, seq: 1, start: '2027-02-01', end: '2027-07-31', exclusive: true, sublicense: false, priority: 2, status: '草案' },
  { id: 'RW-109', workId: 'W-002', work: '《深港口岸》', channel: '狮城娱乐', rights: '流媒体', territory: '新加坡', language: '普通话', batchId: CURRENT_BATCH_ID, seq: 2, start: '2027-04-01', end: '2027-09-30', exclusive: true, sublicense: false, priority: 3, status: '留待核验' },
  { id: 'RW-105', workId: 'W-002', work: '《深港口岸》', channel: '海岛航空', rights: '航空', territory: '东南亚区域', language: '普通话', batchId: CURRENT_BATCH_ID, seq: 6, start: '2027-01-15', end: '2027-07-14', exclusive: false, sublicense: true, priority: 3, status: '草案' },
]

const fp = (w: LicenseWindow) => `${w.start}|${w.end}|${w.exclusive ? 1 : 0}|${w.language}`

export const initialComments: RightsComment[] = [
  { id: 'CM-31', channel: '星海影院', anchor: 'RW-101 · 院线独占尾部', author: '黎清', role: '法务', content: '流媒体开窗早于院线独占结束 15 天，违反窗口倒挂约束。请至少顺延至 2026-12-06。', status: '待处理', windowId: 'RW-101', batchId: CURRENT_BATCH_ID, basis: fp(initialWindows[0]!) },
  { id: 'CM-32', channel: '云帆视频', anchor: 'RW-102 · 地区范围', author: '章宁', role: '发行', content: '中国大陆普通话独占与粤语配音、港澳台授权不冲突，但宣传物料的地区与语言标识必须拆分为不同物料包。', status: '待处理', windowId: 'RW-102', batchId: 'B-20261001-17', basis: fp(initialWindows[1]!) },
  { id: 'CM-33', channel: '南华卫视', anchor: 'RW-103 · 次级授权', author: '黎清', role: '法务', content: '允许转授权，但须禁止向短视频平台分发超过 3 分钟的连续片段。', status: '已解决', windowId: 'RW-103', batchId: CURRENT_BATCH_ID, basis: fp(initialWindows[2]!) },
  { id: 'CM-35', channel: '海岛航空', anchor: 'RW-105 · 航空开窗', author: '黎清', role: '法务', content: '航空窗口原排期 2027-01-10 起与前置窗口间隔不足，已按最新日期重算，本意见失效。', status: '已失效', windowId: 'RW-105', batchId: CURRENT_BATCH_ID, basis: '2027-01-10|2027-07-09|0|普通话' },
]

export const versions: DraftVersion[] = [
  { id: 'v18', author: '章宁', time: '今天 16:35', summary: '调整《远山回声》流媒体窗口并增加港台、粤语语言轨', changes: ['RW-102 开窗日期由 11-15 调整为 11-20', '新增流媒体中国香港、中国台湾窗口', '新增中国大陆粤语配音窗口 RW-106，与普通话独占按语言分轨', '独占范围拆分与宣传物料条件'] },
  { id: 'v17', author: '黎清', time: '今天 14:08', summary: '补充院线优先权和次级授权限制', changes: ['院线窗口优先级提升为 1', '电视窗口禁止提前点映', '转授权增加地区与时长限制'] },
]

export const emptySnapshots: Record<string, ApprovalSnapshot> = {}
