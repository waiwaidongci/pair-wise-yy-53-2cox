import type { LicenseWindow, RightsComment, WindowStatus } from './types'

export interface ConflictIssue {
  id: string
  type: '时间重叠' | '地区交叉' | '窗口倒挂' | '独占冲突'
  severity: '高' | '中'
  windowIds: string[]
  title: string
  explanation: string
}

const order = ['院线', '电视', '流媒体', '航空', '非院线']

/** 国际发行独占判定键：同一作品 + 同一地区 + 同一语言。不同语言（普通话字幕 / 粤语配音）不互相遮挡 */
export function exclusiveKey(w: Pick<LicenseWindow, 'workId' | 'territory' | 'language'>) {
  return `${w.workId}|${w.territory}|${w.language}`
}

/** 影响条款意见的字段指纹：日期、独占、语言任一改动即不一致 */
export function windowFingerprint(w: Pick<LicenseWindow, 'start' | 'end' | 'exclusive' | 'language'>) {
  return `${w.start}|${w.end}|${w.exclusive ? 1 : 0}|${w.language}`
}

function daysOverlap(a: LicenseWindow, b: LicenseWindow) {
  return Math.max(1, Math.ceil((Math.min(new Date(a.end).getTime(), new Date(b.end).getTime()) - Math.max(new Date(a.start).getTime(), new Date(b.start).getTime())) / 86400000))
}

/**
 * 冲突检测（不含批次先到先得裁决）：独占冲突只在同作品/地区/语言的窗口之间产生。
 */
export function findConflicts(windows: LicenseWindow[]): ConflictIssue[] {
  const issues: ConflictIssue[] = []
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i]!
      const b = windows[j]!
      if (a.workId !== b.workId || a.territory !== b.territory) continue
      const overlap = new Date(a.start) <= new Date(b.end) && new Date(b.start) <= new Date(a.end)
      // 独占遮挡只在同一语言轨内成立：中文字幕与粤语配音窗口跨语言共存
      if (overlap && a.language === b.language) {
        if (a.exclusive && b.exclusive) issues.push({ id: `${a.id}-${b.id}-EX`, type: '独占冲突', severity: '高', windowIds: [a.id, b.id], title: `${a.channel} 与 ${b.channel} 的${a.language}独占期重叠`, explanation: `同一作品在 ${a.territory} 的${a.language}独占窗口重叠 ${daysOverlap(a, b)} 天，必须调整一方窗口或解除独占。` })
        else if (a.exclusive || b.exclusive) issues.push({ id: `${a.id}-${b.id}-NEX`, type: '独占冲突', severity: '中', windowIds: [a.id, b.id], title: `${a.exclusive ? a.channel : b.channel} 的${a.language}独占范围内存在非独占授权`, explanation: '独占条款优先于同语言普通授权，需确认合同是否设置“同渠道、同语言、同区域”的例外。' })
      }
      const earlier = order.indexOf(a.rights) < order.indexOf(b.rights) ? a : b
      const later = earlier === a ? b : a
      if (new Date(later.start) < new Date(earlier.end) && !overlap) issues.push({ id: `${a.id}-${b.id}-ORDER`, type: '窗口倒挂', severity: '高', windowIds: [a.id, b.id], title: `${later.channel} 开窗早于前置窗口结束`, explanation: '不同授权窗口出现无重叠但倒挂的情况，请复核排期并重新计算窗口优先级。' })
    }
  }
  return issues
}

export interface BatchArbitration {
  /** 批次内赢得独占先到先得、可以确认的窗口 id */
  granted: string[]
  /** 时间重叠的后到独占窗口 id，留待人工核验（不确认、不导出为有效授权） */
  held: string[]
}

/**
 * 同一批次内，对同一作品/地区/语言的时间重叠独占窗口按批次序号先到先得：
 * 序号最小的先到者得到独占，其余后到者留待核验。跨批次、跨语言窗口不参与裁决。
 */
export function arbitrateBatch(windows: LicenseWindow[], batchId: string): BatchArbitration {
  const granted = new Set<string>()
  const held = new Set<string>()
  const groups = new Map<string, LicenseWindow[]>()
  for (const w of windows) {
    if (!w.exclusive || w.batchId !== batchId) continue
    const key = exclusiveKey(w)
    groups.set(key, [...(groups.get(key) ?? []), w])
  }
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.seq - b.seq)
    const winners: LicenseWindow[] = []
    for (const w of ordered) {
      const overlapsWinner = winners.some((win) => new Date(w.start) <= new Date(win.end) && new Date(win.start) <= new Date(w.end))
      if (overlapsWinner) held.add(w.id)
      else { winners.push(w); granted.add(w.id) }
    }
  }
  return { granted: [...granted], held: [...held] }
}

/**
 * 综合当前冲突与批次先到先得裁决，推导每个窗口的即时状态：
 * 存在高优先级冲突 -> 冲突；本批次后到独占 -> 留待核验；独占先到者/无冲突 -> 已确认/草案。
 */
export function deriveStatuses(windows: LicenseWindow[], batchId: string): Map<string, WindowStatus> {
  const issues = findConflicts(windows)
  const { held } = arbitrateBatch(windows, batchId)
  const heldSet = new Set(held)
  // 已被先到先得裁决消化的独占冲突（涉及留待核验窗口）不再阻断先得者
  const blocking = new Set<string>()
  for (const issue of issues) {
    if (issue.severity !== '高' || issue.windowIds.some((id) => heldSet.has(id))) continue
    for (const id of issue.windowIds) blocking.add(id)
  }
  const result = new Map<string, WindowStatus>()
  for (const w of windows) {
    if (blocking.has(w.id)) result.set(w.id, '冲突')
    else if (heldSet.has(w.id)) result.set(w.id, '留待核验')
    else result.set(w.id, w.status === '冲突' || w.status === '留待核验' ? '草案' : w.status)
  }
  return result
}

/** 日期/独占/语言改动后，未完成意见与新指纹不符即失效重算 */
export function invalidateComments(comments: RightsComment[], windows: LicenseWindow[]): RightsComment[] {
  const byId = new Map(windows.map((w) => [w.id, w]))
  return comments.map((comment) => {
    if (comment.status !== '待处理' || !comment.windowId || !comment.basis) return comment
    const win = byId.get(comment.windowId)
    if (!win) return { ...comment, status: '已失效' as const }
    return windowFingerprint(win) === comment.basis ? comment : { ...comment, status: '已失效' as const }
  })
}

export function shiftWindow(win: LicenseWindow, days: number): LicenseWindow {
  const shift = (date: string) => { const value = new Date(date); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10) }
  return { ...win, start: shift(win.start), end: shift(win.end), status: '草案' }
}
