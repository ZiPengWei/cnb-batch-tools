<template>
  <section
    class="wb-col"
    data-col="source"
  >
    <div class="wb-col-header">
      <div class="wb-col-heading">
        <span
          class="wb-col-step wb-mono"
          :class="`is-${stepState}`"
        >2.</span>{{ ' ' }}<span class="wb-col-title">选择源分支</span>
        <span class="wb-col-count wb-mono">{{ branches.length }}</span>
      </div>
      <button
        class="wb-col-action-btn"
        :disabled="!selectedRepo || loading"
        type="button"
        @click="emit('refresh')"
      >
        <AppIcon
          :class="{ 'wb-spinning': loading }"
          name="refresh"
          :size="12"
        />
        <span>{{ loading ? '加载中...' : '刷新' }}</span>
      </button>
    </div>

    <div class="wb-col-search">
      <FilterInput
        ref="filterRef"
        :disabled="!selectedRepo || loading"
        :model-value="filter"
        placeholder="过滤源分支..."
        @update:model-value="emit('update:filter', $event)"
      />
    </div>

    <div
      aria-label="源分支列表"
      class="wb-list-scroll"
      :style="scrollStyle"
      tabindex="0"
      @keydown="emit('keydown', $event)"
    >
      <div class="wb-list-inner">
        <div
          v-if="branchItems.length"
          class="wb-list-stack"
        >
          <button
            v-for="item in branchItems"
            :key="item.name"
            class="wb-row branch-row"
            :class="{ 'gl-kbd-active': kbdActiveKey === item.name }"
            :data-item-key="item.name"
            :data-selected="selectedBranch === item.name ? 'true' : 'false'"
            :title="item.name"
            type="button"
            @click="emit('select', item.name, $event)"
          >
            <AppIcon
              class="branch-icon"
              :class="[
                selectedBranch === item.name ? 'is-selected' : `wb-tone-${item.tone}`,
              ]"
              name="git-branch"
              :size="13"
            />
            <span class="branch-name wb-mono wb-ellipsis">
              <HighlightedText
                :query="filter"
                :text="item.name"
              />
            </span>
          </button>
        </div>

        <div
          v-else
          class="wb-list-empty"
        >
          <ListSkeleton v-if="loading" />
          <div
            v-else-if="error"
            class="wb-list-empty"
          >
            <n-text type="error">
              {{ error }}
            </n-text>
            <n-button
              :disabled="!selectedRepo"
              @click="emit('refresh')"
            >
              重试
            </n-button>
          </div>
          <EmptyState
            v-else
            :hint="emptyHint"
            :icon="totalCount && filter.trim() ? 'search' : 'git-branch'"
            :title="totalCount && filter.trim() ? '无匹配' : '暂无数据'"
          />
        </div>
      </div>
    </div>

    <div class="wb-col-footer">
      <span class="wb-col-footer-text wb-tabular">
        共 {{ branches.length }} 个分支
      </span>
      <span class="wb-col-footer-hint wb-mono">↑↓ · Enter</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { getBranchTone } from '../utils/branchMatch'
import { NButton, NText } from '../ui/naive'
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
import FilterInput, { type FilterInputExposed } from './FilterInput.vue'
import HighlightedText from './HighlightedText.vue'
import ListSkeleton from './ListSkeleton.vue'

export type SourceBranchColumnExposed = {
  focusFilter: () => void
}

const props = withDefaults(
  defineProps<{
    branches: string[]
    totalCount: number
    selectedRepo: string
    selectedBranch: string
    filter: string
    loading: boolean
    error: string
    kbdActiveKey: string
    stepState?: 'pending' | 'active' | 'done'
  }>(),
  {
    stepState: 'pending',
  },
)

const emit = defineEmits<{
  (e: 'update:filter', v: string): void
  (e: 'refresh'): void
  (e: 'select', name: string, event: MouseEvent): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const filterRef = ref<FilterInputExposed | null>(null)
const scrollStyle = { overflowY: 'auto' as const }

const branchItems = computed(() =>
  props.branches.map((name) => ({
    name,
    tone: getBranchTone(name),
  })),
)

const emptyHint = computed(() => {
  if (props.totalCount && props.filter.trim()) return '尝试调整分支关键字'
  if (!props.selectedRepo) return '请先从左侧选择一个仓库以加载分支'
  return ''
})

function focusFilter() {
  filterRef.value?.focus()
}

defineExpose<SourceBranchColumnExposed>({ focusFilter })
</script>

<style scoped>
.branch-row {
  gap: 8px;
}

.branch-icon {
  opacity: 0.85;
  transition: color var(--wb-transition), opacity var(--wb-transition);
}

.branch-icon.is-selected {
  color: var(--wb-accent);
  opacity: 1;
}

.branch-name {
  font-size: 12.5px;
  color: inherit;
}

.branch-row[data-selected='true'] .branch-name {
  color: var(--wb-accent-text);
  font-weight: 600;
}
</style>
