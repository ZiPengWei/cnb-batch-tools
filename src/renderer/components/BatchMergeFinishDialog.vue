<template>
  <n-modal
    :auto-focus="false"
    preset="dialog"
    :show="show"
    :style="modalStyle"
    :title="finishTitle"
    :type="dialogType"
    @update:show="setShow"
  >
    <div class="finish-body">
      <div
        v-if="summary"
        class="stat-grid"
      >
        <div
          class="stat-card"
          :class="summary.merged.length ? 'stat-success' : 'stat-muted'"
        >
          <span class="stat-label">成功</span>
          <span class="stat-num wb-mono">{{ summary.merged.length }}</span>
        </div>
        <div
          class="stat-card"
          :class="summary.conflicts.length ? 'stat-warning' : 'stat-muted'"
        >
          <span class="stat-label">冲突</span>
          <span class="stat-num wb-mono">{{ summary.conflicts.length }}</span>
        </div>
        <div
          class="stat-card"
          :class="summary.failures.length ? 'stat-danger' : 'stat-muted'"
        >
          <span class="stat-label">失败</span>
          <span class="stat-num wb-mono">{{ summary.failures.length }}</span>
        </div>
        <div class="stat-card stat-muted">
          <span class="stat-label">无变更</span>
          <span class="stat-num wb-mono">{{ summary.noop.length }}</span>
        </div>
      </div>

      <details
        v-if="summary?.conflicts.length"
        class="result-panel panel-warning"
        open
      >
        <summary class="panel-summary">
          <div class="panel-summary-left">
            <AppIcon
              class="panel-icon"
              name="alert-triangle"
              :size="14"
            />
            <n-text type="warning">
              存在冲突，已跳过并取消 PR ({{ summary.conflicts.length }})
            </n-text>
          </div>
          <AppIcon
            class="panel-chevron"
            name="chevron-down"
            :size="14"
          />
        </summary>
        <div class="detail-content">
          <div
            v-for="(c, i) in summary.conflicts"
            :key="`c-${i}`"
            class="detail-row"
          >
            <span class="detail-text wb-mono">
              ✗ {{ c.source }} -> {{ c.target }}（{{ c.reason || '检测到冲突' }}）
            </span>
            <n-button
              v-if="prHref(c.prNumber)"
              text
              type="primary"
              @click="openPr(c.prNumber)"
            >
              查看 PR #{{ c.prNumber }}
            </n-button>
          </div>
        </div>
      </details>

      <details
        v-if="summary?.failures.length"
        class="result-panel panel-danger"
        open
      >
        <summary class="panel-summary">
          <div class="panel-summary-left">
            <AppIcon
              class="panel-icon"
              name="x-circle"
              :size="14"
            />
            <n-text type="error">
              失败 ({{ summary.failures.length }})
            </n-text>
          </div>
          <AppIcon
            class="panel-chevron"
            name="chevron-down"
            :size="14"
          />
        </summary>
        <div class="detail-content">
          <div
            v-for="(f, i) in summary.failures"
            :key="`f-${i}`"
            class="detail-row"
          >
            <span class="detail-text wb-mono">
              ✗ {{ f.source }} -> {{ f.target }}（{{ f.reason || '未知原因' }}）
            </span>
            <n-button
              v-if="prHref(f.prNumber)"
              text
              type="primary"
              @click="openPr(f.prNumber)"
            >
              查看 PR #{{ f.prNumber }}
            </n-button>
          </div>
        </div>
      </details>

      <details
        v-if="summary?.merged.length"
        class="result-panel panel-success"
      >
        <summary class="panel-summary">
          <div class="panel-summary-left">
            <AppIcon
              class="panel-icon"
              name="check-circle"
              :size="14"
            />
            <n-text type="success">
              成功合并 ({{ summary.merged.length }})
            </n-text>
          </div>
          <AppIcon
            class="panel-chevron"
            name="chevron-down"
            :size="14"
          />
        </summary>
        <div class="detail-content">
          <div
            v-for="(m, i) in summary.merged"
            :key="`m-${i}`"
            class="detail-row"
          >
            <span class="detail-text wb-mono">
              ✓ {{ m.source }} -> {{ m.target }}
            </span>
            <n-button
              v-if="prHref(m.prNumber)"
              text
              type="primary"
              @click="openPr(m.prNumber)"
            >
              查看 PR #{{ m.prNumber }}
            </n-button>
          </div>
        </div>
      </details>

      <details
        v-if="summary?.noop.length"
        class="result-panel panel-muted"
      >
        <summary class="panel-summary">
          <div class="panel-summary-left">
            <n-text depth="3">
              无变更，已跳过 ({{ summary.noop.length }})
            </n-text>
          </div>
          <AppIcon
            class="panel-chevron"
            name="chevron-down"
            :size="14"
          />
        </summary>
        <div class="detail-content">
          <div
            v-for="(n, i) in summary.noop"
            :key="`n-${i}`"
            class="detail-row"
          >
            <n-text depth="3">
              <span class="wb-mono">
                {{ n.source }} -> {{ n.target }}（{{ n.reason || '无变更' }}）
              </span>
            </n-text>
          </div>
        </div>
      </details>

      <div
        v-if="summary?.message"
        class="summary-err-banner"
      >
        <n-text type="error">
          {{ summary.message }}
        </n-text>
      </div>

      <details class="result-panel panel-muted">
        <summary class="panel-summary">
          <div class="panel-summary-left">
            <AppIcon
              class="panel-icon"
              name="terminal"
              :size="13"
            />
            <n-text depth="3">
              操作日志
            </n-text>
          </div>
          <AppIcon
            class="panel-chevron"
            name="chevron-down"
            :size="14"
          />
        </summary>
        <div class="detail-content">
          <div class="finish-log-box wb-mono">
            <n-log
              :log="logLines.join('\n')"
              :rows="10"
            />
          </div>
        </div>
      </details>
    </div>

    <template #action>
      <n-space justify="end">
        <n-button @click="onCopyReport()">
          <Transition
            mode="out-in"
            name="wb-copy-swap"
          >
            <span
              :key="copied ? 'copied' : 'copy'"
              class="copy-btn-label"
            >{{ copied ? '已复制 ✓' : '复制报告' }}</span>
          </Transition>
        </n-button>
        <n-button
          v-if="retryPairs.length"
          type="warning"
          @click="onRetryFailed()"
        >
          仅重试失败 ({{ retryPairs.length }})
        </n-button>
        <n-button
          type="primary"
          @click="close"
        >
          关闭
        </n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<script setup lang="ts">
/**
 * BatchMergeFinishDialog
 * 用途：批量合并结束后的结果弹窗，按分支展示成功/冲突/失败明细与完整日志。
 */
import { computed, onUnmounted, ref } from 'vue'
import type { MergeRunSummary } from '../store/merge'
import { copyText, openExternal } from '../ipc/bridge'
import { NButton, NLog, NModal, NSpace, NText } from '../ui/naive'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    show: boolean
    summary: MergeRunSummary | null
    logLines: string[]
    modalWidth?: string
    repo?: string
  }>(),
  {
    modalWidth: 'min(620px, 92vw)',
    repo: '',
  },
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
  (e: 'retry-failed', pairs: Array<{ source: string; target: string }>): void
}>()

const finishTitle = computed(() => {
  const s = props.summary
  if (!s) return '合并结果'
  if (s.ok) {
    if (s.merged.length === 0 && s.noop.length > 0) return '合并完成（无变更）'
    return '合并完成'
  }
  if (s.merged.length) return '部分合并完成'
  return '合并失败'
})

const dialogType = computed<'info' | 'success' | 'warning' | 'error'>(() => {
  const s = props.summary
  if (!s) return 'info'
  if (s.ok) return 'success'
  if (s.merged.length) return 'warning'
  return 'error'
})

const retryPairs = computed(() => [
  ...(props.summary?.conflicts || []),
  ...(props.summary?.failures || []),
])

function prHref(prNumber?: string): string {
  if (!props.repo || !prNumber) return ''
  return `https://cnb.cool/${props.repo}/-/pulls/${prNumber}`
}

function openPr(prNumber?: string) {
  const url = prHref(prNumber)
  if (url) void openExternal(url)
}

function buildReport(): string {
  const s = props.summary
  if (!s) return '合并报告为空'
  const lines: string[] = []
  lines.push(`CNB 批量合并报告${props.repo ? `（仓库：${props.repo}）` : ''}`)
  lines.push(
    `结果：成功 ${s.merged.length} · 冲突 ${s.conflicts.length} · 失败 ${s.failures.length} · 无变更 ${s.noop.length}`,
  )
  const section = (
    title: string,
    icon: string,
    rows: Array<{ source: string; target: string; reason?: string; prNumber?: string }>,
  ) => {
    if (!rows.length) return
    lines.push('')
    lines.push(`${icon} ${title} (${rows.length})`)
    for (const r of rows) {
      const pr = r.prNumber ? ` (PR #${r.prNumber})` : ''
      lines.push(
        `  ${r.source} -> ${r.target}${pr}${r.reason ? `（${r.reason}）` : ''}`,
      )
    }
  }
  section('成功合并', '✓', s.merged)
  section('冲突跳过（已取消 PR）', '⚠', s.conflicts)
  section('失败', '✗', s.failures)
  section('无变更跳过', '○', s.noop)
  if (s.message) {
    lines.push('')
    lines.push(`错误信息：${s.message}`)
  }
  return lines.join('\n')
}

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

async function onCopyReport() {
  try {
    await copyText(buildReport())
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
      copiedTimer = null
    }, 2000)
  } catch {
    copied.value = false
  }
}

onUnmounted(() => {
  if (copiedTimer) {
    clearTimeout(copiedTimer)
    copiedTimer = null
  }
})

function onRetryFailed() {
  if (!retryPairs.value.length) return
  emit(
    'retry-failed',
    retryPairs.value.map((p) => ({ source: p.source, target: p.target })),
  )
}

const modalStyle = computed(() => ({
  width: props.modalWidth,
}))

function setShow(val: boolean) {
  emit('update:show', val)
}

function close() {
  setShow(false)
}
</script>

<style scoped>
.finish-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 11px;
  border-radius: var(--wb-radius-md);
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-sunken);
}

.copy-btn-label {
  display: inline-block;
}

.wb-copy-swap-enter-active {
  transition:
    opacity 140ms var(--wb-ease-out),
    transform 140ms var(--wb-ease-out),
    filter 140ms var(--wb-ease-out);
}

.wb-copy-swap-leave-active {
  transition:
    opacity 95ms var(--wb-ease-out),
    transform 95ms var(--wb-ease-out),
    filter 95ms var(--wb-ease-out);
}

.wb-copy-swap-enter-from,
.wb-copy-swap-leave-to {
  opacity: 0;
  transform: scale(0.95);
  filter: blur(2px);
}

.stat-label {
  font-size: 11px;
  color: var(--wb-text-3);
}

.stat-num {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--wb-text-2);
}

.stat-success {
  border-color: var(--wb-success-border);
  background-color: var(--wb-success-soft);
}

.stat-success .stat-num {
  color: var(--wb-success);
}

.stat-warning {
  border-color: var(--wb-warning-border);
  background-color: var(--wb-warning-soft);
}

.stat-warning .stat-num {
  color: var(--wb-warning);
}

.stat-danger {
  border-color: var(--wb-danger-border);
  background-color: var(--wb-danger-soft);
}

.stat-danger .stat-num {
  color: var(--wb-danger);
}

.stat-muted {
  opacity: 0.85;
}

.result-panel {
  border-radius: var(--wb-radius-md);
  border: 1px solid var(--wb-border);
  border-left-width: 3px;
  background-color: var(--wb-bg-sunken);
  padding: 8px 12px;
}

.panel-warning {
  border-left-color: var(--wb-warning);
}

.panel-danger {
  border-left-color: var(--wb-danger);
}

.panel-success {
  border-left-color: var(--wb-success);
}

.panel-muted {
  border-left-color: var(--wb-border-strong);
}

.panel-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  list-style: none;
}

.panel-summary-left {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.panel-chevron {
  color: var(--wb-text-3);
  transition: transform var(--wb-transition);
}

.result-panel[open] > .panel-summary .panel-chevron {
  transform: rotate(180deg);
}

.panel-summary::-webkit-details-marker {
  display: none;
}

.panel-icon {
  color: var(--wb-text-3);
}

.panel-warning .panel-icon {
  color: var(--wb-warning);
}

.panel-danger .panel-icon {
  color: var(--wb-danger);
}

.panel-success .panel-icon {
  color: var(--wb-success);
}

.detail-content {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 0 2px;
  margin-top: 8px;
  border-top: 1px solid var(--wb-divider);
  overflow-wrap: anywhere;
  animation: wb-detail-in 160ms var(--wb-ease-out);
}

.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  line-height: 1.45;
}

.detail-text {
  min-width: 0;
  flex: 1 1 auto;
  color: var(--wb-text-1);
  overflow-wrap: anywhere;
}

.detail-row .n-button {
  flex: 0 0 auto;
}

.summary-err-banner {
  padding: 8px 12px;
  border-radius: var(--wb-radius-md);
  border: 1px solid var(--wb-danger-border);
  background-color: var(--wb-danger-soft);
  font-size: 12.5px;
}

.finish-log-box {
  padding: 8px 10px;
  border-radius: var(--wb-radius-sm);
  border: 1px solid var(--wb-terminal-border);
  background-color: var(--wb-terminal-bg);
}
</style>
