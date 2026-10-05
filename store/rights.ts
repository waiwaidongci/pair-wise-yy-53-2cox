import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ApprovalSnapshot, LicenseWindow, RightsComment, WriteBatch } from '@/lib/types'
import { initialComments, initialWindows } from '@/lib/mock-data'
import { adjudicateWindows, findConflicts, nextBatchNo, normalizeComment, normalizeWindow, shiftWindow, validateBatchWrite } from '@/lib/rules'

interface RightsState {
  windows: LicenseWindow[]
  comments: RightsComment[]
  selectedWindowId: string
  selectedTerritory: string
  version: number
  batches: WriteBatch[]
  snapshots: ApprovalSnapshot[]
  updateWindow: (id: string, patch: Partial<LicenseWindow>) => void
  batchShift: (ids: string[], days: number) => void
  submitBatch: (ids: string[]) => void
  retryBatch: (batchNo: string) => void
  acceptComment: (id: string) => void
  recomputeComment: (id: string) => void
  exportApprovalPackage: () => { ok: true; snapshot: ApprovalSnapshot } | { ok: false; error: string }
  selectWindow: (id: string) => void
  reset: () => void
}

export const useRightsStore = create<RightsState>()(
  persist(
    (set, get) => ({
      windows: adjudicateWindows(initialWindows.map(normalizeWindow)),
      comments: initialComments.map(normalizeComment),
      selectedWindowId: 'RW-102',
      selectedTerritory: '全部地区',
      version: 18,
      batches: [],
      snapshots: [],
      updateWindow: (id, patch) => set((state) => {
        const touched = Object.keys(patch).length > 0
        const windows0 = state.windows.map((item) => {
          if (item.id !== id) return item
          const next = { ...item, ...patch }
          if (!('status' in patch) && touched) next.status = '草案'
          return next
        })
        const windows = adjudicateWindows(windows0)
        const structuralChange = patch.start !== undefined || patch.end !== undefined || patch.exclusive !== undefined || patch.language !== undefined
        const comments = structuralChange
          ? state.comments.map((comment) => (comment.windowId === id && !comment.resolved ? { ...comment, invalid: true } : comment))
          : state.comments
        return { windows, comments, version: state.version + 1 }
      }),
      batchShift: (ids, days) => set((state) => {
        const windows = adjudicateWindows(state.windows.map((item) => ids.includes(item.id) ? shiftWindow(item, days) : item))
        const comments = state.comments.map((comment) => (ids.includes(comment.windowId) && !comment.resolved ? { ...comment, invalid: true } : comment))
        return { windows, comments, version: state.version + 1 }
      }),
      submitBatch: (ids) => set((state) => {
        if (!ids.length) return state
        const batchNo = nextBatchNo(state.batches)
        const windows0 = state.windows.map((item) => (ids.includes(item.id) ? { ...item, batchNo } : item))
        const windows = adjudicateWindows(windows0)
        const check = validateBatchWrite(windows, ids)
        const batch: WriteBatch = { batchNo, windowIds: ids, status: check.ok ? '成功' : '失败', attempts: 1, message: check.message, createdAt: new Date().toISOString() }
        return { windows, batches: [...state.batches, batch], version: state.version + 1 }
      }),
      retryBatch: (batchNo) => set((state) => {
        const batch = state.batches.find((item) => item.batchNo === batchNo)
        if (!batch) return state
        const check = validateBatchWrite(state.windows, batch.windowIds)
        const updated: WriteBatch = { ...batch, attempts: batch.attempts + 1, status: check.ok ? '成功' : '失败', message: check.message }
        return { batches: state.batches.map((item) => (item.batchNo === batchNo ? updated : item)) }
      }),
      acceptComment: (id) => set((state) => ({ comments: state.comments.map((item) => (item.id === id ? { ...item, resolved: true, invalid: false } : item)), version: state.version + 1 })),
      recomputeComment: (id) => set((state) => ({ comments: state.comments.map((item) => (item.id === id ? { ...item, invalid: false } : item)) })),
      exportApprovalPackage: () => {
        const state = get()
        const blockers = state.comments.filter((comment) => !comment.resolved || comment.invalid)
        if (blockers.length) {
          const pending = blockers.filter((comment) => comment.invalid).length
          const parts = [`${blockers.length} 条意见未处理`]
          if (pending) parts.push(`${pending} 条已失效待重算`)
          return { ok: false as const, error: `${parts.join('，')}，处理完才能导出审批包。` }
        }
        const batchNo = state.windows.reduce((max, win) => (win.batchNo > max ? win.batchNo : max), 'B-0000')
        const snapshot: ApprovalSnapshot = {
          id: `AP-${String(state.snapshots.length + 1).padStart(3, '0')}`,
          batchNo,
          version: state.version,
          generatedAt: new Date().toISOString(),
          windows: state.windows.map((win) => ({ ...win })),
          comments: state.comments.map((comment) => ({ ...comment })),
        }
        set((current) => ({ snapshots: [...current.snapshots, snapshot] }))
        return { ok: true as const, snapshot }
      },
      selectWindow: (id) => set({ selectedWindowId: id }),
      reset: () => set({ windows: adjudicateWindows(initialWindows.map(normalizeWindow)), comments: initialComments.map(normalizeComment), version: 18, batches: [], snapshots: [] }),
    }),
    { name: 'yy53-rights-draft-v2', version: 2 },
  ),
)

export function useConflicts() {
  const windows = useRightsStore((state) => state.windows)
  return findConflicts(windows)
}
