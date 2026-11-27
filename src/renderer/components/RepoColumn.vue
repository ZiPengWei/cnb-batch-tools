<template>
  <section
    class="wb-col"
    data-col="repo"
  >
    <div class="wb-col-header">
      <div class="wb-col-heading">
        <span
          class="wb-col-step wb-mono"
          :class="`is-${stepState}`"
        >1.</span>{{ ' ' }}<span class="wb-col-title">选择仓库</span>
        <span class="wb-col-count wb-mono">{{ items.length }}</span>
      </div>
      <button
        class="wb-col-action-btn"
        :disabled="!canUseContent || loading"
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
        :disabled="!canUseContent"
        :model-value="filter"
        placeholder="过滤仓库..."
        shortcut="⌘F"
        @update:model-value="emit('update:filter', $event)"
      />
      <div
        v-if="pinError"
        class="col-error-bar"
      >
        <n-text type="error">
          {{ pinError }}
        </n-text>
      </div>
    </div>

    <div
      aria-label="项目列表"
      class="wb-list-scroll"
      :style="scrollStyle"
      tabindex="0"
      @keydown="emit('keydown', $event)"
    >
      <div class="wb-list-inner">
        <div
          v-if="displayRows.length"
          class="wb-list-stack"
        >
          <template
            v-for="(row, idx) in displayRows"
            :key="row.type === 'separator' ? `repo-sep-${idx}` : row.id"
          >
            <div
              v-if="row.type === 'separator'"
              class="wb-col-sep"
            >
              <span class="wb-col-sep-line" />
              <span class="wb-col-sep-label">其他仓库</span>
              <span class="wb-col-sep-line" />
            </div>
            <button
              v-else
              class="wb-row repo-row"
              :class="{ 'gl-kbd-active': kbdActiveKey === String(row.id) }"
              :data-item-key="String(row.id)"
              :data-selected="selectedRepo === row.id ? 'true' : 'false'"
              :title="row.display"
              type="button"
              @click="emit('select', { id: row.id, display: row.display }, $event)"
            >
              <div class="repo-main">
                <span class="repo-name wb-mono wb-ellipsis">
                  <HighlightedText
                    :query="filter"
                    :text="row.name"
                  />
                </span>
                <span
                  v-if="row.namespace"
                  class="repo-ns wb-mono wb-ellipsis"
                >
                  <HighlightedText
                    :query="filter"
                    :text="row.namespace"
                  />
                </span>
              </div>

              <div class="repo-actions">
                <span
                  :aria-label="row.pinned ? `取消置顶 ${row.display}` : `置顶 ${row.display}`"
                  class="row-icon-btn pin-btn"
                  :class="{ 'is-pinned': row.pinned }"
                  :data-pinned="row.pinned ? 'true' : 'false'"
                  role="button"
                  tabindex="0"
                  :title="row.pinned ? '取消置顶' : '置顶'"
                  @click.stop="emit('toggle-pin', row.id)"
                  @keydown.enter.stop.prevent="emit('toggle-pin', row.id)"
                  @keydown.space.stop.prevent="emit('toggle-pin', row.id)"
                >
                  <AppIcon
                    :name="row.pinned ? 'pin-filled' : 'pin'"
                    :size="13"
                  />
                </span>
                <span
                  :aria-label="`在浏览器打开仓库 ${row.display}`"
                  class="row-icon-btn web-btn"
                  role="button"
                  tabindex="0"
                  title="在浏览器打开仓库"
                  @click.stop="emit('open-web', { id: row.id })"
                  @keydown.enter.stop.prevent="emit('open-web', { id: row.id })"
                >
                  <AppIcon
                    name="external-link"
                    :size="13"
                  />
                </span>
              </div>
            </button>
          </template>
        </div>

        <div
          v-else
          class="wb-list-empty"
        >
          <ListSkeleton
            v-if="loading"
            two-line
          />
          <div
            v-else-if="error"
            class="wb-list-empty"
          >
            <n-text type="error">
              {{ error }}
            </n-text>
            <n-button
              :disabled="!canUseContent"
              @click="emit('refresh')"
            >
              重试
            </n-button>
          </div>
          <EmptyState
            v-else
            :hint="totalCount ? '尝试缩短或更换搜索关键词' : '完成 CNB 登录后将自动拉取仓库'"
            :icon="totalCount ? 'search' : 'folder-git'"
            :title="totalCount ? '无匹配项目' : '暂无数据'"
          />
        </div>
      </div>
    </div>

    <div class="wb-col-footer">
      <span class="wb-col-footer-text wb-ellipsis">
        已选: <span class="wb-mono">{{ selectedProjectName || '(无)' }}</span>
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ListProjectsItem } from '../ipc/types'
import { splitRepoPath } from '../utils/branchMatch'
import { NButton, NText } from '../ui/naive'
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
import FilterInput, { type FilterInputExposed } from './FilterInput.vue'
import HighlightedText from './HighlightedText.vue'
import ListSkeleton from './ListSkeleton.vue'

export type RepoColumnExposed = {
  focusFilter: () => void
}

type RepoDisplayRow =
  | {
      type: 'repo'
      id: string
      display: string
      name: string
      namespace: string
      pinned: boolean
    }
  | { type: 'separator' }

const props = withDefaults(
  defineProps<{
    items: ListProjectsItem[]
    totalCount: number
    pinnedRepos: string[]
    selectedRepo: string
    selectedProjectName: string
    filter: string
    canUseContent: boolean
    loading: boolean
    error: string
    pinError: string
    kbdActiveKey: string
    stepState?: 'pending' | 'active' | 'done'
  }>(),
  {
    stepState: 'active',
  },
)

const emit = defineEmits<{
  (e: 'update:filter', v: string): void
  (e: 'refresh'): void
  (e: 'select', item: { id: string; display: string }, event: MouseEvent): void
  (e: 'toggle-pin', id: string): void
  (e: 'open-web', item: { id: string }): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const filterRef = ref<FilterInputExposed | null>(null)
const scrollStyle = { overflowY: 'auto' as const }

const pinnedSet = computed(() => new Set(props.pinnedRepos))

const displayRows = computed<RepoDisplayRow[]>(() => {
  const pinnedRows: RepoDisplayRow[] = []
  const normalRows: RepoDisplayRow[] = []

  for (const item of props.items) {
    const parts = splitRepoPath(item.display)
    const pinned = pinnedSet.value.has(item.id)
    const row: RepoDisplayRow = {
      type: 'repo',
      id: item.id,
      display: item.display,
      name: parts.name,
      namespace: parts.namespace,
      pinned,
    }
    if (pinned) pinnedRows.push(row)
    else normalRows.push(row)
  }

  if (pinnedRows.length && normalRows.length) {
    return [...pinnedRows, { type: 'separator' }, ...normalRows]
  }
  return [...pinnedRows, ...normalRows]
})

function focusFilter() {
  filterRef.value?.focus()
}

defineExpose<RepoColumnExposed>({ focusFilter })
</script>

<style scoped>
.col-error-bar {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: var(--wb-radius-sm);
  background-color: var(--wb-danger-soft);
  border: 1px solid var(--wb-danger-border);
}

.repo-row {
  padding: 6px 8px 6px 12px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.repo-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
  gap: 1px;
}

.repo-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--wb-text-1);
  line-height: 1.3;
}

.repo-row[data-selected='true'] .repo-name {
  color: var(--wb-accent-text);
  font-weight: 600;
}

.repo-ns {
  font-size: 11px;
  color: var(--wb-text-3);
  line-height: 1.25;
}

.repo-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.row-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 5px;
  color: var(--wb-text-3);
  opacity: 0;
  cursor: pointer;
  transition:
    opacity var(--wb-transition),
    background-color var(--wb-transition),
    color var(--wb-transition),
    transform 140ms var(--wb-ease-out);
}

.row-icon-btn:active {
  transform: scale(0.93);
}

.repo-row:hover .row-icon-btn,
.repo-row:focus-within .row-icon-btn,
.repo-row[data-selected='true'] .row-icon-btn {
  opacity: 0.72;
}

.row-icon-btn:hover,
.row-icon-btn:focus-visible {
  opacity: 1 !important;
  background-color: var(--wb-bg-subtle);
  color: var(--wb-text-1);
  outline: none;
}

.row-icon-btn:focus-visible {
  box-shadow: 0 0 0 1.5px var(--wb-accent-ring);
}

.pin-btn {
  transform-origin: center 70%;
  transition:
    opacity var(--wb-transition),
    background-color var(--wb-transition),
    color var(--wb-transition),
    transform 160ms var(--wb-ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .pin-btn:hover:not(.is-pinned) {
    transform: rotate(-12deg);
  }
}

.pin-btn:active {
  transform: rotate(-14deg) scale(0.92);
}

.pin-btn.is-pinned {
  opacity: 1 !important;
  color: var(--wb-warning);
}

.pin-btn.is-pinned:hover {
  background-color: var(--wb-warning-soft);
  color: var(--wb-warning);
}
</style>
