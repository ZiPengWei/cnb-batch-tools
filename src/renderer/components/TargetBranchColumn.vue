<template>
  <section
    class="wb-col"
    data-col="target"
  >
    <div class="wb-col-header">
      <div class="wb-col-heading">
        <span
          class="wb-col-step wb-mono"
          :class="`is-${stepState}`"
        >3.</span>{{ ' ' }}<span class="wb-col-title">选择目标分支</span>
        <span
          v-if="selectedTargets.length"
          class="wb-col-count is-active wb-mono"
        >
          {{ selectedTargets.length }}
        </span>
      </div>
      <div class="col-header-actions">
        <button
          v-if="hasSelectableCore"
          class="wb-col-action-btn is-env"
          :disabled="allCoreSelected"
          title="一键勾选所有可选核心环境分支（dev / test / gray）"
          type="button"
          @click="emit('select-core')"
        >
          <AppIcon
            name="star"
            :size="11"
          />
          <span>核心环境</span>
        </button>
        <button
          class="wb-col-action-btn"
          :disabled="!hasVisibleBranch"
          type="button"
          @click="emit('select-visible')"
        >
          全选当前
        </button>
        <button
          class="wb-col-action-btn is-muted"
          :disabled="!selectedTargets.length"
          type="button"
          @click="emit('clear')"
        >
          清空
        </button>
      </div>
    </div>

    <div class="wb-col-search">
      <div class="target-search-row">
        <div class="target-search-input">
          <FilterInput
            ref="filterRef"
            :model-value="filter"
            placeholder="过滤目标分支..."
            @update:model-value="emit('update:filter', $event)"
          />
        </div>
        <div
          v-if="selectedTargets.length"
          class="target-view-tabs"
        >
          <span
            aria-hidden="true"
            class="view-tab-thumb"
            :class="{ 'is-right': onlySelected }"
          />
          <button
            class="view-tab"
            :class="{ active: !onlySelected }"
            type="button"
            @click="onlySelected = false"
          >
            全部
          </button>
          <button
            class="view-tab"
            :class="{ active: onlySelected }"
            type="button"
            @click="onlySelected = true"
          >
            已选 <span class="wb-mono">{{ selectedTargets.length }}</span>
          </button>
        </div>
      </div>
    </div>

    <div
      aria-label="目标分支列表"
      class="wb-list-scroll"
      :style="scrollStyle"
      tabindex="0"
      @keydown="emit('keydown', $event)"
    >
      <div class="wb-list-inner">
        <div
          v-if="visibleRows.length"
          class="wb-list-stack"
        >
          <template
            v-for="(row, idx) in visibleRows"
            :key="row.type === 'separator' ? `sep-${idx}` : row.name"
          >
            <div
              v-if="row.type === 'separator'"
              class="wb-col-sep"
            >
              <span class="wb-col-sep-line" />
              <span class="wb-col-sep-label">其他分支</span>
              <span class="wb-col-sep-line" />
            </div>
            <button
              v-else
              :aria-pressed="selectedSet.has(row.name)"
              class="wb-row target-row"
              :class="{ 'gl-kbd-active': kbdActiveKey === row.name }"
              :data-item-key="row.name"
              :data-selected="selectedSet.has(row.name) ? 'true' : 'false'"
              :disabled="row.name === selectedSourceBranch"
              :title="row.name === selectedSourceBranch ? '与源分支相同，无需合并' : row.name"
              type="button"
              @click="emit('click-row', row.name, $event)"
            >
              <span
                class="target-checkbox"
                :class="{
                  'is-checked': selectedSet.has(row.name),
                  'is-disabled': row.name === selectedSourceBranch,
                }"
              >
                <AppIcon
                  v-if="selectedSet.has(row.name)"
                  name="check"
                  :size="11"
                  :stroke-width="2.6"
                />
              </span>

              <span
                v-if="!row.isCore && row.tone !== 'default'"
                class="tone-dot"
                :class="`dot-${row.tone}`"
              />

              <span class="target-name wb-mono wb-ellipsis">
                <HighlightedText
                  :query="filter"
                  :text="row.name"
                />
              </span>

              <span
                v-if="row.name === selectedSourceBranch"
                class="target-badge badge-source"
              >
                源分支
              </span>
              <span
                v-else-if="row.isCore"
                class="target-badge badge-env"
                title="核心环境分支"
              >
                <AppIcon
                  name="star"
                  :size="10"
                />
                <span>ENV</span>
              </span>
            </button>
          </template>
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
            :hint="!selectedRepo ? '选择仓库后可多选目标分支' : ''"
            :icon="filter.trim() ? 'search' : 'git-merge'"
            title="暂无数据"
          />
        </div>
      </div>
    </div>

    <div class="wb-col-footer">
      <span class="wb-col-footer-text wb-tabular">
        已选: {{ selectedTargets.length }} 个
      </span>
      <span class="wb-col-footer-hint wb-mono">⇧ 连选 · Space</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getBranchTone, type BranchTone } from '../utils/branchMatch'
import { NButton, NText } from '../ui/naive'
import AppIcon from './AppIcon.vue'
import EmptyState from './EmptyState.vue'
import FilterInput, { type FilterInputExposed } from './FilterInput.vue'
import HighlightedText from './HighlightedText.vue'
import ListSkeleton from './ListSkeleton.vue'

export type TargetRow =
  | { type: 'branch'; name: string; isCore: boolean }
  | { type: 'separator' }

type EnrichedTargetRow =
  | { type: 'branch'; name: string; isCore: boolean; tone: BranchTone }
  | { type: 'separator' }

export type TargetBranchColumnExposed = {
  focusFilter: () => void
}

const props = withDefaults(
  defineProps<{
    rows: TargetRow[]
    selectedRepo: string
    selectedSourceBranch: string
    selectedTargets: string[]
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
  (e: 'select-core'): void
  (e: 'select-visible'): void
  (e: 'clear'): void
  (e: 'refresh'): void
  (e: 'click-row', name: string, event: MouseEvent): void
  (e: 'keydown', event: KeyboardEvent): void
}>()

const filterRef = ref<FilterInputExposed | null>(null)
const onlySelected = ref(false)
const scrollStyle = { overflowY: 'auto' as const }

const selectedSet = computed(() => new Set(props.selectedTargets))

watch(
  () => props.selectedTargets.length,
  (len) => {
    if (len === 0) onlySelected.value = false
  },
)

watch(
  () => props.selectedRepo,
  () => {
    onlySelected.value = false
  },
)

const selectableCoreNames = computed(() =>
  props.rows
    .filter(
      (row): row is { type: 'branch'; name: string; isCore: boolean } =>
        row.type === 'branch' &&
        row.isCore &&
        row.name !== props.selectedSourceBranch,
    )
    .map((row) => row.name),
)

const hasSelectableCore = computed(() => selectableCoreNames.value.length > 0)
const allCoreSelected = computed(
  () =>
    selectableCoreNames.value.length > 0 &&
    selectableCoreNames.value.every((n) => selectedSet.value.has(n)),
)

const visibleRows = computed<EnrichedTargetRow[]>(() => {
  const base = onlySelected.value
    ? props.rows.filter(
        (row) => row.type === 'branch' && selectedSet.value.has(row.name),
      )
    : props.rows

  return base.map((row) =>
    row.type === 'separator'
      ? row
      : { ...row, tone: getBranchTone(row.name) },
  )
})

const hasVisibleBranch = computed(() =>
  visibleRows.value.some((row) => row.type === 'branch'),
)

function focusFilter() {
  filterRef.value?.focus()
}

defineExpose<TargetBranchColumnExposed>({ focusFilter })
</script>

<style scoped>
.col-header-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: 0 0 auto;
}

.target-search-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.target-search-input {
  flex: 1 1 auto;
  min-width: 0;
}

.target-view-tabs {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: center;
  height: 32px;
  padding: 3px;
  border-radius: 7px;
  background-color: var(--wb-bg-sunken);
  border: 1px solid var(--wb-border);
  flex: 0 0 auto;
}

.view-tab-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  bottom: 3px;
  width: calc(50% - 3px);
  border-radius: 5px;
  background-color: var(--wb-accent-soft);
  border: 1px solid var(--wb-accent-border);
  transform: translateX(0);
  transition: transform 180ms var(--wb-ease-in-out);
  pointer-events: none;
}

.view-tab-thumb.is-right {
  transform: translateX(100%);
}

.view-tab {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--wb-text-2);
  font-family: inherit;
  font-size: 11.5px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    color 180ms var(--wb-ease-in-out),
    transform 120ms var(--wb-ease-out);
}

.view-tab:active {
  transform: scale(0.97);
}

.view-tab:hover {
  color: var(--wb-text-1);
}

.view-tab.active {
  color: var(--wb-accent-text);
  font-weight: 600;
}

.target-row {
  justify-content: flex-start;
  gap: 8px;
}

.target-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid var(--wb-border-strong);
  background-color: transparent;
  color: #ffffff;
  flex: 0 0 auto;
  transition:
    background-color var(--wb-transition),
    border-color var(--wb-transition);
}

.target-checkbox.is-checked {
  border-color: var(--wb-accent);
  background-color: var(--wb-accent);
  color: #04121c;
}

:root:not([data-theme='dark']) .target-checkbox.is-checked {
  color: #ffffff;
}

.target-checkbox.is-disabled {
  border-style: dashed;
  opacity: 0.5;
}

.tone-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex: 0 0 auto;
  opacity: 0.85;
}

.dot-main {
  background-color: var(--wb-success);
}

.dot-feat {
  background-color: var(--wb-accent);
}

.dot-fix {
  background-color: var(--wb-danger);
}

.dot-release {
  background-color: var(--wb-purple);
}

.dot-env {
  background-color: var(--wb-warning);
}

.target-name {
  flex: 1 1 auto;
  font-size: 12.5px;
}

.target-row[data-selected='true'] .target-name {
  color: var(--wb-accent-text);
  font-weight: 600;
}

.target-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  flex: 0 0 auto;
}

.badge-env {
  color: var(--wb-warning);
  background-color: var(--wb-warning-soft);
  border: 1px solid var(--wb-warning-border);
}

.badge-source {
  color: var(--wb-text-3);
  background-color: var(--wb-bg-subtle);
  border: 1px solid var(--wb-border);
}
</style>
