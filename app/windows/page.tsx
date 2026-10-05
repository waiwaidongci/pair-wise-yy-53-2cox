'use client'

import { useMemo, useState } from 'react'
import { Box, Flex, Grid, Heading, Text, Badge, Button, Input, Select, Checkbox, Table, Thead, Tbody, Tr, Th, Td, useToast, HStack, Alert, AlertIcon } from '@chakra-ui/react'
import { useRightsStore, useConflicts } from '@/store/rights'
import { trpc } from '@/trpc/client'
import type { Language, Territory } from '@/lib/types'
import { arbitrateBatch } from '@/lib/rules'
import { blockingConflicts } from '@/lib/batch'

const territories: (Territory | '全部地区')[] = ['全部地区', '中国大陆', '中国香港', '中国台湾', '新加坡', '马来西亚', '东南亚区域', '北美']
const languages: Language[] = ['普通话', '粤语', '英语', '马来语']

const statusColor: Record<string, string> = { 冲突: 'red', 留待核验: 'orange', 已确认: 'green', 草案: 'gray' }

export default function WindowsPage() {
  const windows = useRightsStore((state) => state.windows)
  const comments = useRightsStore((state) => state.comments)
  const currentBatchId = useRightsStore((state) => state.currentBatchId)
  const snapshots = useRightsStore((state) => state.snapshots)
  const updateWindow = useRightsStore((state) => state.updateWindow)
  const batchShift = useRightsStore((state) => state.batchShift)
  const applySnapshot = useRightsStore((state) => state.applySnapshot)
  const selectedWindowId = useRightsStore((state) => state.selectedWindowId)
  const selectWindow = useRightsStore((state) => state.selectWindow)
  const selectedTerritory = useRightsStore((state) => state.selectedTerritory)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [shiftDays, setShiftDays] = useState(7)
  const [simulateFail, setSimulateFail] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [lastCommitError, setLastCommitError] = useState<string | null>(null)
  const toast = useToast()
  const conflicts = useConflicts()
  const commit = trpc.commitBatch.useMutation()
  const arbitration = useMemo(() => arbitrateBatch(windows, currentBatchId), [windows, currentBatchId])
  const filtered = useMemo(() => selectedTerritory === '全部地区' ? windows : windows.filter((item) => item.territory === selectedTerritory), [windows, selectedTerritory])
  const selected = windows.find((item) => item.id === selectedWindowId)
  const snapshot = snapshots[currentBatchId]
  const highConflicts = useMemo(() => blockingConflicts(windows, currentBatchId), [windows, currentBatchId])

  async function submitBatch() {
    setCommitting(true)
    setLastCommitError(null)
    try {
      const result = await commit.mutateAsync({ batchId: currentBatchId, windows, comments, forceFail: simulateFail })
      applySnapshot(result.snapshot)
      setSimulateFail(false)
      toast({ title: result.retried ? '批次重试成功' : '批次已提交', description: result.message, status: 'success', duration: 6000 })
    } catch (error) {
      const message = error instanceof Error ? error.message : '写入失败'
      setLastCommitError(message)
      toast({ title: '写入失败', description: `${message} 请点击“按批次号重试”。`, status: 'error', duration: 7000 })
    } finally {
      setCommitting(false)
    }
  }

  function validateAndSave() {
    if (!selected) return
    if (new Date(selected.end) < new Date(selected.start)) return toast({ title: '窗口无效', description: '结束日期不能早于开始日期。', status: 'error' })
    const collision = conflicts.find((issue) => issue.windowIds.includes(selected.id))
    toast({ title: collision ? '已保存，仍存在冲突' : '窗口已保存', description: collision?.explanation ?? '授权窗口已通过规则校验。', status: collision ? 'warning' : 'success' })
  }
  return (
    <Box>
      <Flex justify="space-between" mb={5} gap={4} direction={{ base: 'column', md: 'row' }}>
        <Box>
          <Text color="brand.600" fontSize="xs" fontWeight="bold">TIME × TERRITORY × LANGUAGE · BATCH</Text>
          <Heading fontSize="3xl" my={1}>授权窗口与地区矩阵</Heading>
          <Text color="gray.600">独占只在同一作品、地区、语言内判定；同批次重叠独占按批次序号先到先得，后到留待核验。</Text>
        </Box>
        <Flex gap={2} align="center">
          <Select maxW="150px" value={selectedTerritory} onChange={(event) => useRightsStore.setState({ selectedTerritory: event.target.value })}>{territories.map((territory) => <option key={territory}>{territory}</option>)}</Select>
        </Flex>
      </Flex>

      <Box bg="blue.50" border="1px solid" borderColor="blue.200" borderRadius="8px" p={4} mb={4}>
        <Flex justify="space-between" align="center" gap={3} direction={{ base: 'column', lg: 'row' }}>
          <Box>
            <HStack mb={1}>
              <Badge colorScheme="blue">当前批次 {currentBatchId}</Badge>
              {snapshot && <Badge colorScheme="green">已冻结快照 {new Date(snapshot.committedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</Badge>}
              <Badge colorScheme={arbitration.held.length ? 'orange' : 'gray'}>留待核验 {arbitration.held.length}</Badge>
            </HStack>
            <Text fontSize="sm" color="gray.600">授权窗口、条款意见与审批快照在同一批次提交；写入失败后按批次号重试，幂等不重复写入。</Text>
            {lastCommitError && <Alert status="error" mt={2} py={1} px={2} borderRadius="6px" fontSize="xs"><AlertIcon />{lastCommitError}</Alert>}
          </Box>
          <HStack>
            <Checkbox isChecked={simulateFail} onChange={(event) => setSimulateFail(event.target.checked)} size="sm">模拟写入失败</Checkbox>
            <Button colorScheme="blue" isLoading={committing} loadingText="提交中" onClick={submitBatch} isDisabled={highConflicts.length > 0}>提交整批次</Button>
            <Button variant="outline" isLoading={committing} loadingText="重试中" onClick={submitBatch}>按批次号重试</Button>
          </HStack>
        </Flex>
        {highConflicts.length > 0 && <Text mt={2} fontSize="xs" color="red.600">仍有 {highConflicts.length} 项高风险冲突（倒挂 / 跨批次或异常独占冲突），处理完才能提交批次。</Text>}
      </Box>

      <Grid templateColumns={{ base: '1fr', xl: 'minmax(0,1.1fr) minmax(360px,.8fr)' }} gap={4}>
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" overflow="hidden">
          <Flex p={4} justify="space-between" align="center"><Heading size="md">授权窗口清单</Heading><HStack><Select size="sm" w="110px" value={shiftDays} onChange={(event) => setShiftDays(Number(event.target.value))}><option value={7}>+7 天</option><option value={14}>+14 天</option><option value={-7}>-7 天</option><option value={-14}>-14 天</option></Select><Button size="sm" onClick={() => { if (!selectedIds.length) return toast({ title: '请选择窗口', status: 'warning' }); batchShift(selectedIds, shiftDays) }}>批量调窗</Button></HStack></Flex>
          <Table size="sm"><Thead><Tr><Th w="36px"></Th><Th>作品 / 渠道</Th><Th>地区</Th><Th>语言</Th><Th>开始</Th><Th>结束</Th><Th>独占</Th><Th>状态</Th></Tr></Thead><Tbody>{filtered.map((item) => <Tr key={item.id} bg={selectedWindowId === item.id ? 'blue.50' : undefined} cursor="pointer" onClick={() => selectWindow(item.id)}><Td onClick={(event) => event.stopPropagation()}><Checkbox isChecked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></Td><Td><Text fontWeight="600">{item.work}</Text><Text color="gray.500" fontSize="xs">{item.channel} · {item.id} · {item.batchId} #{item.seq}</Text></Td><Td>{item.territory}</Td><Td><Badge colorScheme={item.language === '粤语' ? 'teal' : item.language === '普通话' ? 'blue' : 'purple'} variant="subtle">{item.language}</Badge></Td><Td>{item.start}</Td><Td>{item.end}</Td><Td><Badge colorScheme={item.exclusive ? 'purple' : 'gray'}>{item.exclusive ? '独占' : '普通'}</Badge></Td><Td><Badge colorScheme={statusColor[item.status] ?? 'gray'}>{item.status}</Badge></Td></Tr>)}</Tbody></Table>
        </Box>
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Heading size="md" mb={1}>窗口条款</Heading><Text color="gray.500" fontSize="sm" mb={4}>{selected?.id ?? '请选择窗口'} · 批次 {selected?.batchId} · 序号 #{selected?.seq}</Text>
          {selected && <Grid templateColumns="1fr 1fr" gap={4}>
            <Box gridColumn="span 2"><Text fontSize="sm" mb={1}>渠道</Text><Input value={selected.channel} onChange={(event) => updateWindow(selected.id, { channel: event.target.value })} /></Box>
            <Box><Text fontSize="sm" mb={1}>开始日期</Text><Input type="date" value={selected.start} onChange={(event) => updateWindow(selected.id, { start: event.target.value })} /></Box>
            <Box><Text fontSize="sm" mb={1}>结束日期</Text><Input type="date" value={selected.end} onChange={(event) => updateWindow(selected.id, { end: event.target.value })} /></Box>
            <Box><Text fontSize="sm" mb={1}>优先顺序</Text><Input type="number" value={selected.priority} onChange={(event) => updateWindow(selected.id, { priority: Number(event.target.value) })} /></Box>
            <Box><Text fontSize="sm" mb={1}>批次序号（先到先得）</Text><Input type="number" value={selected.seq} onChange={(event) => updateWindow(selected.id, { seq: Number(event.target.value) })} /></Box>
            <Box><Text fontSize="sm" mb={1}>地区</Text><Select value={selected.territory} onChange={(event) => updateWindow(selected.id, { territory: event.target.value as Territory })}>{territories.filter((item) => item !== '全部地区').map((territory) => <option key={territory}>{territory}</option>)}</Select></Box>
            <Box><Text fontSize="sm" mb={1}>语言轨</Text><Select value={selected.language} onChange={(event) => updateWindow(selected.id, { language: event.target.value as Language })}>{languages.map((language) => <option key={language}>{language}</option>)}</Select></Box>
            <Checkbox isChecked={selected.exclusive} onChange={(event) => updateWindow(selected.id, { exclusive: event.target.checked })}>独占窗口（仅与同语言窗口互相遮挡）</Checkbox><Checkbox isChecked={selected.sublicense} onChange={(event) => updateWindow(selected.id, { sublicense: event.target.checked })}>允许次级授权</Checkbox>
          </Grid>}
          {selected && conflicts.filter((issue) => issue.windowIds.includes(selected.id)).map((issue) => <Box key={issue.id} mt={4} p={3} bg={issue.severity === '高' ? 'red.50' : 'orange.50'} borderLeft="3px solid" borderLeftColor={issue.severity === '高' ? 'red.500' : 'orange.400'}><Text fontWeight="700" fontSize="sm">{issue.type}</Text><Text fontSize="sm" color="gray.600" mt={1}>{issue.explanation}</Text></Box>)}
          <Button w="100%" mt={5} colorScheme="blue" onClick={validateAndSave}>保存并重新校验</Button>
        </Box>
      </Grid>
    </Box>
  )
}
