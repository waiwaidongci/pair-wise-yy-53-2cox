import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApprovalSnapshot, LicenseWindow, RightsComment, WindowStatus } from '@/lib/types'
import { CURRENT_BATCH_ID, initialComments, initialWindows } from '@/lib/mock-data'
import { arbitrateBatch, deriveStatuses, findConflicts, invalidateComments, shiftWindow } from '@/lib/rules'
import { batchFingerprint, normalizeWindows } from '@/lib/batch'

/** 依据当前窗口重算系统意见：冲突意见随冲突生灭，后到独占生成“留待核验”意见 */
function syncSystemComments(comments: RightsComment[], windows: LicenseWindow[], batchId: string): RightsComment[] {
  const manual = comments.filter((c) => c.author !== '规则引擎')
  const system: RightsComment[] = []
  for (const issue of findConflicts(windows)) {
    system.push({
      id: `SYS-${issue.id}`,
      channel: '规则引擎',
      anchor: `${issue.windowIds.join(' / ')} · ${issue.type}`,
      author: '规则引擎',
      role: '系统',
      content: issue.explanation,
      status: '待处理',
      windowId: issue.windowIds[0],
      batchId,
      basis: undefined,
      issueId: issue.id,
      severity: issue.severity,
    })
  }
  const { held } = arbitrateBatch(windows, batchId)
  const byId = new Map(windows.map((w) => [w.id, w]))
  for (const id of held) {
    const w = byId.get(id)
    if (!w) continue
    const winner = windows.find((other) => other.batchId === batchId && other.id !== id && other.exclusive && other.workId === w.workId && other.territory === w.territory && other.language === w.language && other.seq < w.seq && new Date(other.start) <= new Date(w.end) && new Date(w.start) <= new Date(other.end))
    system.push({
      id: `SYS-HELD-${id}`,
      channel: '规则引擎',
      anchor: `${id} · 同批次先到先得`,
      author: '规则引擎',
      role: '系统',
      content: `批次 ${batchId} 内 ${id} 与 ${winner?.id ?? '先到窗口'} 同为${w.work}在${w.territory}的${w.language}独占且时间重叠，${winner?.id ?? '先到窗口'} 批次序号在先已获得独占，${id} 留待核验：请改期、改语言或解除独占。`,
      status: '待处理',
      windowId: id,
      batchId,
      issueId: `HELD-${id}`,
      severity: '高',
    })
  }
  return [...manual, ...system]
}

/** 窗口变更后：失效未完成人工意见、按即时裁决刷新窗口状态、重算系统意见 */
function reconcile(state: RightsState, windows: LicenseWindow[], bumpVersion = true): Partial<RightsState> {
  const invalidated = invalidateComments(state.comments, windows)
  const statuses = deriveStatuses(windows, state.currentBatchId)
  const nextWindows = windows.map((w) => {
    const derived = statuses.get(w.id)
    if (w.batchId !== state.currentBatchId) return w
    return derived && derived !== w.status ? { ...w, status: derived } : w
  })
  const comments = syncSystemComments(invalidated, nextWindows, state.currentBatchId)
  return { windows: nextWindows, comments, ...(bumpVersion ? { version: state.version + 1 } : {}) }
}

interface RightsState {
  windows: LicenseWindow[]
  comments: RightsComment[]
  snapshots: Record<string, ApprovalSnapshot>
  currentBatchId: string
  selectedWindowId: string
  selectedTerritory: string
  version: number
  /** 日期 / 独占 / 语言等改动窗口，未完成意见自动失效并重算 */
  updateWindow: (id: string, patch: Partial<LicenseWindow>) => void
  batchShift: (ids: string[], days: number) => void
  acceptComment: (id: string) => void
  /** 作废人工失效意见：关闭后不计入导出准入 */
  dismissComment: (id: string) => void
  addComment: (input: { windowId: string; author: string; role: string; content: string }) => void
  applySnapshot: (snapshot: ApprovalSnapshot) => void
  selectWindow: (id: string) => void
  reset: () => void
}

export const useRightsStore = create<RightsState>()(
  persist(
    (set) => ({
      windows: initialWindows,
      comments: syncSystemComments(initialComments, initialWindows, CURRENT_BATCH_ID),
      snapshots: {},
      currentBatchId: CURRENT_BATCH_ID,
      selectedWindowId: 'RW-102',
      selectedTerritory: '全部地区',
      version: 18,
      updateWindow: (id, patch) => set((state) => {
        const windows = state.windows.map((item) => item.id === id
          ? { ...item, ...patch, status: '草案' as WindowStatus }
          : item)
        return reconcile(state, windows)
      }),
      batchShift: (ids, days) => set((state) => {
        const windows = state.windows.map((item) => ids.includes(item.id) ? shiftWindow(item, days) : item)
        return reconcile(state, windows)
      }),
      acceptComment: (id) => set((state) => {
        const comments = state.comments.map((item) => item.id === id ? { ...item, status: '已解决' as const } : item)
        // 解决全部意见后重新推导窗口状态
        const statuses = deriveStatuses(state.windows, state.currentBatchId)
        const windows = state.windows.map((w) => {
          const derived = statuses.get(w.id)
          return w.batchId === state.currentBatchId && derived && derived !== w.status ? { ...w, status: derived } : w
        })
        return { comments, windows, version: state.version + 1 }
      }),
      dismissComment: (id) => set((state) => ({
        comments: state.comments.map((item) => item.id === id && item.status === '已失效' ? { ...item, status: '已解决' as const } : item),
        version: state.version + 1,
      })),
      addComment: ({ windowId, author, role, content }) => set((state) => {
        const win = state.windows.find((item) => item.id === windowId)
        const comment: RightsComment = {
          id: `CM-${Date.now()}`,
          channel: win?.channel ?? '人工意见',
          anchor: `${windowId} · 条款意见`,
          author,
          role,
          content,
          status: '待处理',
          windowId,
          batchId: win?.batchId ?? state.currentBatchId,
          basis: win ? `${win.start}|${win.end}|${win.exclusive ? 1 : 0}|${win.language}` : undefined,
        }
        return { comments: [...state.comments, comment], version: state.version + 1 }
      }),
      applySnapshot: (snapshot) => set((state) => ({
        snapshots: { ...state.snapshots, [snapshot.batchId]: snapshot },
        windows: snapshot.windows,
        comments: snapshot.comments,
        version: state.version + 1,
      })),
      selectWindow: (id) => set({ selectedWindowId: id }),
      reset: () => set({
        windows: initialWindows,
        comments: syncSystemComments(initialComments, initialWindows, CURRENT_BATCH_ID),
        snapshots: {},
        currentBatchId: CURRENT_BATCH_ID,
        version: 18,
      }),
    }),
    {
      name: 'yy53-rights-draft-v1',
      version: 2,
      // v1 旧持久化数据：窗口缺语言时补成普通话；意见由 resolved 布尔迁移为三态
      migrate: (persisted: unknown) => {
        const data = (persisted ?? {}) as { windows?: Array<Partial<LicenseWindow> & { id: string }>; comments?: Array<Partial<RightsComment> & { resolved?: boolean }>; snapshots?: Record<string, ApprovalSnapshot>; currentBatchId?: string } & Partial<RightsState>
        const windows = normalizeWindows(data.windows ?? [])
        const comments: RightsComment[] = (data.comments ?? []).map((c) => ({
          ...c,
          status: c.status ?? (c.resolved ? '已解决' : '待处理'),
        })) as RightsComment[]
        return {
          ...data,
          windows,
          comments,
          snapshots: data.snapshots ?? {},
          currentBatchId: data.currentBatchId ?? CURRENT_BATCH_ID,
        }
      },
      merge: (persisted, current) => {
        const merged = { ...current, ...(persisted as Partial<RightsState>) }
        merged.windows = normalizeWindows(merged.windows as Array<Partial<LicenseWindow> & { id: string }>)
        if (!merged.currentBatchId) merged.currentBatchId = CURRENT_BATCH_ID
        if (!merged.snapshots) merged.snapshots = {}
        // 启动时按当前窗口重算系统意见与状态（人工意见的失效保留其“已失效”标记）
        const statuses = deriveStatuses(merged.windows, merged.currentBatchId)
        merged.windows = merged.windows.map((w) => {
          const derived = statuses.get(w.id)
          return w.batchId === merged.currentBatchId && derived && derived !== w.status ? { ...w, status: derived } : w
        })
        merged.comments = syncSystemComments(merged.comments, merged.windows, merged.currentBatchId)
        return merged as RightsState
      },
    },
  ),
)

export function useConflicts() {
  const windows = useRightsStore((state) => state.windows)
  return findConflicts(windows)
}

export { batchFingerprint }
