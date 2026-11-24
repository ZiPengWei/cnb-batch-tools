<template>
  <n-modal
    :closable="!disableCloseWhenRunning || !confirmRunning"
    :mask-closable="!disableCloseWhenRunning || !confirmRunning"
    preset="dialog"
    :show="show"
    :style="modalStyle"
    :title="confirmRunning ? runningTitle : confirmTitle"
    @update:show="setShow"
  >
    <n-space vertical>
      <n-text>仓库：{{ repo || '未选择' }}</n-text>
      <n-text>源分支：{{ sourceBranches.join('、') || '未选择' }}</n-text>
      <n-text>目标分支：{{ targetCount }} 个</n-text>
      <div
        v-if="targetBranches.length"
        :style="targetListStyle"
      >
        <n-tag
          v-for="target in targetBranches"
          :key="target"
          :closable="!confirmRunning"
          @close="emit('remove-target', target)"
        >
          {{ target }}
        </n-tag>
      </div>
      <n-text depth="3">
        将为每个目标分支分别创建 PR，共 {{ targetCount }} 个。
      </n-text>

      <div
        v-if="lastRun"
        class="last-run"
      >
        <n-text
          depth="3"
          :title="`上次合并于 ${new Date(lastRun.ts).toLocaleString('zh-CN')}`"
        >
          上次合并：{{ formatRelativeTime(lastRun.ts) }} · {{ lastRun.source }} →
          {{ lastRun.targets.join('、') }} · 成功 {{ lastRun.merged }} / 冲突
          {{ lastRun.conflicts }} / 失败 {{ lastRun.failures }}
        </n-text>
      </div>

      <details
        v-if="recentRuns.length > 1"
        class="history-details"
      >
        <summary>
          <n-text depth="3">
            该仓库最近 {{ recentRuns.length }} 次合并
          </n-text>
        </summary>
        <div class="history-list">
          <n-space vertical>
            <n-text
              v-for="h in recentRuns"
              :key="h.ts"
              depth="3"
            >
              {{ formatRelativeTime(h.ts) }} · {{ h.source }} →
              {{ h.targets.join('、') }}（成功 {{ h.merged }} / 冲突
              {{ h.conflicts }} / 失败 {{ h.failures }}）
            </n-text>
          </n-space>
        </div>
      </details>

      <n-alert
        :show-icon="true"
        type="warning"
      >
        {{ warningText }}
      </n-alert>

      <n-collapse-transition :show="confirmRunning">
        <div
          v-if="confirmRunning"
          ref="confirmLogEl"
          class="log-wrapper"
          data-testid="confirm-log-wrapper"
        >
          <div
            v-if="confirmLogHint"
            class="hint"
          >
            <n-text depth="3">
              {{ confirmLogHint }}
            </n-text>
          </div>
          <n-log
            :log="logLines.join('\n')"
            :rows="10"
            :style="logBoxStyle"
          />
        </div>
      </n-collapse-transition>
    </n-space>
    <template #action>
      <n-button
        v-if="!confirmRunning"
        @click="close"
      >
        取消
      </n-button>
      <n-button
        v-if="!confirmRunning"
        type="primary"
        @click="confirmRun"
      >
        确认
      </n-button>
      <n-button
        v-else
        disabled
        loading
      >
        合并中...
      </n-button>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
/**
 * BatchMergeConfirmDialog
 * 用途：批量合并前的确认弹窗，合并过程中展示日志并自动滚动到底部。
 *
 * Props：
 * - show: 是否显示弹窗（v-model:show）
 * - repo: 当前仓库路径（org/repo）
 * - sourceBranches: 源分支列表
 * - targetCount: 目标分支数量（用于展示文案）
 * - targetBranches: 目标分支名称（用于合并前核对）
 * - logLines: 日志文本行数组
 * - run: 触发合并的异步函数，返回合并摘要或 null
 * - disableCloseWhenRunning: 运行中是否禁止关闭
 * - history: 合并历史（用于展示当前仓库的最近合并记录）
 * - modalWidth/confirmTitle/runningTitle/warningText: 文案与样式可配置项
 *
 * Emits：
 * - update:show: (val: boolean) 控制弹窗显示
 * - run-start/run-finish: 合并开始与结束（附 summary）
 * - remove-target: (name: string) 确认前移除某个目标分支（运行中不可移除）
 */
import { computed, nextTick, ref, watch } from 'vue'
import type { MergeHistoryEntry, MergeRunSummary } from '../store/merge'
import { formatRelativeTime } from '../store/merge'
import {
  NAlert,
  NButton,
  NCollapseTransition,
  NLog,
  NModal,
  NSpace,
  NTag,
  NText,
  useThemeVars,
} from '../ui/naive'

export type BatchMergeConfirmDialogExposed = {
  confirmRun: () => Promise<void>
  stopRunning: () => void
}

const props = withDefaults(
  defineProps<{
    show: boolean
    repo: string | null | undefined
    sourceBranches: string[]
    targetCount: number
    targetBranches?: string[]
    logLines: string[]
    run: (repo: string, sourceBranches: string[]) => Promise<MergeRunSummary | null>
    disableCloseWhenRunning?: boolean
    history?: MergeHistoryEntry[]
    modalWidth?: string
    confirmTitle?: string
    runningTitle?: string
    warningText?: string
  }>(),
  {
    disableCloseWhenRunning: true,
    targetBranches: () => [],
    history: () => [],
    modalWidth: 'min(600px, 92vw)',
    confirmTitle: '确认合并',
    runningTitle: '正在合并...',
    warningText:
      '注意：每个目标分支独立处理；检测到冲突时将跳过该分支并自动取消对应 PR，其余分支继续合并。',
  },
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'run-start'): void
  (e: 'run-finish', summary: MergeRunSummary | null): void
  (e: 'remove-target', name: string): void
}>()

const confirmRunning = ref(false)
const confirmLogEl = ref<HTMLDivElement | null>(null)

/** 当前仓库的合并记录（最近在前） */
const repoRuns = computed(() =>
  props.history.filter((h) => h.repo === props.repo),
)
const lastRun = computed(() => repoRuns.value[0] || null)
const recentRuns = computed(() => repoRuns.value.slice(0, 5))

const themeVars = useThemeVars()

const modalStyle = computed(() => ({
  width: props.modalWidth,
}))

const targetListStyle = computed(() => {
  const v = themeVars.value
  return {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    maxHeight: '120px',
    overflowY: 'auto',
    padding: '8px',
    border: `1px solid ${v.borderColor}`,
    borderRadius: v.borderRadiusSmall,
  } as const
})

const logBoxStyle = computed(() => {
  const v = themeVars.value
  return {
    border: `1px solid ${v.borderColor}`,
    borderRadius: v.borderRadiusSmall,
    padding: '8px',
  } as const
})

const ipcAvailable = computed(() => {
  const ipc = (window as any)?.ipcRenderer
  return Boolean(ipc?.on && ipc?.invoke)
})

const confirmLogHint = computed(() => {
  if (!confirmRunning.value) return ''
  if (props.logLines.length) return ''
  if (!ipcAvailable.value) return '无法接收日志：ipcRenderer 不可用，请确认在 Electron 环境运行。'
  return '暂无日志输出，正在等待后台任务输出...'
})

function setShow(val: boolean) {
  emit('update:show', val)
}

function close() {
  setShow(false)
}

function stopRunning() {
  confirmRunning.value = false
}

async function confirmRun() {
  const repo = props.repo
  if (!repo) return
  if (!props.sourceBranches.length) return

  confirmRunning.value = true
  emit('run-start')
  await nextTick()

  const summary = await props.run(repo, props.sourceBranches)
  emit('run-finish', summary)

  confirmRunning.value = false
  setShow(false)
}

watch(
  () => props.show,
  (val) => {
    if (!val) confirmRunning.value = false
  },
)

watch(
  () => props.logLines.length,
  async () => {
    if (!confirmRunning.value) return
    await nextTick()
    const el = confirmLogEl.value
    if (!el) return
    const logContent = el.querySelector('.n-log .n-scrollbar-container') || el.querySelector('.n-log')
    if (!(logContent instanceof HTMLElement)) return
    logContent.scrollTop = logContent.scrollHeight
  },
)

defineExpose<BatchMergeConfirmDialogExposed>({
  confirmRun,
  stopRunning,
})
</script>

<style scoped>
.log-wrapper {
  margin-top: 16px;
}

.hint {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
}

.last-run {
  display: block;
}

.history-details {
  border-top: 1px solid var(--n-border-color, transparent);
  padding-top: 8px;
}

.history-details summary {
  cursor: pointer;
  user-select: none;
}

.history-details summary::marker {
  color: var(--n-text-color-3, currentColor);
}

.history-list {
  padding: 8px 0 4px 18px;
}
</style>
