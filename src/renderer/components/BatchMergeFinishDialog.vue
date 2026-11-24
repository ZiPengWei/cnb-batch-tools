<template>
  <n-modal
    preset="dialog"
    :show="show"
    :style="modalStyle"
    :title="finishTitle"
    @update:show="setShow"
  >
    <n-space vertical>
      <n-space
        v-if="summary"
        align="center"
      >
        <n-tag :type="summary.merged.length ? 'success' : 'default'">
          成功 {{ summary.merged.length }}
        </n-tag>
        <n-tag :type="summary.conflicts.length ? 'warning' : 'default'">
          冲突 {{ summary.conflicts.length }}
        </n-tag>
        <n-tag :type="summary.failures.length ? 'error' : 'default'">
          失败 {{ summary.failures.length }}
        </n-tag>
        <n-tag>
          无变更 {{ summary.noop.length }}
        </n-tag>
      </n-space>

      <details
        v-if="summary?.conflicts.length"
        class="result-details"
        open
      >
        <summary>
          <n-text type="warning">
            存在冲突，已跳过并取消 PR ({{ summary.conflicts.length }})
          </n-text>
        </summary>
        <div class="detail-content">
          <n-space vertical>
            <div
              v-for="(c, i) in summary.conflicts"
              :key="`c-${i}`"
              class="detail-row"
            >
              <n-text>
                ✗ {{ c.source }} -> {{ c.target }}（{{ c.reason || '检测到冲突' }}）
              </n-text>
              <n-button
                v-if="prHref(c.prNumber)"
                text
                type="primary"
                @click="openPr(c.prNumber)"
              >
                查看 PR #{{ c.prNumber }}
              </n-button>
            </div>
          </n-space>
        </div>
      </details>

      <details
        v-if="summary?.failures.length"
        class="result-details"
        open
      >
        <summary>
          <n-text type="error">
            失败 ({{ summary.failures.length }})
          </n-text>
        </summary>
        <div class="detail-content">
          <n-space vertical>
            <div
              v-for="(f, i) in summary.failures"
              :key="`f-${i}`"
              class="detail-row"
            >
              <n-text>
                ✗ {{ f.source }} -> {{ f.target }}（{{ f.reason || '未知原因' }}）
              </n-text>
              <n-button
                v-if="prHref(f.prNumber)"
                text
                type="primary"
                @click="openPr(f.prNumber)"
              >
                查看 PR #{{ f.prNumber }}
              </n-button>
            </div>
          </n-space>
        </div>
      </details>

      <details
        v-if="summary?.merged.length"
        class="result-details"
      >
        <summary>
          <n-text type="success">
            成功合并 ({{ summary.merged.length }})
          </n-text>
        </summary>
        <div class="detail-content">
          <n-space vertical>
            <div
              v-for="(m, i) in summary.merged"
              :key="`m-${i}`"
              class="detail-row"
            >
              <n-text>
                ✓ {{ m.source }} -> {{ m.target }}
              </n-text>
              <n-button
                v-if="prHref(m.prNumber)"
                text
                type="primary"
                @click="openPr(m.prNumber)"
              >
                查看 PR #{{ m.prNumber }}
              </n-button>
            </div>
          </n-space>
        </div>
      </details>

      <details
        v-if="summary?.noop.length"
        class="result-details"
      >
        <summary>
          <n-text depth="3">
            无变更，已跳过 ({{ summary.noop.length }})
          </n-text>
        </summary>
        <div class="detail-content">
          <n-space vertical>
            <n-text
              v-for="(n, i) in summary.noop"
              :key="`n-${i}`"
              depth="3"
            >
              {{ n.source }} -> {{ n.target }}（{{ n.reason || '无变更' }}）
            </n-text>
          </n-space>
        </div>
      </details>

      <n-text
        v-if="summary?.message"
        type="error"
      >
        {{ summary.message }}
      </n-text>

      <details class="result-details">
        <summary>
          <n-text depth="3">
            操作日志
          </n-text>
        </summary>
        <div class="detail-content">
          <n-log
            :log="logLines.join('\n')"
            :rows="10"
            :style="logBoxStyle"
          />
        </div>
      </details>
    </n-space>
    <template #action>
      <n-space justify="end">
        <n-button
          @click="onCopyReport()"
        >
          {{ copied ? '已复制 ✓' : '复制报告' }}
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
 *
 * Props：
 * - show: 是否显示弹窗（v-model:show）
 * - summary: 合并结果摘要（可能为 null）
 * - logLines: 日志文本行数组
 * - modalWidth: 弹窗宽度
 * - repo: 仓库路径（用于报告文案，可选）
 *
 * Emits：
 * - update:show: (val: boolean) 控制弹窗显示
 * - retry-failed: (pairs) 仅重试失败（冲突+失败分支对），由父组件回填目标分支并重跑
 */
import { computed, ref } from 'vue'
import type { MergeRunSummary } from '../store/merge'
import { copyText, openExternal } from '../ipc/bridge'
import { NButton, NLog, NModal, NSpace, NTag, NText, useThemeVars } from '../ui/naive'

const props = withDefaults(
  defineProps<{
    show: boolean
    summary: MergeRunSummary | null
    logLines: string[]
    modalWidth?: string
    repo?: string
  }>(),
  {
    modalWidth: 'min(600px, 92vw)',
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

/** 冲突 + 失败分支对（"仅重试失败"的范围） */
const retryPairs = computed(() => [
  ...(props.summary?.conflicts || []),
  ...(props.summary?.failures || []),
])

/** 分支对对应的 PR 网页链接（仓库与 PR 编号齐备时才有） */
function prHref(prNumber?: string): string {
  if (!props.repo || !prNumber) return ''
  return `https://cnb.cool/${props.repo}/-/pulls/${prNumber}`
}

function openPr(prNumber?: string) {
  const url = prHref(prNumber)
  if (url) void openExternal(url)
}

/** 把结果摘要转为可粘贴汇报的纯文本报告 */
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
    }, 2000)
  } catch {
    copied.value = false
  }
}

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

const themeVars = useThemeVars()
const logBoxStyle = computed(() => {
  const v = themeVars.value
  return {
    border: `1px solid ${v.borderColor}`,
    borderRadius: v.borderRadiusSmall,
    padding: '8px',
  } as const
})

function setShow(val: boolean) {
  emit('update:show', val)
}

function close() {
  setShow(false)
}
</script>

<style scoped>
.result-details {
  border-top: 1px solid var(--n-border-color, transparent);
  padding-top: 8px;
}

.result-details summary {
  cursor: pointer;
  user-select: none;
}

.result-details summary::marker {
  color: var(--n-text-color-3, currentColor);
}

.detail-content {
  padding: 12px 0 4px 18px;
  overflow-wrap: anywhere;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.detail-row .n-button {
  flex: 0 0 auto;
}
</style>
