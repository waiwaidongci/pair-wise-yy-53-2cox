import type { Language, LicenseWindow, RightsComment, WriteBatch } from './types'
import type { LegacyComment, LegacyWindow } from './mock-data'

export interface ConflictIssue {
  id: string
  type: '时间重叠' | '地区交叉' | '窗口倒挂' | '独占冲突'
  severity: '高' | '中'
  windowIds: string[]
  title: string
  explanation: string
}

const order = ['院线', '电视', '流媒体', '航空', '非院线']

/** 旧窗口缺语言时补成普通话，批次号归入回填批次。 */
export function normalizeWindow(raw: LegacyWindow): LicenseWindow {
  return { ...raw, language: raw.language ?? '普通话', batchNo: raw.batchNo ?? BACKFILL_BATCH }
}

/** 旧意见补批次号，并从锚点文本解析窗口 ID。 */
export function normalizeComment(raw: LegacyComment): RightsComment {
  const windowId = raw.windowId ?? raw.anchor.match(/^(RW-\d+)/)?.[1] ?? ''
  return { ...raw, windowId, invalid: raw.invalid ?? false, batchNo: raw.batchNo ?? BACKFILL_BATCH }
}

export const BACKFILL_BATCH = 'B-0000'

/** 批次号按序递增，零填充保证字符串可比较（先到先得）。 */
export function nextBatchNo(batches: WriteBatch[]): string {
  const nums = batches
    .map((batch) => parseInt(batch.batchNo.replace(/^B-/, ''), 10))
    .filter((num) => !Number.isNaN(num))
  const next = (nums.length ? Math.max(...nums) : 0) + 1
  return `B-${String(next).padStart(4, '0')}`
}

/**
 * 独占窗口裁决：同一作品、地区、语言的重叠独占，按批次先到先得。
 * 批次号小的一方胜出；同批次按优先权（数字小优先），再相同按提交顺序。
 * 后到的一方标记为「待核验」，留待人工核验。
 */
export function adjudicateWindows(windows: LicenseWindow[]): LicenseWindow[] {
  const losers = new Set<string>()
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i]!
      const b = windows[j]!
      if (a.workId !== b.workId || a.territory !== b.territory || a.language !== b.language) continue
      if (!a.exclusive || !b.exclusive) continue
      const overlap = new Date(a.start) <= new Date(b.end) && new Date(b.start) <= new Date(a.end)
      if (!overlap) continue
      const aWins =
        a.batchNo < b.batchNo ||
        (a.batchNo === b.batchNo && (a.priority < b.priority || (a.priority === b.priority && i < j)))
      losers.add(aWins ? b.id : a.id)
    }
  }
  return windows.map((win) => {
    if (losers.has(win.id)) return { ...win, status: '待核验' }
    if (win.status === '待核验') return { ...win, status: '草案' }
    return win
  })
}

/** 批次写入校验：日期无效或仍处待核验的窗口不得写入。 */
export function validateBatchWrite(windows: LicenseWindow[], ids: string[]): { ok: boolean; message?: string } {
  const inBatch = windows.filter((win) => ids.includes(win.id))
  const invalidDate = inBatch.some((win) => new Date(win.end) < new Date(win.start))
  if (invalidDate) return { ok: false, message: '批次内存在结束日期早于开始日期的窗口，写入失败。' }
  const pending = inBatch.some((win) => win.status === '待核验')
  if (pending) return { ok: false, message: '批次内存在待核验窗口，须先完成核验或调整排期。' }
  return { ok: true }
}

export function findConflicts(windows: LicenseWindow[]): ConflictIssue[] {
  const issues: ConflictIssue[] = []
  for (let i = 0; i < windows.length; i += 1) {
    for (let j = i + 1; j < windows.length; j += 1) {
      const a = windows[i]!
      const b = windows[j]!
      if (a.workId !== b.workId || a.territory !== b.territory) continue
      // 独占只看作品、地区、语言：普通话字幕与粤语配音窗口不再互相遮挡。
      const sameLanguage = a.language === b.language
      const overlap = new Date(a.start) <= new Date(b.end) && new Date(b.start) <= new Date(a.end)
      if (overlap && a.exclusive && b.exclusive && sameLanguage) {
        const winner = a.batchNo <= b.batchNo ? a : b
        const loser = winner === a ? b : a
        issues.push({ id: `${a.id}-${b.id}-EX`, type: '独占冲突', severity: '高', windowIds: [a.id, b.id], title: `${a.channel} 与 ${b.channel} 独占期重叠`, explanation: `同一作品在 ${a.territory}（${a.language}）的独占窗口重叠 ${Math.max(1, Math.ceil((Math.min(new Date(a.end).getTime(), new Date(b.end).getTime()) - Math.max(new Date(a.start).getTime(), new Date(b.start).getTime())) / 86400000))} 天。按批次先到先得，${winner.batchNo} 批次优先，${loser.id} 留待核验。` })
      } else if (overlap && (a.exclusive || b.exclusive) && sameLanguage) {
        issues.push({ id: `${a.id}-${b.id}-NEX`, type: '独占冲突', severity: '中', windowIds: [a.id, b.id], title: `${a.exclusive ? a.channel : b.channel} 独占范围内存在非独占授权`, explanation: '独占条款优先于普通授权，需确认合同是否设置“同渠道、同语言、同区域”的例外。' })
      }
      const earlier = order.indexOf(a.rights) < order.indexOf(b.rights) ? a : b
      const later = earlier === a ? b : a
      if (new Date(later.start) < new Date(earlier.end) && !overlap) issues.push({ id: `${a.id}-${b.id}-ORDER`, type: '窗口倒挂', severity: '高', windowIds: [a.id, b.id], title: `${later.channel} 开窗早于前置窗口结束`, explanation: '不同授权窗口出现无重叠但倒挂的情况，请复核排期并重新计算窗口优先级。' })
    }
  }
  return issues
}

export function shiftWindow(win: LicenseWindow, days: number): LicenseWindow {
  const shift = (date: string) => { const value = new Date(date); value.setDate(value.getDate() + days); return value.toISOString().slice(0, 10) }
  return { ...win, start: shift(win.start), end: shift(win.end), status: '草案' }
}

export const LANGUAGES: Language[] = ['普通话', '粤语', '英语', '日语', '韩语']
