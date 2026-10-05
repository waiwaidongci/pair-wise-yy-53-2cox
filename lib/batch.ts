import type { ApprovalSnapshot, LicenseWindow, RightsComment } from './types'
import { arbitrateBatch, findConflicts, windowFingerprint } from './rules'
import { CURRENT_BATCH_ID } from './mock-data'

/**
 * 旧窗口兼容：历史数据缺少 language / batchId / seq 时补全。
 * 语言缺省补成普通话，批次归入历史批次，序号按 0 处理。
 */
export function normalizeWindow(raw: Partial<LicenseWindow> & { id: string }): LicenseWindow {
  const filled: LicenseWindow = {
    id: raw.id,
    workId: raw.workId ?? '',
    work: raw.work ?? '',
    channel: raw.channel ?? '',
    rights: raw.rights ?? '流媒体',
    territory: raw.territory ?? '中国大陆',
    language: raw.language ?? '普通话',
    batchId: raw.batchId ?? 'B-20260928-09',
    seq: raw.seq ?? 0,
    start: raw.start ?? '',
    end: raw.end ?? '',
    exclusive: raw.exclusive ?? false,
    sublicense: raw.sublicense ?? false,
    priority: raw.priority ?? 0,
    status: raw.status ?? '草案',
  }
  // 旧窗口缺语言时补成普通话，缺批次号归入历史批次
  return filled
}

export function normalizeWindows(windows: Array<Partial<LicenseWindow> & { id: string }>): LicenseWindow[] {
  return windows.map(normalizeWindow)
}

/** 当前批次全部窗口（含历史批次窗口）的指纹哈希，用来判断快照是否还是最新 */
export function batchFingerprint(windows: LicenseWindow[], comments: RightsComment[]): string {
  const w = windows.map((item) => `${item.id}:${windowFingerprint(item)}:${item.batchId}:${item.seq}:${item.territory}`).join('||')
  const c = comments.filter((item) => item.status === '待处理' || item.status === '已解决').map((item) => `${item.id}:${item.status}:${item.basis ?? ''}`).join('||')
  return hash(`${w}##${c}`)
}

function hash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i += 1) { h = (h << 5) - h + input.charCodeAt(i); h |= 0 }
  return `fp-${(h >>> 0).toString(16)}`
}

export interface ApprovalReadiness {
  ready: boolean
  reasons: string[]
  held: LicenseWindow[]
  pendingComments: RightsComment[]
  snapshotFresh: boolean
}

/**
 * 审批导出准入：条款意见全部处理完（无待处理/失效未关闭）、后到独占全部核验完、
 * 且存在与当前窗口一致的同批次冻结快照，才能导出审批包。
 */
export function getApprovalReadiness(windows: LicenseWindow[], comments: RightsComment[], snapshot: ApprovalSnapshot | undefined, batchId: string = CURRENT_BATCH_ID): ApprovalReadiness {
  const reasons: string[] = []
  const { held } = arbitrateBatch(windows, batchId)
  const heldWindows = windows.filter((w) => held.includes(w.id))
  if (heldWindows.length) reasons.push(`有 ${heldWindows.length} 个后到独占窗口留待核验，处理完才能导出审批包。`)
  const pendingComments = comments.filter((c) => c.status === '待处理')
  if (pendingComments.length) reasons.push(`有 ${pendingComments.length} 条条款意见未处理完（含失效待重算意见）。`)
  if (!snapshot) reasons.push(`批次 ${batchId} 尚未提交冻结，审批快照缺失。`)
  else if (snapshot.fingerprint !== batchFingerprint(windows, comments)) reasons.push('审批快照已过期：窗口或意见在上次提交后又有改动，请重新提交批次。')
  const fresh = !!snapshot && snapshot.fingerprint === batchFingerprint(windows, comments)
  return { ready: reasons.length === 0, reasons, held: heldWindows, pendingComments, snapshotFresh: fresh }
}

/** 服务端提交校验：同批次重叠独占已由先到先得裁决（含后到留待核验），其余高风险冲突仍需先解决 */
export function blockingConflicts(windows: LicenseWindow[], batchId: string) {
  const { held } = arbitrateBatch(windows, batchId)
  return findConflicts(windows).filter((issue) => issue.severity === '高' && !issue.windowIds.some((id) => held.includes(id)))
}
