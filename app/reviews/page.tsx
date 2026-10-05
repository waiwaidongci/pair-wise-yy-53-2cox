'use client'

import { useMemo, useState } from 'react'
import { Box, Flex, Grid, Heading, Text, Badge, Button, Textarea, Checkbox, Tabs, TabList, Tab, TabPanels, TabPanel, useToast, HStack, Alert, AlertIcon, Select } from '@chakra-ui/react'
import { useRightsStore } from '@/store/rights'
import { versions } from '@/lib/mock-data'
import { getApprovalReadiness } from '@/lib/batch'

const statusColor: Record<string, string> = { 已解决: 'green', 待处理: 'orange', 已失效: 'red' }

export default function ReviewsPage() {
  const windows = useRightsStore((state) => state.windows)
  const comments = useRightsStore((state) => state.comments)
  const snapshots = useRightsStore((state) => state.snapshots)
  const currentBatchId = useRightsStore((state) => state.currentBatchId)
  const acceptComment = useRightsStore((state) => state.acceptComment)
  const dismissComment = useRightsStore((state) => state.dismissComment)
  const addComment = useRightsStore((state) => state.addComment)
  const [draft, setDraft] = useState('流媒体开窗日期以院线独占结束次日为准，并单独拆分港澳台与粤语物料。')
  const [anchorId, setAnchorId] = useState('RW-102')
  const [accepted, setAccepted] = useState<string[]>(['RW-102 开窗日期由 11-15 调整为 11-20'])
  const toast = useToast()

  const snapshot = snapshots[currentBatchId]
  const readiness = useMemo(() => getApprovalReadiness(windows, comments, snapshot, currentBatchId), [windows, comments, snapshot, currentBatchId])

  function exportPackage() {
    if (!readiness.ready || !snapshot) {
      toast({ title: '暂不能导出审批包', description: readiness.reasons.join(' '), status: 'warning', duration: 6000 })
      return
    }
    // 审批包只引用本批次冻结快照，不再引用可能已漂移的旧窗口
    const report = {
      batchId: snapshot.batchId,
      committedAt: snapshot.committedAt,
      fingerprint: snapshot.fingerprint,
      generatedAt: new Date().toISOString(),
      windows: snapshot.windows,
      heldWindowIds: snapshot.heldWindowIds,
      issueSummary: snapshot.issueSummary,
      resolvedComments: snapshot.comments.filter((item) => item.status === '已解决').map((item) => ({ id: item.id, anchor: item.anchor, author: item.author, role: item.role, content: item.content })),
      acceptedChanges: accepted,
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `发行权审批包-${snapshot.batchId}.json`
    link.click()
    URL.revokeObjectURL(link.href)
    toast({ title: `审批包 ${snapshot.batchId} 已导出`, description: '内容来自同批次冻结快照，窗口漂移不会影响审批材料。', status: 'success' })
  }

  return (
    <Box>
      <Flex justify="space-between" mb={5} gap={4} direction={{ base: 'column', md: 'row' }}>
        <Box><Text color="brand.600" fontSize="xs" fontWeight="bold">VERSION & APPROVAL · BATCH SNAPSHOT</Text><Heading fontSize="3xl" my={1}>版本比较与条款合并</Heading><Text color="gray.600">评论锚定具体窗口与批次；日期、独占或语言一改，未完成意见立即失效重算，全部处理完才能导出审批包。</Text></Box>
        <Button colorScheme={readiness.ready ? 'blue' : 'gray'} onClick={exportPackage}>导出可追溯审批包</Button>
      </Flex>

      <Box bg={readiness.ready ? 'green.50' : 'orange.50'} border="1px solid" borderColor={readiness.ready ? 'green.200' : 'orange.200'} borderRadius="8px" p={4} mb={4}>
        <HStack align="flex-start">
          <Badge colorScheme={readiness.ready ? 'green' : 'orange'}>{readiness.ready ? '可导出' : '未就绪'}</Badge>
          <Box>
            <Text fontWeight="700" fontSize="sm">批次 {currentBatchId} 审批准入</Text>
            {readiness.ready
              ? <Text fontSize="sm" color="gray.600">条款意见已全部处理、后到独占已核验，且存在与当前内容一致的冻结快照，审批包可导出。</Text>
              : readiness.reasons.map((reason) => <Text key={reason} fontSize="sm" color="gray.700">· {reason}</Text>)}
          </Box>
        </HStack>
      </Box>

      <Tabs colorScheme="blue" variant="enclosed">
        <TabList><Tab>条款意见</Tab><Tab>版本差异</Tab><Tab>审批时间线</Tab></TabList>
        <TabPanels>
          <TabPanel px={0} pt={4}><Grid templateColumns={{ base: '1fr', lg: '1.3fr .8fr' }} gap={4}>
            <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px">
              {comments.map((comment) => <Box key={comment.id} p={4} borderBottom="1px solid" borderColor="gray.100" opacity={comment.status === '已失效' ? 0.75 : 1}>
                <Flex justify="space-between">
                  <Box><Text fontWeight="700">{comment.role} · {comment.author}</Text><Text color="gray.500" fontSize="xs">{comment.anchor}{comment.batchId ? ` · ${comment.batchId}` : ''}</Text></Box>
                  <Badge colorScheme={statusColor[comment.status]}>{comment.status}</Badge>
                </Flex>
                <Text color="gray.600" mt={3}>{comment.content}</Text>
                {comment.status === '待处理' && <Button mt={3} size="sm" colorScheme="blue" variant="outline" onClick={() => acceptComment(comment.id)}>接受并合并条款</Button>}
                {comment.status === '已失效' && <Alert status="warning" mt={3} py={1} px={2} borderRadius="6px" fontSize="xs"><AlertIcon />窗口日期、独占或语言已改动，本意见依据失效。请查看上方按最新窗口重算的意见，或关闭本条失效意见。</Alert>}
                {comment.status === '已失效' && <Button mt={2} size="sm" variant="ghost" colorScheme="red" onClick={() => { dismissComment(comment.id); toast({ title: '失效意见已关闭', status: 'info' }) }}>关闭失效意见</Button>}
              </Box>)}
            </Box>
            <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={4}>
              <Heading size="md" mb={3}>发表评论锚点</Heading>
              <Text fontSize="sm" mb={1}>锚定窗口</Text>
              <Select size="sm" mb={3} value={anchorId} onChange={(event) => setAnchorId(event.target.value)}>
                {windows.map((w) => <option key={w.id} value={w.id}>{w.id} · {w.work} · {w.territory} · {w.language} · {w.batchId}</option>)}
              </Select>
              <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={7} />
              <Button mt={3} colorScheme="blue" isDisabled={!draft.trim()} onClick={() => { addComment({ windowId: anchorId, author: '当前审阅人', role: '法务', content: draft.trim() }); setDraft(''); toast({ title: '评论已加入审阅草稿', status: 'success' }) }}>提交法务意见</Button>
            </Box>
          </Grid></TabPanel>
          <TabPanel px={0} pt={4}><Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={4}>{versions.slice(0, 2).map((version) => <Box key={version.id} bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={4}><Flex justify="space-between"><Box><Heading size="md">{version.id}</Heading><Text color="gray.500" fontSize="sm">{version.author} · {version.time}</Text></Box><Badge>{version.changes.length} 项</Badge></Flex><Text fontWeight="600" mt={4}>{version.summary}</Text>{version.changes.map((change) => <Checkbox key={change} mt={3} isChecked={accepted.includes(change)} onChange={(event) => setAccepted((current) => event.target.checked ? [...current, change] : current.filter((item) => item !== change))}>{change}</Checkbox>)}</Box>)}</Grid></TabPanel>
          <TabPanel px={0} pt={4}><Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="8px" p={5}>
            <HStack align="flex-start" mb={5}><Badge colorScheme="green">16:35</Badge><Box><Text fontWeight="700">章宁提交 v18（批次 {currentBatchId}）</Text><Text color="gray.500" fontSize="sm">调整流媒体窗口，新增粤语语言轨、港台地区和次级授权约束。</Text></Box></HStack>
            <HStack align="flex-start" mb={5}><Badge colorScheme="orange">16:42</Badge><Box><Text fontWeight="700">规则引擎按语言分轨裁决</Text><Text color="gray.500" fontSize="sm">普通话字幕与粤语配音窗口不再互相遮挡；RW-109 作为同批次后到独占留待核验。</Text></Box></HStack>
            <HStack align="flex-start" mb={5}><Badge colorScheme="orange">{snapshot ? '已冻结' : '未提交'}</Badge><Box><Text fontWeight="700">批次快照{!snapshot ? '尚未生成' : ` · ${snapshot.committedAt.slice(11, 16)}`}</Text><Text color="gray.500" fontSize="sm">{snapshot ? `快照含 ${snapshot.windows.length} 个窗口、留待核验 ${snapshot.heldWindowIds.length} 个，审批包将引用此快照。` : '请在授权窗口页提交整批次，写入失败可按批次号重试。'}</Text></Box></HStack>
            <HStack align="flex-start"><Badge colorScheme="gray">待处理</Badge><Box><Text fontWeight="700">发行负责人审批</Text><Text color="gray.500" fontSize="sm">条款意见处理完、留待核验窗口全部核验后进入只读审批。</Text></Box></HStack>
          </Box></TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  )
}
