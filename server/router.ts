import { initTRPC } from '@trpc/server'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'
import { CURRENT_BATCH_ID, initialComments, initialWindows, LEGACY_BATCH_ID } from '@/lib/mock-data'
import { arbitrateBatch, deriveStatuses, findConflicts } from '@/lib/rules'
import { batchFingerprint, blockingConflicts, normalizeWindows } from '@/lib/batch'
import type { ApprovalSnapshot, LicenseWindow, RightsComment } from '@/lib/types'

const t = initTRPC.create()

/** 服务端按批次号保存冻结快照；同批次号重试幂等，不重复写入 */
const snapshotStore = new Map<string, ApprovalSnapshot>()
/** 演示开关：下一次提交模拟写入失败，随后按批次号重试可成功 */
let forceNextWriteFail = false

const windowInput = z.object({
  channel: z.string().min(2),
  start: z.string().date(),
  end: z.string().date(),
  exclusive: z.boolean(),
})

const commitInput = z.object({
  batchId: z.string().min(1),
  // 窗口与意见整体提交：授权窗口、条款意见、审批快照接进同一批次
  windows: z.array(z.any()),
  comments: z.array(z.any()),
  forceFail: z.boolean().optional(),
})

function buildSnapshot(batchId: string, rawWindows: unknown, rawComments: unknown): ApprovalSnapshot {
  const windows = normalizeWindows(rawWindows as Array<Partial<LicenseWindow> & { id: string }>)
  const comments = rawComments as RightsComment[]
  const { held } = arbitrateBatch(windows, batchId)
  const statuses = deriveStatuses(windows, batchId)
  const frozenWindows = windows.map((w) => (w.batchId === batchId && statuses.has(w.id) ? { ...w, status: statuses.get(w.id)! } : w))
  const issues = findConflicts(frozenWindows)
  return {
    batchId,
    committedAt: new Date().toISOString(),
    windows: frozenWindows,
    comments,
    heldWindowIds: held,
    issueSummary: { 高: issues.filter((i) => i.severity === '高').length, 中: issues.filter((i) => i.severity === '中').length },
    fingerprint: batchFingerprint(windows, comments),
  }
}

export const appRouter = t.router({
  catalog: t.procedure.query(() => ({
    works: ['W-001', 'W-002'],
    channels: ['星海影院', '云帆视频', '南华卫视', '海岛航空', '环球新媒体', '粤光影音', '星马传媒', '狮城娱乐'],
    languages: ['普通话', '粤语', '英语', '马来语'],
    batchId: CURRENT_BATCH_ID,
    legacyBatchId: LEGACY_BATCH_ID,
  })),
  windows: t.procedure.query(() => initialWindows),
  conflicts: t.procedure.query(() => findConflicts(initialWindows)),
  validateWindow: t.procedure.input(windowInput).mutation(({ input }) => {
    if (new Date(input.end) < new Date(input.start)) return { valid: false, message: '窗口结束日期不能早于开始日期。' }
    const collision = initialWindows.find((item) => item.channel === input.channel && item.language === '普通话' && input.start <= item.end && item.start <= input.end)
    return collision ? { valid: false, message: `与现有窗口 ${collision.id} 在同一语言轨重叠，请调整窗口或明确优先级。` } : { valid: true, message: '窗口结构校验通过。' }
  }),
  comments: t.procedure.query(() => initialComments),
  /** 按批次号读取已冻结快照；未提交时返回 null */
  batchSnapshot: t.procedure.input(z.object({ batchId: z.string() })).query(({ input }) => snapshotStore.get(input.batchId) ?? null),
  /**
   * 提交整个批次。同批次号幂等：写入失败后按相同批次号重试，
   * 服务端不会重复写入；内容改动后以最新内容重新冻结。
   */
  commitBatch: t.procedure.input(commitInput).mutation(({ input }) => {
    if (input.forceFail) forceNextWriteFail = true
    if (forceNextWriteFail) {
      // 模拟审批存储写入失败：调用方应保留批次号并重试
      forceNextWriteFail = false
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `批次 ${input.batchId} 写入失败（审批存储暂不可用），请按批次号 ${input.batchId} 重试，无需重建批次。`,
      })
    }
    const windows = normalizeWindows(input.windows as Array<Partial<LicenseWindow> & { id: string }>)
    const blockers = blockingConflicts(windows, input.batchId)
    if (blockers.length) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: `批次 ${input.batchId} 仍有 ${blockers.length} 项高风险冲突未解决（同批次先到先得裁决除外），不能提交。`,
      })
    }
    const fingerprint = batchFingerprint(windows, input.comments as RightsComment[])
    const existing = snapshotStore.get(input.batchId)
    if (existing && existing.fingerprint === fingerprint) {
      return { snapshot: existing, retried: true, message: `批次号 ${input.batchId} 已写入，本次为幂等重试，未重复写入。` }
    }
    const snapshot = buildSnapshot(input.batchId, input.windows, input.comments)
    snapshotStore.set(input.batchId, snapshot)
    return {
      snapshot,
      retried: !!existing,
      message: existing
        ? `批次 ${input.batchId} 内容有改动，已按最新内容重新冻结快照。`
        : `批次 ${input.batchId} 提交成功，审批快照已冻结，窗口 ${snapshot.windows.length} 个、留待核验 ${snapshot.heldWindowIds.length} 个。`,
    }
  }),
})

export type AppRouter = typeof appRouter
