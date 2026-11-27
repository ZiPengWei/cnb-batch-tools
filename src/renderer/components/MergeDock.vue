<template>
  <footer
    class="merge-dock action-bar"
    :class="{ 'is-ready': ready }"
  >
    <div class="dock-flow">
      <div
        class="dock-repo"
        :class="{ 'is-empty': !selectedProjectName }"
        :title="selectedProjectName || '请选择仓库'"
      >
        <AppIcon
          name="folder-git"
          :size="14"
        />
        <span class="dock-repo-name wb-mono wb-ellipsis">
          {{ selectedProjectName || '请选择仓库' }}
        </span>
      </div>

      <span class="dock-divider" />

      <div class="dock-pipeline">
        <span
          class="branch-chip chip-source wb-mono"
          :class="{ 'is-empty': !selectedSourceBranch }"
          :title="selectedSourceBranch || '未选择源分支'"
        >
          <AppIcon
            name="git-branch"
            :size="12"
          />
          <span class="wb-ellipsis">
            {{ selectedSourceBranch || '未选择源分支' }}
          </span>
        </span>

        <span
          class="flow-arrow"
          :class="{ 'is-active': ready }"
        >
          <AppIcon
            name="arrow-right"
            :size="14"
          />
        </span>

        <TransitionGroup
          v-if="selectedTargets.length"
          class="target-chips"
          name="dock-chip"
          tag="div"
          :title="selectedTargets.join('、')"
        >
          <span
            v-for="t in previewTargets"
            :key="t"
            class="branch-chip chip-target wb-mono"
          >
            <span class="chip-target-text">{{ t }}</span>
            <span
              :aria-label="`移除目标分支 ${t}`"
              class="chip-remove-btn"
              role="button"
              tabindex="0"
              :title="`移除 ${t}`"
              @click.stop="emit('remove-target', t)"
              @keydown.enter.stop.prevent="emit('remove-target', t)"
              @keydown.space.stop.prevent="emit('remove-target', t)"
            >
              <AppIcon
                name="x"
                :size="10"
                :stroke-width="2.3"
              />
            </span>
          </span>
          <n-popover
            v-if="overflowCount > 0"
            key="__overflow__"
            placement="top-end"
            trigger="click"
          >
            <template #trigger>
              <button
                aria-label="查看全部已选目标分支"
                class="branch-chip chip-overflow wb-mono"
                title="点击查看或管理全部已选目标分支"
                type="button"
              >
                +{{ overflowCount }}
              </button>
            </template>
            <div class="overflow-popover">
              <div class="overflow-pop-head">
                <span class="overflow-pop-title">
                  已选目标分支 (<span class="wb-mono">{{ selectedTargets.length }}</span>)
                </span>
                <button
                  class="overflow-clear-btn"
                  type="button"
                  @click="emit('clear-targets')"
                >
                  清空全部
                </button>
              </div>
              <div class="overflow-chip-list">
                <span
                  v-for="t in selectedTargets"
                  :key="t"
                  class="branch-chip chip-target wb-mono"
                >
                  <span
                    class="chip-target-text"
                    :title="t"
                  >{{ t }}</span>
                  <span
                    :aria-label="`移除目标分支 ${t}`"
                    class="chip-remove-btn"
                    role="button"
                    tabindex="0"
                    :title="`移除 ${t}`"
                    @click.stop="emit('remove-target', t)"
                    @keydown.enter.stop.prevent="emit('remove-target', t)"
                    @keydown.space.stop.prevent="emit('remove-target', t)"
                  >
                    <AppIcon
                      name="x"
                      :size="10"
                      :stroke-width="2.3"
                    />
                  </span>
                </span>
              </div>
            </div>
          </n-popover>
        </TransitionGroup>
        <span
          v-else
          class="branch-chip chip-empty"
        >
          未选择目标分支
        </span>
      </div>
    </div>

    <div class="dock-cta">
      <span
        v-if="selectedTargets.length"
        class="dock-count wb-tabular"
      >
        共 {{ selectedTargets.length }} 个目标
      </span>
      <div
        class="cta-btn-wrap"
        :class="{ 'is-glow': ready && !running }"
        :title="ready ? `发起批量合并 (${mergeShortcutLabel})` : ''"
      >
        <n-button
          :disabled="running || !ready"
          :loading="running"
          type="primary"
          @click="emit('merge')"
        >
          <template #icon>
            <AppIcon
              name="git-merge"
              :size="14"
            />
          </template>
          {{ running ? '处理中...' : mergeButtonText }}
        </n-button>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NPopover } from '../ui/naive'
import AppIcon from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    selectedRepo: string
    selectedProjectName: string
    selectedSourceBranch: string
    selectedTargets: string[]
    running: boolean
    isMac?: boolean
  }>(),
  {
    isMac: false,
  },
)

const emit = defineEmits<{
  (e: 'merge'): void
  (e: 'remove-target', name: string): void
  (e: 'clear-targets'): void
}>()

const mergeShortcutLabel = computed(() =>
  props.isMac ? '⌘Enter' : 'Ctrl+Enter',
)

const ready = computed(
  () =>
    Boolean(props.selectedRepo) &&
    Boolean(props.selectedSourceBranch) &&
    props.selectedTargets.length > 0,
)

const previewTargets = computed(() => props.selectedTargets.slice(0, 3))
const overflowCount = computed(() => Math.max(0, props.selectedTargets.length - 3))

const mergeButtonText = computed(() => {
  const sc = props.selectedSourceBranch ? 1 : 0
  const tc = props.selectedTargets.length
  if (sc > 0 && tc > 0) return `合并 (${tc})`
  return '合并'
})
</script>

<style scoped>
.merge-dock {
  position: relative;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 14px;
  border-radius: var(--wb-radius-lg);
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-elevated);
  box-shadow: var(--wb-shadow-dock);
  overflow: hidden;
  transition: border-color var(--wb-transition);
}

.merge-dock::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 10%,
    var(--wb-accent-border) 50%,
    transparent 90%
  );
  opacity: 0;
  transition: opacity var(--wb-transition);
  pointer-events: none;
}

.merge-dock.is-ready {
  border-color: var(--wb-accent-border);
}

.merge-dock.is-ready::before {
  opacity: 1;
}

.dock-flow {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
}

.dock-repo {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 240px;
  color: var(--wb-text-1);
  font-size: 12.5px;
  font-weight: 600;
}

.dock-repo.is-empty {
  color: var(--wb-text-3);
  font-weight: 400;
}

.dock-repo-name {
  min-width: 0;
}

.dock-divider {
  width: 1px;
  height: 16px;
  background-color: var(--wb-border);
  flex: 0 0 auto;
}

.dock-pipeline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
  flex-wrap: wrap;
}

.branch-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 210px;
  height: 24px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
}

.chip-source {
  min-width: 0;
  background-color: var(--wb-bg-subtle);
  border: 1px solid var(--wb-border);
  color: var(--wb-text-1);
  font-weight: 500;
}

.chip-source.is-empty {
  border-style: dashed;
  color: var(--wb-text-3);
  font-weight: 400;
}

.flow-arrow {
  display: inline-flex;
  align-items: center;
  color: var(--wb-text-3);
  transition:
    color 160ms var(--wb-ease-out),
    transform 180ms var(--wb-ease-out);
}

.flow-arrow.is-active {
  color: var(--wb-accent);
  transform: translateX(2px);
}

.target-chips {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
}

.dock-chip-enter-active {
  transition:
    opacity 160ms var(--wb-ease-out),
    transform 160ms var(--wb-ease-out);
}

.dock-chip-leave-active {
  position: absolute;
  pointer-events: none;
  transition:
    opacity 110ms var(--wb-ease-out),
    transform 110ms var(--wb-ease-out);
}

.dock-chip-enter-from {
  opacity: 0;
  transform: translateY(3px) scale(0.94);
}

.dock-chip-leave-to {
  opacity: 0;
  transform: scale(0.92);
}

.dock-chip-move {
  transition: transform 170ms var(--wb-ease-out);
}

.chip-target {
  padding: 0 5px 0 8px;
  background-color: var(--wb-accent-soft);
  border: 1px solid var(--wb-accent-border);
  color: var(--wb-accent-text);
  font-weight: 500;
}

.chip-target-text {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chip-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  border-radius: 4px;
  opacity: 0.52;
  cursor: pointer;
  transition:
    opacity var(--wb-transition),
    background-color var(--wb-transition),
    transform 120ms var(--wb-ease-out);
}

.chip-remove-btn:active {
  transform: scale(0.9);
}

.chip-target:hover .chip-remove-btn {
  opacity: 0.85;
}

.chip-remove-btn:hover,
.chip-remove-btn:focus-visible {
  opacity: 1 !important;
  background-color: var(--wb-accent-active);
  outline: none;
}

.chip-overflow {
  background-color: var(--wb-bg-subtle);
  border: 1px solid var(--wb-border);
  color: var(--wb-text-2);
  font-weight: 600;
  cursor: pointer;
  transition:
    border-color var(--wb-transition),
    background-color var(--wb-transition),
    color var(--wb-transition),
    transform 140ms var(--wb-ease-out);
}

.chip-overflow:hover {
  border-color: var(--wb-accent-border);
  background-color: var(--wb-accent-soft);
  color: var(--wb-accent-text);
}

.chip-overflow:active {
  transform: scale(0.96);
}

.overflow-popover {
  width: 320px;
}

.overflow-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--wb-divider);
}

.overflow-pop-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wb-text-1);
}

.overflow-clear-btn {
  border: none;
  background: transparent;
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--wb-text-3);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition:
    color var(--wb-transition),
    background-color var(--wb-transition);
}

.overflow-clear-btn:hover {
  color: var(--wb-danger);
  background-color: var(--wb-danger-soft);
}

.overflow-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 200px;
  overflow-y: auto;
}

.chip-empty {
  border: 1px dashed var(--wb-border);
  color: var(--wb-text-3);
  background: transparent;
}

.dock-cta {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
}

.dock-count {
  font-size: 12px;
  color: var(--wb-text-3);
  white-space: nowrap;
}

.cta-btn-wrap {
  border-radius: 8px;
  transition: box-shadow var(--wb-transition);
}

.cta-btn-wrap.is-glow {
  box-shadow: 0 0 18px var(--wb-accent-soft);
}

@media (hover: hover) and (pointer: fine) {
  .cta-btn-wrap.is-glow:hover {
    box-shadow: 0 2px 22px var(--wb-accent-soft);
  }
}

@media (max-width: 960px) {
  .merge-dock {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .dock-cta {
    justify-content: flex-end;
  }
}
</style>
