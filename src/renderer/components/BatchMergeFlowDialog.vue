<template>
  <BatchMergeConfirmDialog
    ref="confirmRef"
    v-model:show="showConfirm"
    :log-lines="mergeLogLines"
    :repo="projects.selectedRepo"
    :run="merge.run"
    :source-branches="projects.selectedSourceBranch ? [projects.selectedSourceBranch] : []"
    :target-branches="merge.selectedTargets"
    :target-count="merge.selectedTargets.length"
    @run-finish="onMergeFinished"
  />

  <BatchMergeFinishDialog
    v-model:show="showFinish"
    :log-lines="mergeLogLines"
    :summary="finishSummary"
  />
</template>

<script setup lang="ts">
/**
 * BatchMergeFlowDialog
 * 用途：封装“确认合并弹窗 + 合并结果弹窗”的整体流程与状态管理，避免父组件直接控制弹窗显隐。
 *
 * Emits：
 * - confirm-open/confirm-close: 确认弹窗显隐变更
 * - finish-open/finish-close: 结果弹窗显隐变更
 */
import { computed, ref, watch } from 'vue'
import type { MergeRunSummary } from '../store/merge'
import { useMergeStore } from '../store/merge'
import { useProjectsStore } from '../store/projects'
import BatchMergeConfirmDialog, { type BatchMergeConfirmDialogExposed } from './BatchMergeConfirmDialog.vue'
import BatchMergeFinishDialog from './BatchMergeFinishDialog.vue'

export type BatchMergeFlowDialogExposed = {
  openConfirm: () => void
  confirmRun: () => Promise<void>
  closeAll: () => void
}

const emit = defineEmits<{
  (e: 'confirm-open'): void
  (e: 'confirm-close'): void
  (e: 'finish-open'): void
  (e: 'finish-close'): void
}>()

const projects = useProjectsStore()
const merge = useMergeStore()

const mergeLogLines = computed(() => merge.logLines.map((l) => l.text))

const showConfirm = ref(false)
const showFinish = ref(false)
const finishSummary = ref<MergeRunSummary | null>(null)
const confirmRef = ref<BatchMergeConfirmDialogExposed | null>(null)

function openConfirm() {
  finishSummary.value = null
  showFinish.value = false
  showConfirm.value = true
}

async function confirmRun() {
  await confirmRef.value?.confirmRun()
}

function closeAll() {
  showConfirm.value = false
  showFinish.value = false
  finishSummary.value = null
  confirmRef.value?.stopRunning()
}

function onMergeFinished(summary: MergeRunSummary | null) {
  finishSummary.value = summary
  showFinish.value = true
}

watch(
  () => showConfirm.value,
  (val) => {
    if (val) emit('confirm-open')
    else emit('confirm-close')
  },
)

watch(
  () => showFinish.value,
  (val) => {
    if (val) emit('finish-open')
    else emit('finish-close')
  },
)

defineExpose<BatchMergeFlowDialogExposed>({
  openConfirm,
  confirmRun,
  closeAll,
})
</script>

<style scoped>
</style>
