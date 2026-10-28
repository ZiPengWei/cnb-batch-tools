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
            <n-text
              v-for="(c, i) in summary.conflicts"
              :key="`c-${i}`"
            >
              ✗ {{ c.source }} -> {{ c.target }}（{{ c.reason || '检测到冲突' }}）
            </n-text>
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
            <n-text
              v-for="(f, i) in summary.failures"
              :key="`f-${i}`"
            >
              ✗ {{ f.source }} -> {{ f.target }}（{{ f.reason || '未知原因' }}）
            </n-text>
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
            <n-text
              v-for="(m, i) in summary.merged"
              :key="`m-${i}`"
            >
              ✓ {{ m.source }} -> {{ m.target }}
            </n-text>
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
      <n-button
        type="primary"
        @click="close"
      >
        关闭
      </n-button>
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
 *
 * Emits：
 * - update:show: (val: boolean) 控制弹窗显示
 */
import { computed } from 'vue'
import type { MergeRunSummary } from '../store/merge'
import { NButton, NLog, NModal, NSpace, NTag, NText, useThemeVars } from '../ui/naive'

const props = withDefaults(
  defineProps<{
    show: boolean
    summary: MergeRunSummary | null
    logLines: string[]
    modalWidth?: string
  }>(),
  {
    modalWidth: 'min(600px, 92vw)',
  },
)

const emit = defineEmits<{
  (e: 'update:show', val: boolean): void
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
</style>
