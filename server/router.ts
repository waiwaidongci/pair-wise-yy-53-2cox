import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { initialComments, initialWindows } from '@/lib/mock-data'
import { adjudicateWindows, findConflicts, normalizeComment, normalizeWindow } from '@/lib/rules'

const t = initTRPC.create()
const windows = adjudicateWindows(initialWindows.map(normalizeWindow))
const comments = initialComments.map(normalizeComment)

const windowInput = z.object({
  workId: z.string().min(1),
  channel: z.string().min(2),
  territory: z.string().min(1),
  language: z.string().min(1),
  start: z.string().date(),
  end: z.string().date(),
  exclusive: z.boolean(),
})

export const appRouter = t.router({
  catalog: t.procedure.query(() => ({ works: ['W-001', 'W-002'], channels: ['星海影院', '云帆视频', '南华卫视', '海岛航空', '环球新媒体'], languages: ['普通话', '粤语', '英语', '日语', '韩语'] })),
  windows: t.procedure.query(() => windows),
  conflicts: t.procedure.query(() => findConflicts(windows)),
  validateWindow: t.procedure.input(windowInput).mutation(({ input }) => {
    if (new Date(input.end) < new Date(input.start)) return { valid: false, message: '窗口结束日期不能早于开始日期。' }
    // 独占只看作品、地区、语言：同作品同地区同语言的重叠独占才冲突。
    const collision = windows.find((item) => item.workId === input.workId && item.territory === input.territory && item.language === input.language && input.start <= item.end && item.start <= input.end)
    if (!collision) return { valid: true, message: '窗口结构校验通过。' }
    const winner = collision.batchNo
    return { valid: false, message: `与现有窗口 ${collision.id}（${winner} 批次）重叠，按批次先到先得，后到留待核验。` }
  }),
  comments: t.procedure.query(() => comments),
})

export type AppRouter = typeof appRouter
