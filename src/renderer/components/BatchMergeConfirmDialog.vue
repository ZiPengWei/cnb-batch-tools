<template>
  <n-modal
    :auto-focus="false"
    :closable="!disableCloseWhenRunning || !confirmRunning"
    :mask-closable="!disableCloseWhenRunning || !confirmRunning"
    preset="dialog"
    :show="show"
    :style="modalStyle"
    :title="confirmRunning ? runningTitle : confirmTitle"
    @update:show="setShow"
  >
    <div class="confirm-body">
      <div class="confirm-summary-card">
        <div class="summary-row">
          <span class="summary-label">仓库：</span>
          <span class="summary-value wb-mono">{{ repo || '未选择' }}</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">源分支：</span>
          <span
            class="summary-source-chip wb-mono"
            :title="sourceBranches.join('、') || '未选择'"
          >
            <AppIcon
              name="git-branch"
              :size="12"
            />
            <span class="wb-ellipsis">{{ sourceBranches.join('、') || '未选择' }}</span>
          </span>
        </div>
        <div class="summary-targets-block">
          <div class="summary-targets-head">
            <span class="summary-label">目标分支：</span>
            <span class="summary-target-count wb-mono">
              <template v-if="confirmRunning && progress.total > 0">
                已完成 {{ progress.completed }} / {{ progress.total }}
              </template>
              <template v-else>
                {{ targetCount }} 个
              </template>
            </span>
          </div>

          <div
            v-if="targetBranches.length && !confirmRunning"
            class="target-tag-pool"
          >
            <n-tag
              v-for="target in targetBranches"
              :key="target"
              closable
              type="primary"
              @close="emit('remove-target', target)"
            >
              <span class="wb-mono">{{ target }}</span>
            </n-tag>
          </div>

          <div
            v-else-if="targetBranches.length && confirmRunning"
            class="target-tag-pool"
          >
            <span
              v-for="target in targetBranches"
              :key="target"
              class="live-target-chip wb-mono"
              :class="`is-${progress.statuses[target] || 'pending'}`"
            >
              <span
                v-if="(progress.statuses[target] || 'pending') === 'running'"
                class="live-dot is-running"
              />
              <AppIcon
                v-else-if="progress.statuses[target] === 'merged'"
                name="check"
                :size="11"
                :stroke-width="2.4"
              />
              <AppIcon
                v-else-if="progress.statuses[target] === 'conflict'"
                name="alert-triangle"
                :size="11"
              />
              <AppIcon
                v-else-if="progress.statuses[target] === 'failed'"
                name="x"
                :size="11"
                :stroke-width="2.4"
              />
              <AppIcon
                v-else-if="progress.statuses[target] === 'noop'"
                name="minus"
                :size="11"
              />
              <span
                v-else
                class="live-dot is-pending"
              />
              <span>{{ target }}</span>
            </span>
          </div>
        </div>
      </div>

      <div class="pr-plan-note">
        将为每个目标分支分别创建 PR，共 <strong class="wb-mono">{{ targetCount }}</strong> 个。
      </div>

      <div
        v-if="lastRun"
        class="history-box"
      >
        <div
          class="last-run"
          :title="`上次合并于 ${new Date(lastRun.ts).toLocaleString('zh-CN')}`"
        >
          <AppIcon
            class="history-icon"
            name="history"
            :size="13"
          />
          <n-text depth="3">
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
            <div
              v-for="h in recentRuns"
              :key="h.ts"
              class="history-item"
            >
              <span
                class="history-dot"
                :class="h.ok ? 'is-ok' : 'is-warn'"
              />
              <n-text depth="3">
                {{ formatRelativeTime(h.ts) }} · {{ h.source }} →
                {{ h.targets.join('、') }}（成功 {{ h.merged }} / 冲突
                {{ h.conflicts }} / 失败 {{ h.failures }}）
              </n-text>
            </div>
          </div>
        </details>
      </div>

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
          <div class="terminal-head">
            <div class="terminal-title">
              <span class="terminal-live-dot" />
              <AppIcon
                name="terminal"
                :size="13"
              />
              <span>实时执行日志</span>
            </div>
            <span class="terminal-count wb-mono">
              {{ progress.percent }}% · {{ logLines.length }} lines
            </span>
          </div>
          <div class="terminal-progress-track">
            <div
              class="terminal-progress-fill"
              :style="{ transform: `scaleX(${Math.max(0.04, progress.percent / 100)})` }"
            />
            <div class="terminal-progress-sheen" />
          </div>
          <div
            v-if="confirmLogHint"
            class="hint"
          >
            <n-text depth="3">
              {{ confirmLogHint }}
            </n-text>
          </div>
          <div class="terminal-body wb-mono">
            <n-log
              :log="logLines.join('\n')"
              :rows="10"
            />
          </div>
        </div>
      </n-collapse-transition>
    </div>

    <template #action>
      <div class="dialog-actions">
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
      </div>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
/**
 * BatchMergeConfirmDialog
 * 用途：批量合并前的确认弹窗，合并过程中实时点亮目标分支状态、推进进度条并滚动终端日志。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { MergeHistoryEntry, MergeRunSummary } from '../store/merge'
import { formatRelativeTime } from '../store/merge'
import { parseMergeProgress } from '../utils/branchMatch'
import {
  NAlert,
  NButton,
  NCollapseTransition,
  NLog,
  NModal,
  NTag,
  NText,
} from '../ui/naive'
import AppIcon from './AppIcon.vue'

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
    modalWidth: 'min(620px, 92vw)',
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

const repoRuns = computed(() =>
  props.history.filter((h) => h.repo === props.repo),
)
const lastRun = computed(() => repoRuns.value[0] || null)
const recentRuns = computed(() => repoRuns.value.slice(0, 5))

const progress = computed(() =>
  parseMergeProgress(props.targetBranches, props.logLines),
)

const modalStyle = computed(() => ({
  width: props.modalWidth,
}))

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
    const logContent =
      el.querySelector('.n-log .n-scrollbar-container') ||
      el.querySelector('.n-log')
    if (!(logContent instanceof HTMLElement)) return
    logContent.scrollTop = logContent.scrollHeight
  },
)

function onModalKeydown(e: KeyboardEvent) {
  if (!props.show || confirmRunning.value) return
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    e.stopPropagation()
    void confirmRun()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onModalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onModalKeydown)
})

defineExpose<BatchMergeConfirmDialogExposed>({
  confirmRun,
  stopRunning,
})
</script>

<style scoped>
.confirm-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.confirm-summary-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
  padding: 12px 14px;
  border-radius: var(--wb-radius-md);
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-sunken);
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  min-width: 0;
}

.summary-label {
  color: var(--wb-text-3);
  flex: 0 0 auto;
}

.summary-value {
  color: var(--wb-text-1);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.summary-source-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 2px 8px;
  border-radius: 5px;
  background-color: var(--wb-bg-subtle);
  border: 1px solid var(--wb-border);
  color: var(--wb-text-1);
  font-size: 12px;
  font-weight: 500;
}

.summary-targets-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding-top: 6px;
  border-top: 1px solid var(--wb-divider);
}

.summary-targets-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
}

.summary-target-count {
  font-size: 12px;
  color: var(--wb-accent-text);
  font-weight: 600;
}

.target-tag-pool {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 116px;
  overflow-y: auto;
  padding: 2px 0;
}

.live-target-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-subtle);
  color: var(--wb-text-3);
  transition:
    background-color var(--wb-transition),
    border-color var(--wb-transition),
    color var(--wb-transition);
}

.live-target-chip.is-running {
  border-color: var(--wb-accent-border);
  background-color: var(--wb-accent-soft);
  color: var(--wb-accent-text);
  font-weight: 600;
}

.live-target-chip.is-merged {
  border-color: var(--wb-success-border);
  background-color: var(--wb-success-soft);
  color: var(--wb-success);
  font-weight: 500;
}

.live-target-chip.is-conflict {
  border-color: var(--wb-warning-border);
  background-color: var(--wb-warning-soft);
  color: var(--wb-warning);
}

.live-target-chip.is-failed {
  border-color: var(--wb-danger-border);
  background-color: var(--wb-danger-soft);
  color: var(--wb-danger);
}

.live-target-chip.is-noop {
  border-color: var(--wb-border);
  background-color: var(--wb-bg-subtle);
  color: var(--wb-text-2);
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
}

.live-dot.is-pending {
  background-color: var(--wb-text-3);
  opacity: 0.55;
}

.live-dot.is-running {
  background-color: var(--wb-accent);
  box-shadow: 0 0 0 3px var(--wb-accent-soft);
  animation: wb-pulse 1.2s ease-in-out infinite;
}

.pr-plan-note {
  font-size: 12px;
  color: var(--wb-text-2);
}

.history-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 12px;
  border-radius: var(--wb-radius-md);
  border: 1px solid var(--wb-divider);
  background-color: var(--wb-bg-sunken);
  font-size: 12px;
}

.last-run {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  line-height: 1.45;
}

.history-icon {
  margin-top: 2px;
  color: var(--wb-text-3);
}

.history-details {
  border-top: 1px solid var(--wb-divider);
  padding-top: 6px;
}

.history-details summary {
  cursor: pointer;
  user-select: none;
  font-size: 12px;
}

.history-details summary::marker {
  color: var(--wb-text-3);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 0 2px 14px;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11.5px;
}

.history-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.history-dot.is-ok {
  background-color: var(--wb-success);
}

.history-dot.is-warn {
  background-color: var(--wb-warning);
}

.log-wrapper {
  border-radius: var(--wb-radius-md);
  border: 1px solid var(--wb-terminal-border);
  background-color: var(--wb-terminal-bg);
  overflow: hidden;
}

.terminal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 11px;
  background-color: var(--wb-bg-elevated);
}

.terminal-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--wb-text-1);
}

.terminal-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background-color: var(--wb-accent);
  box-shadow: 0 0 0 3px var(--wb-accent-soft);
  animation: wb-pulse 1.5s ease-in-out infinite;
}

.terminal-count {
  font-size: 11px;
  color: var(--wb-text-3);
}

.terminal-progress-track {
  position: relative;
  height: 2.5px;
  width: 100%;
  background-color: var(--wb-divider);
  overflow: hidden;
}

.terminal-progress-fill {
  height: 100%;
  width: 100%;
  transform-origin: left center;
  background: linear-gradient(90deg, var(--wb-accent-strong), var(--wb-accent));
  transition: transform 240ms var(--wb-ease-out);
}

.terminal-progress-sheen {
  position: absolute;
  inset: 0;
  width: 32%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.45),
    transparent
  );
  animation: wb-progress-sheen 1.6s linear infinite;
  pointer-events: none;
}

@keyframes wb-progress-sheen {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(420%);
  }
}

.hint {
  display: block;
  padding: 8px 11px 0;
  font-size: 12px;
}

.terminal-body {
  padding: 8px 10px;
}

.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

@keyframes wb-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
