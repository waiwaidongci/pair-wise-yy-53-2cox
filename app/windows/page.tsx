'use client'

import { useMemo, useState } from 'react'
import { Box, Flex, Grid, Heading, Text, Badge, Button, Input, Select, Checkbox, Table, Thead, Tbody, Tr, Th, Td, useToast, HStack, Tag } from '@chakra-ui/react'
import { useRightsStore, useConflicts } from '@/store/rights'
import { LANGUAGES } from '@/lib/rules'
import type { Language, Territory } from '@/lib/types'

const territories: (Territory | '全部地区')[] = ['全部地区', '中国大陆', '中国香港', '中国台湾', '新加坡', '马来西亚', '北美']

const statusColor: Record<string, string> = { 草案: 'orange', 冲突: 'red', 已确认: 'green', 待核验: 'purple' }

export default function WindowsPage() {
  const windows = useRightsStore((state) => state.windows)
  const updateWindow = useRightsStore((state) => state.updateWindow)
  const batchShift = useRightsStore((state) => state.batchShift)
  const submitBatch = useRightsStore((state) => state.submitBatch)
  const retryBatch = useRightsStore((state) => state.retryBatch)
  const batches = useRightsStore((state) => state.batches)
  const selectedWindowId = useRightsStore((state) => state.selectedWindowId)
  const selectWindow = useRightsStore((state) => state.selectWindow)
  const selectedTerritory = useRightsStore((state) => state.selectedTerritory)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [shiftDays, setShiftDays] = useState(7)
  const toast = useToast()
  const conflicts = useConflicts()
  const filtered = useMemo(() => selectedTerritory === '全部地区' ? windows : windows.filter((item) => item.territory === selectedTerritory), [windows, selectedTerritory])
  const selected = windows.find((item) => item.id === selectedWindowId)

  function validateAndSave() {
    if (!selected) return
    if (new Date(selected.end) < new Date(selected.start)) return toast({ title: '窗口无效', description: '结束日期不能早于开始日期。', status: 'error' })
    const collision = conflicts.find((issue) => issue.windowIds.includes(selected.id))
    updateWindow(selected.id, { status: collision ? '冲突' : '已确认' })
    toast({ title: selected.status === '待核验' ? '窗口待核验' : collision ? '已保存，仍存在冲突' : '窗口已确认', description: collision?.explanation ?? '授权窗口已通过规则校验。', status: selected.status === '待核验' ? 'warning' : collision ? 'warning' : 'success' })
  }

  function handleSubmitBatch() {
    if (!selectedIds.length) return toast({ title: '请选择窗口', description: '选择同一批次提交的授权窗口。', status: 'warning' })
    submitBatch(selectedIds)
    const batch = useRightsStore.getState().batches.at(-1)
    if (batch?.status === '成功') toast({ title: `${batch.batchNo} 批次写入成功`, description: '条款意见与审批快照已归入同一批次。', status: 'success' })
    else toast({ title: `${batch?.batchNo} 批次写入失败`, description: batch?.message, status: 'error' })
  }

  return (
    <Box>
      <Flex justify="space-between" mb={5} gap={4} direction={{ base: 'column', md: 'row' }}><Box><Text color="brand.600" fontSize="xs" fontWeight="bold">TIME × TERRITORY</Text><Heading fontSize="3xl" my={1}>授权窗口与地区矩阵</Heading><Text color="gray.600">窗口带语言与批次号，同一作品、地区、语言的重叠独占按批次先到先得，后到留待核验。</Text></Box><Flex gap={2}><Select maxW="150px" value={selectedTerritory} onChange={(event) => useRightsStore.setState({ selectedTerritory: event.target.value })}>{territories.map((territory) => <option key={territory}>{territory}</option>)}</Select><Button colorScheme="blue" onClick={validateAndSave}>校验并保存</Button></Flex></Flex>
      <Grid templateColumns={{ base: '1fr', xl: 'minmax(0,1.1fr) minmax(360px,.8fr)' }} gap={4}>
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" overflow="hidden">
          <Flex p={4} justify="space-between" align="center" flexWrap="wrap" gap={2}><Heading size="md">授权窗口清单</Heading><HStack><Select size="sm" w="110px" value={shiftDays} onChange={(event) => setShiftDays(Number(event.target.value))}><option value={7}>+7 天</option><option value={14}>+14 天</option><option value={-7}>-7 天</option><option value={-14}>-14 天</option></Select><Button size="sm" onClick={() => { if (!selectedIds.length) return toast({ title: '请选择窗口', status: 'warning' }); batchShift(selectedIds, shiftDays) }}>批量调窗</Button><Button size="sm" colorScheme="green" onClick={handleSubmitBatch}>提交批次写入</Button></HStack></Flex>
          <Table size="sm"><Thead><Tr><Th w="36px"></Th><Th>作品 / 渠道</Th><Th>语言</Th><Th>地区</Th><Th>开始</Th><Th>结束</Th><Th>批次</Th><Th>独占</Th><Th>状态</Th></Tr></Thead><Tbody>{filtered.map((item) => <Tr key={item.id} bg={selectedWindowId === item.id ? 'blue.50' : undefined} cursor="pointer" onClick={() => selectWindow(item.id)}><Td onClick={(event) => event.stopPropagation()}><Checkbox isChecked={selectedIds.includes(item.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /></Td><Td><Text fontWeight="600">{item.work}</Text><Text color="gray.500" fontSize="xs">{item.channel} · {item.id}</Text></Td><Td><Tag size="sm" colorScheme="cyan">{item.language}</Tag></Td><Td>{item.territory}</Td><Td>{item.start}</Td><Td>{item.end}</Td><Td><Text fontSize="xs" color="gray.500">{item.batchNo}</Text></Td><Td><Badge colorScheme={item.exclusive ? 'purple' : 'gray'}>{item.exclusive ? '独占' : '普通'}</Badge></Td><Td><Badge colorScheme={statusColor[item.status]}>{item.status}</Badge></Td></Tr>)}</Tbody></Table>
          {batches.length > 0 && <Box p={4} borderTop="1px solid" borderColor="gray.100"><Text fontSize="sm" fontWeight="700" mb={2}>写入批次</Text>{batches.map((batch) => <Flex key={batch.batchNo} justify="space-between" align="center" py={1} fontSize="sm"><HStack><Text fontWeight="600">{batch.batchNo}</Text><Badge colorScheme={batch.status === '成功' ? 'green' : 'red'}>{batch.status}</Badge><Text color="gray.500" fontSize="xs">第 {batch.attempts} 次尝试 · {batch.windowIds.length} 个窗口</Text></HStack>{batch.status === '失败' && <Button size="xs" colorScheme="orange" onClick={() => { retryBatch(batch.batchNo); const retried = useRightsStore.getState().batches.find((item) => item.batchNo === batch.batchNo); if (retried?.status === '成功') toast({ title: `${batch.batchNo} 重试成功`, status: 'success' }); else toast({ title: `${batch.batchNo} 重试仍失败`, description: retried?.message, status: 'error' }) }}>按批次号重试</Button>}</Flex>)}</Box>}
        </Box>
        <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
          <Heading size="md" mb={1}>窗口条款</Heading><Text color="gray.500" fontSize="sm" mb={4}>{selected?.id ?? '请选择窗口'}{selected && <Text as="span" ml={2}>批次 {selected.batchNo}</Text>}</Text>
          {selected && <Grid templateColumns="1fr 1fr" gap={4}>
            <Box gridColumn="span 2"><Text fontSize="sm" mb={1}>渠道</Text><Input value={selected.channel} onChange={(event) => updateWindow(selected.id, { channel: event.target.value })} /></Box>
            <Box><Text fontSize="sm" mb={1}>开始日期</Text><Input type="date" value={selected.start} onChange={(event) => updateWindow(selected.id, { start: event.target.value })} /></Box>
            <Box><Text fontSize="sm" mb={1}>结束日期</Text><Input type="date" value={selected.end} onChange={(event) => updateWindow(selected.id, { end: event.target.value })} /></Box>
            <Box><Text fontSize="sm" mb={1}>优先顺序</Text><Input type="number" value={selected.priority} onChange={(event) => updateWindow(selected.id, { priority: Number(event.target.value) })} /></Box>
            <Box><Text fontSize="sm" mb={1}>语言</Text><Select value={selected.language} onChange={(event) => updateWindow(selected.id, { language: event.target.value as Language })}>{LANGUAGES.map((language) => <option key={language}>{language}</option>)}</Select></Box>
            <Box><Text fontSize="sm" mb={1}>地区</Text><Select value={selected.territory} onChange={(event) => updateWindow(selected.id, { territory: event.target.value as Territory })}>{territories.filter((item) => item !== '全部地区').map((territory) => <option key={territory}>{territory}</option>)}</Select></Box>
            <Checkbox isChecked={selected.exclusive} onChange={(event) => updateWindow(selected.id, { exclusive: event.target.checked })}>独占窗口</Checkbox><Checkbox isChecked={selected.sublicense} onChange={(event) => updateWindow(selected.id, { sublicense: event.target.checked })}>允许次级授权</Checkbox>
          </Grid>}
          {selected && conflicts.filter((issue) => issue.windowIds.includes(selected.id)).map((issue) => <Box key={issue.id} mt={4} p={3} bg={issue.severity === '高' ? 'red.50' : 'orange.50'} borderLeft="3px solid" borderLeftColor={issue.severity === '高' ? 'red.500' : 'orange.400'}><Text fontWeight="700" fontSize="sm">{issue.type}</Text><Text fontSize="sm" color="gray.600" mt={1}>{issue.explanation}</Text></Box>)}
          <Button w="100%" mt={5} colorScheme="blue" onClick={validateAndSave}>保存并重新校验</Button>
        </Box>
      </Grid>
    </Box>
  )
}
