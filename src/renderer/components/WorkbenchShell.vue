<template>
  <div
    class="app-root workbench-page"
    :class="{ 'is-mac': isMac }"
  >
    <AppHeader
      v-model:auth-tab="authTab"
      v-model:is-auth-expanded="isAuthExpanded"
      :close-action="closeAction"
      :close-action-options="closeActionOptions"
      :current-version="currentVersion"
      :has-update="hasUpdate"
      :history="merge.history"
      :installing-update="installingUpdate"
      :is-mac="isMac"
      :is-windows="isWindows"
      :latest-version="latestVersion"
      :project-count="projects.items.length"
      :projects-loading="projects.loading"
      :theme-mode="themeMode"
      :update-checking="updateChecking"
      :update-download-error="updateDownloadError"
      :update-download-percent="updateDownloadPercent"
      :update-download-phase="updateDownloadPhase"
      :update-error="updateError"
      @apply-history="onApplyHistory"
      @check-update="runCheckUpdate"
      @cycle-theme="emit('cycle-theme')"
      @download-update="startUpdateDownload"
      @install-update="installNowUpdate"
      @open-release="openReleasePage"
      @update:close-action="onChangeCloseAction"
    />

    <div class="workbench-body">
      <main class="workbench-grid triple-row">
        <RepoColumn
          ref="repoColRef"
          v-model:filter="projects.filter"
          :can-use-content="canUseContent"
          :error="projects.error"
          :items="projects.sortedItems"
          :kbd-active-key="kbd.repo"
          :loading="projects.loading"
          :pin-error="projects.pinError"
          :pinned-repos="projects.pinnedRepos"
          :selected-project-name="projects.selectedProjectName"
          :selected-repo="projects.selectedRepo"
          :step-state="repoStepState"
          :total-count="projects.items.length"
          @keydown="onListKeydown('repo', $event)"
          @open-web="openRepoInBrowser"
          @refresh="projects.loadProjects()"
          @select="onClickProject"
          @toggle-pin="projects.togglePin($event)"
        />

        <SourceBranchColumn
          ref="sourceColRef"
          v-model:filter="sourceFilter"
          :branches="displaySourceBranches"
          :error="projects.sourceBranchesError"
          :kbd-active-key="kbd.source"
          :loading="projects.sourceBranchesLoading"
          :selected-branch="projects.selectedSourceBranch"
          :selected-repo="projects.selectedRepo"
          :step-state="sourceStepState"
          :total-count="projects.sourceBranches.length"
          @keydown="onListKeydown('source', $event)"
          @refresh="projects.loadAllBranches()"
          @select="onClickSourceBranch"
        />

        <TargetBranchColumn
          ref="targetColRef"
          v-model:filter="merge.targetFilter"
          :error="projects.targetBranchesError"
          :kbd-active-key="kbd.target"
          :loading="projects.targetBranchesLoading"
          :rows="displayTargetRows"
          :selected-repo="projects.selectedRepo"
          :selected-source-branch="projects.selectedSourceBranch"
          :selected-targets="merge.selectedTargets"
          :step-state="targetStepState"
          @clear="merge.clearTargets()"
          @click-row="onClickTargetRow"
          @keydown="onListKeydown('target', $event)"
          @refresh="projects.loadAllBranches()"
          @select-core="selectCoreTargets"
          @select-visible="selectVisibleTargets"
        />
      </main>

      <MergeDock
        :is-mac="isMac"
        :running="merge.running"
        :selected-project-name="projects.selectedProjectName"
        :selected-repo="projects.selectedRepo"
        :selected-source-branch="projects.selectedSourceBranch"
        :selected-targets="merge.selectedTargets"
        @clear-targets="merge.clearTargets()"
        @merge="onClickBatch"
        @remove-target="merge.toggleTarget($event)"
      />
    </div>

    <BatchMergeFlowDialog
      ref="batchMergeFlowDialogRef"
      @confirm-close="isConfirmOpen = false"
      @confirm-open="isConfirmOpen = true"
      @finish-close="isFinishOpen = false"
      @finish-open="isFinishOpen = true"
    />

    <n-modal
      :mask-closable="false"
      preset="dialog"
      :show="!!auth.expiredMessage"
    >
      <template #header>
        登录已过期
      </template>
      <n-space vertical>
        <n-text>{{ auth.expiredMessage }}</n-text>
        <n-text depth="3">
          是否立即重新登录？确认后将自动打开 CNB 登录窗口。
        </n-text>
      </n-space>
      <template #action>
        <n-space justify="end">
          <n-button
            :disabled="auth.loggingIn"
            @click="auth.dismissRelogin()"
          >
            暂不
          </n-button>
          <n-button
            :loading="auth.loggingIn"
            type="primary"
            @click="auth.confirmRelogin()"
          >
            重新登录
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useAuthStore } from '../store/auth'
import { useProjectsStore } from '../store/projects'
import { useMergeStore, type MergeHistoryEntry } from '../store/merge'
import type { ThemeMode } from '../ui/theme'
import { matchesBranch } from '../utils/branchMatch'
import {
  checkForUpdate,
  downloadUpdate,
  getAppVersion,
  getCloseAction,
  getPlatform,
  getUpdateDownload,
  getUpdateStatus,
  installUpdate,
  onAuthExpired,
  onBranchesSorted,
  onUpdateDownloadProgress,
  onUpdateStatus,
  openExternal,
  setCloseAction,
  type CloseAction,
  type UpdateDownloadState,
  type UpdateStatus,
} from '../ipc/bridge'
import { NButton, NModal, NSpace, NText } from '../ui/naive'
import AppHeader from './AppHeader.vue'
import RepoColumn, { type RepoColumnExposed } from './RepoColumn.vue'
import SourceBranchColumn, {
  type SourceBranchColumnExposed,
} from './SourceBranchColumn.vue'
import TargetBranchColumn, {
  type TargetBranchColumnExposed,
  type TargetRow,
} from './TargetBranchColumn.vue'
import MergeDock from './MergeDock.vue'
import BatchMergeFlowDialog, {
  type BatchMergeFlowDialogExposed,
} from './BatchMergeFlowDialog.vue'

defineProps<{
  themeMode: ThemeMode
}>()

const emit = defineEmits<{
  (e: 'cycle-theme'): void
}>()

const auth = useAuthStore()
const projects = useProjectsStore()
const merge = useMergeStore()

const canUseContent = computed(() => auth.connected)
const sourceFilter = ref('')

// ---------- 过滤输入框聚焦（Ctrl/Cmd+F 按当前焦点列智能聚焦，默认仓库列） ----------

const repoColRef = ref<RepoColumnExposed | null>(null)
const sourceColRef = ref<SourceBranchColumnExposed | null>(null)
const targetColRef = ref<TargetBranchColumnExposed | null>(null)
const isConfirmOpen = ref(false)
const isFinishOpen = ref(false)

function onKeyDownGlobal(e: KeyboardEvent) {
  if (!(e.ctrlKey || e.metaKey)) return
  const key = e.key.toLowerCase()
  if (key === 'f') {
    e.preventDefault()
    const colEl = (document.activeElement as HTMLElement | null)?.closest?.(
      '[data-col]',
    )
    const col = colEl?.getAttribute('data-col')
    if (col === 'source' && projects.selectedRepo) {
      sourceColRef.value?.focusFilter()
    } else if (col === 'target') {
      targetColRef.value?.focusFilter()
    } else {
      repoColRef.value?.focusFilter()
    }
    return
  }
  if (key === '1') {
    e.preventDefault()
    repoColRef.value?.focusFilter()
    return
  }
  if (key === '2' && projects.selectedRepo) {
    e.preventDefault()
    sourceColRef.value?.focusFilter()
    return
  }
  if (key === '3') {
    e.preventDefault()
    targetColRef.value?.focusFilter()
    return
  }
  if (e.key === 'Enter' && !isConfirmOpen.value && !isFinishOpen.value && !merge.running) {
    if (
      projects.selectedRepo &&
      projects.selectedSourceBranch &&
      merge.selectedTargets.length > 0
    ) {
      e.preventDefault()
      onClickBatch()
    }
  }
}

watch(
  () => projects.selectedRepo,
  () => {
    sourceFilter.value = ''
    merge.targetFilter = ''
    lastTargetKey.value = ''
  },
)

// 窗口标题跟随当前上下文，便于多窗口/任务栏识别
watch(
  [
    () => projects.selectedRepo,
    () => projects.selectedSourceBranch,
    () => merge.selectedTargets.length,
  ],
  ([repo, source, targetCount]) => {
    document.title = repo
      ? `${repo} · ${source || '未选源'} → ${targetCount} 个目标`
      : 'CNB 批量合并工具'
  },
  { immediate: true },
)

const displaySourceBranches = computed(() => {
  const list = projects.sourceBranches || []
  return list.filter((b) => matchesBranch(sourceFilter.value, b))
})

const coreTargetOrder = ['dev', 'test', 'gray'] as const
const coreTargetSet = new Set<string>(coreTargetOrder)

const displayTargetRows = computed<TargetRow[]>(() => {
  const list = merge.targets || []
  const q = (merge.targetFilter || '').trim()
  const visible = q ? list.filter((b) => matchesBranch(q, b)) : list.slice()

  if (q) {
    for (const b of merge.selectedTargets) {
      if (!visible.includes(b)) visible.unshift(b)
    }
  }

  const lowerToName = new Map<string, string>()
  for (const b of visible) {
    const k = b.toLowerCase()
    if (!lowerToName.has(k)) lowerToName.set(k, b)
  }

  const core: string[] = []
  for (const n of coreTargetOrder) {
    const v = lowerToName.get(n)
    if (v) core.push(v)
  }

  const others: string[] = []
  for (const [k, v] of lowerToName) {
    if (coreTargetSet.has(k)) continue
    others.push(v)
  }
  others.sort((a, b) => {
    const la = a.toLowerCase()
    const lb = b.toLowerCase()
    const r = la.localeCompare(lb)
    return r || a.localeCompare(b)
  })

  const rows: TargetRow[] = []
  rows.push(...core.map((name) => ({ type: 'branch' as const, name, isCore: true })))
  if (core.length && others.length) rows.push({ type: 'separator' })
  rows.push(...others.map((name) => ({ type: 'branch' as const, name, isCore: false })))
  return rows
})

const batchMergeFlowDialogRef = ref<BatchMergeFlowDialogExposed | null>(null)
const isAuthExpanded = ref(true)
const authTab = ref<'login' | 'token'>('login')

// ---------- 应用更新检查与下载安装 ----------
const currentVersion = ref('')
const latestVersion = ref('')
const hasUpdate = ref(false)
const updateChecking = ref(false)
const updateError = ref('')
const releaseUrl = ref('https://github.com/ZiPengWei/cnb-batch-tools/releases/latest')

function applyUpdateStatus(s: UpdateStatus | null | undefined) {
  if (!s) return
  updateChecking.value = !!s.checking
  if (s.current) currentVersion.value = s.current
  if (s.latest) latestVersion.value = s.latest
  hasUpdate.value = !!s.hasUpdate
  if (s.releaseUrl) releaseUrl.value = s.releaseUrl
  updateError.value = s.error || ''
}

async function runCheckUpdate() {
  if (updateChecking.value) return
  updateChecking.value = true
  try {
    applyUpdateStatus(await checkForUpdate())
  } catch {
    updateChecking.value = false
    updateError.value = '检查更新失败'
  }
}

function openReleasePage() {
  if (!releaseUrl.value) return
  void openExternal(releaseUrl.value)
}

const updateDownloadPhase = ref<'idle' | 'downloading' | 'downloaded' | 'error'>('idle')
const updateDownloadPercent = ref(0)
const updateDownloadError = ref('')
const installingUpdate = ref(false)

function applyUpdateDownload(s: UpdateDownloadState | null | undefined) {
  if (!s) return
  updateDownloadPhase.value = s.phase
  updateDownloadPercent.value = s.percent || 0
  if (s.error) updateDownloadError.value = s.error
}

async function startUpdateDownload() {
  if (updateDownloadPhase.value === 'downloading') return
  updateDownloadError.value = ''
  try {
    applyUpdateDownload(await downloadUpdate())
  } catch {
    updateDownloadPhase.value = 'error'
    updateDownloadError.value = '下载更新失败，请前往 Release 页手动下载'
  }
}

async function installNowUpdate() {
  if (installingUpdate.value) return
  installingUpdate.value = true
  try {
    const r = await installUpdate()
    if (r?.ok) return
    updateDownloadPhase.value = 'error'
    updateDownloadError.value = r?.message || '自动安装失败，请按提示手动完成更新'
  } catch {
    updateDownloadPhase.value = 'error'
    updateDownloadError.value = '安装更新失败，请前往 Release 页手动下载'
  } finally {
    installingUpdate.value = false
  }
}

let offUpdateStatus: (() => void) | null = null
let offAuthExpired: (() => void) | null = null
let offBranchesSorted: (() => void) | null = null
let offUpdateDownload: (() => void) | null = null

// ---------- 平台检测（macOS 一体化顶栏 / Windows 关闭行为） ----------
const platform = getPlatform()
const isWindows = platform === 'win32'
const isMac = platform === 'darwin'

const repoStepState = computed<'pending' | 'active' | 'done'>(() =>
  projects.selectedRepo ? 'done' : 'active',
)
const sourceStepState = computed<'pending' | 'active' | 'done'>(() => {
  if (projects.selectedSourceBranch) return 'done'
  return projects.selectedRepo ? 'active' : 'pending'
})
const targetStepState = computed<'pending' | 'active' | 'done'>(() => {
  if (merge.selectedTargets.length > 0) return 'done'
  return projects.selectedSourceBranch ? 'active' : 'pending'
})
const closeAction = ref<CloseAction>('ask')
const closeActionOptions: Array<{ label: string; value: CloseAction }> = [
  { label: '每次询问', value: 'ask' },
  { label: '最小化到系统托盘', value: 'tray' },
  { label: '直接退出', value: 'exit' },
]

async function onChangeCloseAction(v: CloseAction) {
  closeAction.value = v
  try {
    await setCloseAction(v)
  } catch {
    /* ignore */
  }
}

function scrollEventTargetIntoView(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  if (!el) return
  const fn = (el as any).scrollIntoView as undefined | ((options?: any) => void)
  if (typeof fn !== 'function') return
  fn.call(el, { block: 'nearest' })
}

function onClickProject(p: { id: string; display: string }, e: MouseEvent) {
  projects.selectProject({ id: p.id, display: p.display })
  scrollEventTargetIntoView(e)
}

function openRepoInBrowser(p: { id: string }) {
  void openExternal(`https://cnb.cool/${p.id}`)
}

function onClickSourceBranch(name: string, e: MouseEvent) {
  projects.chooseSourceBranch(name)
  scrollEventTargetIntoView(e)
}

const targetRowNames = computed(() =>
  displayTargetRows.value
    .filter(
      (row): row is { type: 'branch'; name: string; isCore: boolean } =>
        row.type === 'branch',
    )
    .filter((row) => row.name !== projects.selectedSourceBranch)
    .map((row) => row.name),
)

const lastTargetKey = ref('')

function onClickTargetRow(name: string, e: MouseEvent) {
  if (e.shiftKey && lastTargetKey.value) {
    const keys = targetRowNames.value
    const a = keys.indexOf(lastTargetKey.value)
    const b = keys.indexOf(name)
    if (a >= 0 && b >= 0) {
      const [s, t] = a <= b ? [a, b] : [b, a]
      merge.addSelectedTargets(keys.slice(s, t + 1))
      lastTargetKey.value = name
      scrollEventTargetIntoView(e)
      return
    }
  }
  merge.toggleTarget(name)
  lastTargetKey.value = name
  scrollEventTargetIntoView(e)
}

// ---------- 键盘流 ----------
type KbdList = 'repo' | 'source' | 'target'

const kbd = reactive<Record<KbdList, string>>({ repo: '', source: '', target: '' })

function kbdKeys(list: KbdList): string[] {
  if (list === 'repo') return projects.sortedItems.map((p) => String(p.id))
  if (list === 'source') return displaySourceBranches.value
  return targetRowNames.value
}

function moveKbd(list: KbdList, delta: number) {
  const keys = kbdKeys(list)
  if (!keys.length) return
  const idx = keys.indexOf(kbd[list])
  const next =
    idx < 0
      ? delta > 0
        ? 0
        : keys.length - 1
      : Math.min(keys.length - 1, Math.max(0, idx + delta))
  kbd[list] = keys[next]
}

function activateKbd(list: KbdList) {
  const key = kbd[list]
  if (!key) return
  if (list === 'repo') {
    const p = projects.sortedItems.find((i) => String(i.id) === key)
    if (p) projects.selectProject({ id: p.id, display: p.display })
    return
  }
  if (list === 'source') {
    projects.chooseSourceBranch(key)
    return
  }
  merge.toggleTarget(key)
}

function selectVisibleTargets() {
  merge.addSelectedTargets(targetRowNames.value)
}

function selectCoreTargets() {
  const cores = displayTargetRows.value
    .filter(
      (row): row is { type: 'branch'; name: string; isCore: boolean } =>
        row.type === 'branch' &&
        row.isCore &&
        row.name !== projects.selectedSourceBranch,
    )
    .map((row) => row.name)
  if (cores.length) merge.addSelectedTargets(cores)
}

async function onApplyHistory(entry: MergeHistoryEntry) {
  if (!entry?.repo) return
  if (projects.selectedRepo !== entry.repo) {
    const matched = projects.items.find((i) => i.id === entry.repo)
    await projects.selectProject({
      id: entry.repo,
      display: matched?.display || entry.repo,
    })
  }
  const primarySource = entry.source.split('、')[0]?.trim() || ''
  if (primarySource && projects.sourceBranches.includes(primarySource)) {
    projects.chooseSourceBranch(primarySource)
  }
  const available = new Set(merge.targets)
  const activeSource = projects.selectedSourceBranch
  const validTargets = entry.targets.filter(
    (t) => available.has(t) && t !== activeSource,
  )
  if (validTargets.length) {
    merge.setSelectedTargets(validTargets)
  }
}

function onListKeydown(list: KbdList, e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && list === 'target') {
    e.preventDefault()
    selectVisibleTargets()
    return
  }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    moveKbd(list, e.key === 'ArrowDown' ? 1 : -1)
    return
  }
  if (e.key === 'Enter') {
    if (list === 'target') return
    e.preventDefault()
    activateKbd(list)
    return
  }
  if (e.key === ' ') {
    e.preventDefault()
    if (list === 'target') activateKbd(list)
  }
}

watch(kbd, async () => {
  await nextTick()
  const labels: Record<KbdList, string> = {
    repo: '项目列表',
    source: '源分支列表',
    target: '目标分支列表',
  }
  for (const list of ['repo', 'source', 'target'] as KbdList[]) {
    const key = kbd[list]
    if (!key) continue
    try {
      const el = document.querySelector(
        `[aria-label="${labels[list]}"] [data-item-key="${CSS.escape(key)}"]`,
      )
      el?.scrollIntoView({ block: 'nearest' })
    } catch {
      /* ignore */
    }
  }
})

watch(
  () => auth.connected,
  (val) => {
    isAuthExpanded.value = !val
    if (val && auth.mode === 'token') authTab.value = 'token'
  },
  { immediate: true },
)

watch(
  () => auth.error,
  (val) => {
    if (val) isAuthExpanded.value = true
  },
)

let pinErrorTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => projects.pinError,
  (val) => {
    if (pinErrorTimer) clearTimeout(pinErrorTimer)
    pinErrorTimer = null
    if (val) {
      pinErrorTimer = setTimeout(() => {
        projects.clearPinError()
        pinErrorTimer = null
      }, 6000)
    }
  },
)

function onClickBatch() {
  if (!projects.selectedRepo) return
  if (!projects.selectedSourceBranch) return
  if (!merge.selectedTargets.length) return
  batchMergeFlowDialogRef.value?.openConfirm()
}

watch(
  () => projects.targetBranches,
  (b) => {
    merge.setTargets(b)
  },
  { deep: true },
)

onMounted(async () => {
  auth.loadLocal()

  if (isWindows) {
    try {
      closeAction.value = await getCloseAction()
    } catch {
      /* ignore */
    }
  }

  try {
    currentVersion.value = await getAppVersion()
  } catch {
    /* ignore */
  }
  offUpdateStatus = onUpdateStatus(applyUpdateStatus)
  try {
    applyUpdateStatus(await getUpdateStatus())
  } catch {
    /* ignore */
  }

  offUpdateDownload = onUpdateDownloadProgress(applyUpdateDownload)
  try {
    applyUpdateDownload(await getUpdateDownload())
  } catch {
    /* ignore */
  }

  offAuthExpired = onAuthExpired((info) => {
    auth.promptRelogin(info?.message)
  })

  offBranchesSorted = onBranchesSorted((payload) => {
    projects.applySortedBranches(payload?.repo || '', payload?.branches || [])
  })

  window.addEventListener('keydown', onKeyDownGlobal)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDownGlobal)
  offUpdateStatus?.()
  offUpdateStatus = null
  offAuthExpired?.()
  offAuthExpired = null
  offBranchesSorted?.()
  offBranchesSorted = null
  offUpdateDownload?.()
  offUpdateDownload = null
  if (pinErrorTimer) {
    clearTimeout(pinErrorTimer)
    pinErrorTimer = null
  }
})
</script>

<style scoped>
.workbench-page {
  width: min(1600px, 100vw);
  height: 100vh;
  margin: 0 auto;
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background-color: var(--wb-bg-canvas);
}

.workbench-page.is-mac {
  width: 100vw;
  padding: 0;
  gap: 0;
}

.workbench-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1 1 auto;
  min-height: 0;
}

.workbench-page.is-mac .workbench-body {
  width: min(1600px, 100%);
  margin: 0 auto;
  padding: 10px 16px 14px;
}

/* 一体化无缝三栏工作台：外框圆角 + 内部 1px 发丝分割线，无双重套盒 */
.workbench-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1.1fr);
  gap: 1px;
  flex: 1 1 auto;
  min-height: 0;
  border-radius: var(--wb-radius-lg);
  border: 1px solid var(--wb-border);
  background-color: var(--wb-border);
  box-shadow: var(--wb-shadow-shell);
  overflow: hidden;
}

@media (max-width: 960px) {
  .workbench-grid {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }

  .workbench-grid > :deep(*) {
    min-height: 300px;
  }
}
</style>
