<template>
  <header
    class="app-header-shell"
    :class="{ 'is-mac': isMac }"
  >
    <div class="header-bar">
      <div class="header-brand">
        <div class="brand-logo-wrap">
          <img
            alt="CNB Tools"
            class="brand-logo"
            src="/icon.png"
          >
        </div>
        <div class="brand-meta">
          <span class="brand-name">CNB Merge</span>
          <n-popover
            placement="bottom-start"
            trigger="click"
          >
            <template #trigger>
              <n-badge
                dot
                :show="hasUpdate"
              >
                <button
                  class="version-pill wb-mono no-drag"
                  :class="{ 'has-update': hasUpdate }"
                  type="button"
                >
                  v{{ currentVersion || '?' }}
                </button>
              </n-badge>
            </template>
            <div class="update-popover">
              <n-space vertical>
                <div class="update-pop-head">
                  <span class="update-pop-title">应用版本</span>
                  <span class="update-pop-ver wb-mono">v{{ currentVersion || '?' }}</span>
                </div>
                <n-space
                  v-if="updateChecking"
                  align="center"
                >
                  <n-spin />
                  <n-text depth="3">
                    正在检查更新...
                  </n-text>
                </n-space>
                <template v-else-if="hasUpdate">
                  <div class="update-new-banner">
                    <n-text type="warning">
                      发现新版本 v{{ latestVersion }}
                    </n-text>
                  </div>
                  <template v-if="updateDownloadPhase === 'downloading'">
                    <n-progress
                      :border-radius="6"
                      :height="12"
                      indicator-placement="inside"
                      :percentage="updateDownloadPercent"
                      processing
                      type="line"
                    />
                    <n-text depth="3">
                      正在下载更新… {{ updateDownloadPercent }}%
                    </n-text>
                  </template>
                  <template v-else-if="updateDownloadPhase === 'downloaded'">
                    <n-button
                      block
                      :loading="installingUpdate"
                      type="success"
                      @click="emit('install-update')"
                    >
                      重启并安装
                    </n-button>
                    <n-text depth="3">
                      已就绪，点击后自动替换并重启
                    </n-text>
                  </template>
                  <n-button
                    v-else
                    block
                    type="primary"
                    @click="emit('download-update')"
                  >
                    下载并自动安装
                  </n-button>
                  <n-text
                    v-if="updateDownloadPhase === 'error'"
                    type="error"
                  >
                    {{ updateDownloadError }}
                  </n-text>
                  <n-button
                    text
                    type="primary"
                    @click="emit('open-release')"
                  >
                    前往 Release 页下载
                  </n-button>
                </template>
                <template v-else-if="updateError">
                  <n-text depth="3">
                    {{ updateError }}
                  </n-text>
                  <n-button
                    secondary
                    @click="emit('check-update')"
                  >
                    重试
                  </n-button>
                </template>
                <n-text
                  v-else
                  depth="3"
                >
                  已是最新版本
                </n-text>
                <n-button
                  :disabled="updateChecking"
                  text
                  @click="emit('check-update')"
                >
                  检查更新
                </n-button>
              </n-space>
            </div>
          </n-popover>
        </div>
      </div>

      <div class="header-actions no-drag">
        <div
          v-if="isWindows"
          class="win-close-pref"
        >
          <span class="win-close-label">关闭窗口时</span>
          <div class="win-close-select">
            <n-select
              :options="closeActionOptions"
              :value="closeAction"
              @update:value="emit('update:closeAction', $event)"
            />
          </div>
        </div>

        <n-popover
          v-model:show="historyOpen"
          placement="bottom-end"
          trigger="click"
        >
          <template #trigger>
            <button
              aria-label="最近合并历史"
              class="header-icon-btn"
              title="最近合并历史"
              type="button"
            >
              <AppIcon
                name="history"
                :size="15"
              />
              <span
                v-if="history.length"
                class="history-count-dot"
              />
            </button>
          </template>
          <div class="history-popover">
            <div class="history-pop-head">
              <span class="history-pop-title">最近合并记录</span>
              <span class="history-pop-badge wb-mono">{{ history.length }} 条</span>
            </div>
            <div
              v-if="recentHistory.length"
              class="history-timeline"
            >
              <button
                v-for="item in recentHistory"
                :key="item.ts"
                class="timeline-item"
                title="点击一键回填此次仓库、源分支与目标分支"
                type="button"
                @click="onSelectHistory(item)"
              >
                <span
                  class="timeline-dot"
                  :class="item.ok ? 'is-ok' : item.failures ? 'is-err' : 'is-warn'"
                />
                <div class="timeline-content">
                  <div class="timeline-top">
                    <span
                      class="timeline-repo wb-mono wb-ellipsis"
                      :title="item.repo"
                    >{{ item.repo }}</span>
                    <span class="timeline-time">
                      {{ formatRelativeTime(item.ts) }}
                    </span>
                  </div>
                  <div class="timeline-branch wb-mono wb-ellipsis">
                    {{ item.source }} → {{ item.targets.join('、') }}
                  </div>
                  <div class="timeline-bottom">
                    <div class="timeline-stats wb-mono">
                      <span class="t-stat is-ok">成功 {{ item.merged }}</span>
                      <span
                        v-if="item.conflicts"
                        class="t-stat is-warn"
                      >冲突 {{ item.conflicts }}</span>
                      <span
                        v-if="item.failures"
                        class="t-stat is-err"
                      >失败 {{ item.failures }}</span>
                      <span
                        v-if="item.noop"
                        class="t-stat is-muted"
                      >无变更 {{ item.noop }}</span>
                    </div>
                    <span class="timeline-apply-hint">填入</span>
                  </div>
                </div>
              </button>
            </div>
            <div
              v-else
              class="history-empty"
            >
              <AppIcon
                name="history"
                :size="18"
              />
              <span>暂无合并记录</span>
            </div>
          </div>
        </n-popover>

        <button
          :aria-label="themeTooltip"
          class="header-icon-btn"
          :title="themeTooltip"
          type="button"
          @click="emit('cycle-theme')"
        >
          <Transition
            mode="out-in"
            name="wb-icon-swap"
          >
            <AppIcon
              :key="themeIcon"
              :name="themeIcon"
              :size="15"
            />
          </Transition>
        </button>

        <button
          :aria-expanded="isAuthExpanded"
          class="account-pill"
          :class="{ 'is-connected': auth.connected, 'is-open': isAuthExpanded }"
          type="button"
          @click="emit('update:isAuthExpanded', !isAuthExpanded)"
        >
          <span
            class="status-dot"
            :class="auth.connected ? 'is-online' : 'is-offline'"
          />
          <span class="account-pill-label">
            <template v-if="auth.connected">
              {{ auth.userName || '已连接' }}
            </template>
            <template v-else>
              未连接
            </template>
          </span>
          <span
            v-if="auth.connected && projectCount > 0"
            class="account-pill-count wb-mono"
          >
            {{ projectCount }}
          </span>
          <span class="account-pill-sep" />
          <span class="account-pill-toggle">
            {{ isAuthExpanded ? '收起' : '配置' }}
          </span>
          <AppIcon
            class="account-chevron"
            :class="{ rotated: isAuthExpanded }"
            name="chevron-down"
            :size="13"
          />
        </button>
      </div>
    </div>

    <n-collapse-transition :show="isAuthExpanded">
      <div
        v-if="isAuthExpanded"
        class="auth-drawer no-drag"
      >
        <div class="auth-drawer-top">
          <div class="auth-drawer-title">
            <AppIcon
              name="key"
              :size="14"
            />
            <span>CNB 认证</span>
            <span
              v-if="auth.connected"
              class="auth-endpoint wb-mono"
            >
              {{ auth.baseUrl || 'https://cnb.cool' }}
            </span>
          </div>
          <div class="auth-drawer-tabs">
            <n-radio-group
              :value="authTab"
              @update:value="emit('update:authTab', $event)"
            >
              <n-radio-button value="login">
                网页登录
              </n-radio-button>
              <n-radio-button value="token">
                访问令牌
              </n-radio-button>
            </n-radio-group>
          </div>
        </div>

        <div class="auth-drawer-body">
          <template v-if="authTab === 'token'">
            <div class="token-grid">
              <label class="field-group">
                <span class="field-label">CNB API 地址</span>
                <n-input
                  v-model:value="auth.baseUrl"
                  placeholder="https://api.cnb.cool"
                />
              </label>
              <label class="field-group">
                <span class="field-label">访问令牌 (Access Token)</span>
                <n-input
                  v-model:value="auth.token"
                  placeholder="在 cnb.cool 个人设置中创建访问令牌"
                  show-password-on="click"
                  type="password"
                />
              </label>
            </div>
            <div class="auth-action-row">
              <div class="auth-action-left">
                <n-button
                  :disabled="auth.loggingIn || auth.busy"
                  :loading="auth.busy"
                  type="primary"
                  @click="auth.connect()"
                >
                  {{ auth.busy ? '验证中...' : '使用令牌连接' }}
                </n-button>
                <n-checkbox v-model:checked="auth.rememberToken">
                  记住令牌（仅本机保存，网页登录不受此项影响）
                </n-checkbox>
              </div>
              <n-button
                v-if="auth.connected"
                :disabled="auth.loggingIn || auth.busy"
                quaternary
                type="error"
                @click="auth.logout()"
              >
                退出登录
              </n-button>
            </div>
          </template>

          <template v-else>
            <div class="auth-action-row">
              <div class="auth-action-left">
                <n-button
                  :disabled="auth.loggingIn || auth.busy"
                  :loading="auth.loggingIn"
                  type="primary"
                  @click="auth.connected ? auth.switchAccount() : auth.loginViaWeb()"
                >
                  {{
                    auth.loggingIn
                      ? '等待登录...'
                      : auth.connected
                        ? '切换账号'
                        : '网页账号登录（推荐）'
                  }}
                </n-button>
                <span class="auth-hint">
                  弹出 CNB 登录窗口，无需创建令牌；登录状态自动保存，并支持仓库置顶双向同步。
                </span>
              </div>
              <n-button
                v-if="auth.connected"
                :disabled="auth.loggingIn || auth.busy"
                quaternary
                type="error"
                @click="auth.logout()"
              >
                退出登录
              </n-button>
            </div>
          </template>

          <div
            v-if="(auth.connected && projectsLoading) || auth.error"
            class="auth-feedback-row"
          >
            <div
              v-if="auth.connected && projectsLoading"
              class="auth-loading-hint"
            >
              <n-spin />
              <span>正在刷新项目列表...</span>
            </div>
            <span
              v-if="auth.error"
              :key="auth.error"
              class="auth-error-shake"
            >
              <n-text type="error">
                {{ auth.error }}
              </n-text>
            </span>
          </div>
        </div>
      </div>
    </n-collapse-transition>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useAuthStore } from '../store/auth'
import { formatRelativeTime, type MergeHistoryEntry } from '../store/merge'
import type { CloseAction } from '../ipc/bridge'
import type { ThemeMode } from '../ui/theme'
import {
  NBadge,
  NButton,
  NCheckbox,
  NCollapseTransition,
  NInput,
  NPopover,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSpace,
  NSpin,
  NText,
} from '../ui/naive'
import AppIcon, { type AppIconName } from './AppIcon.vue'

const props = withDefaults(
  defineProps<{
    currentVersion: string
    latestVersion: string
    hasUpdate: boolean
    updateChecking: boolean
    updateError: string
    updateDownloadPhase: 'idle' | 'downloading' | 'downloaded' | 'error'
    updateDownloadPercent: number
    updateDownloadError: string
    installingUpdate: boolean
    isAuthExpanded: boolean
    authTab: 'login' | 'token'
    projectCount: number
    projectsLoading: boolean
    isWindows: boolean
    isMac?: boolean
    closeAction: CloseAction
    closeActionOptions: Array<{ label: string; value: CloseAction }>
    themeMode: ThemeMode
    history?: MergeHistoryEntry[]
  }>(),
  {
    isMac: false,
    history: () => [],
  },
)

const emit = defineEmits<{
  (e: 'update:isAuthExpanded', val: boolean): void
  (e: 'update:authTab', val: 'login' | 'token'): void
  (e: 'update:closeAction', val: CloseAction): void
  (e: 'check-update'): void
  (e: 'download-update'): void
  (e: 'install-update'): void
  (e: 'open-release'): void
  (e: 'cycle-theme'): void
  (e: 'apply-history', item: MergeHistoryEntry): void
}>()

const auth = useAuthStore()
const historyOpen = ref(false)

const recentHistory = computed(() => props.history.slice(0, 10))

function onSelectHistory(item: MergeHistoryEntry) {
  historyOpen.value = false
  emit('apply-history', item)
}

const themeIcon = computed<AppIconName>(() => {
  if (props.themeMode === 'dark') return 'moon'
  if (props.themeMode === 'light') return 'sun'
  return 'monitor'
})

const themeTooltip = computed(() => {
  if (props.themeMode === 'dark') return '外观：深色（点击切换为浅色）'
  if (props.themeMode === 'light') return '外观：浅色（点击切换为跟随系统）'
  return '外观：跟随系统（点击切换为深色）'
})
</script>

<style scoped>
.app-header-shell {
  flex: 0 0 auto;
  border-radius: var(--wb-radius-lg);
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-elevated);
  box-shadow: var(--wb-shadow-shell);
  overflow: hidden;
}

/* macOS 一体化无边框顶栏：铺满顶部，左侧避开红绿灯并支持拖拽移动窗口 */
.app-header-shell.is-mac {
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
  box-shadow: none;
}

.app-header-shell.is-mac .header-bar {
  min-height: 44px;
  padding: 6px 16px 6px 82px;
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}

.header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 46px;
  padding: 6px 14px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.brand-logo-wrap {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  overflow: hidden;
  flex: 0 0 auto;
  box-shadow: 0 0 0 1px var(--wb-border);
}

.brand-logo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-name {
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--wb-text-1);
  user-select: none;
}

.version-pill {
  display: inline-flex;
  align-items: center;
  height: 21px;
  padding: 0 7px;
  border-radius: 999px;
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-subtle);
  color: var(--wb-text-2);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  transition:
    border-color var(--wb-transition),
    color var(--wb-transition),
    background-color var(--wb-transition),
    transform 140ms var(--wb-ease-out);
}

.version-pill:active {
  transform: scale(0.97);
}

.version-pill:hover {
  border-color: var(--wb-accent-border);
  color: var(--wb-accent-text);
  background-color: var(--wb-accent-soft);
}

.version-pill.has-update {
  border-color: var(--wb-warning-border);
  color: var(--wb-warning);
  background-color: var(--wb-warning-soft);
}

.update-popover {
  width: 268px;
}

.update-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--wb-divider);
}

.update-pop-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--wb-text-1);
}

.update-pop-ver {
  font-size: 12px;
  color: var(--wb-text-2);
}

.update-new-banner {
  padding: 6px 10px;
  border-radius: var(--wb-radius-sm);
  background-color: var(--wb-warning-soft);
  border: 1px solid var(--wb-warning-border);
  font-size: 12px;
}

.history-popover {
  width: 340px;
}

.history-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--wb-divider);
}

.history-pop-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--wb-text-1);
}

.history-pop-badge {
  font-size: 11px;
  color: var(--wb-text-3);
  padding: 1px 6px;
  border-radius: 999px;
  background-color: var(--wb-bg-subtle);
}

.history-timeline {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 2px;
}

.timeline-item {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 7px 9px;
  border-radius: var(--wb-radius-sm);
  border: 1px solid var(--wb-divider);
  background-color: var(--wb-bg-sunken);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color var(--wb-transition),
    background-color var(--wb-transition),
    transform 140ms var(--wb-ease-out);
}

.timeline-item:hover {
  border-color: var(--wb-accent-border);
  background-color: var(--wb-accent-hover);
}

.timeline-item:active {
  transform: scale(0.985);
}

.timeline-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.timeline-apply-hint {
  font-size: 11px;
  font-weight: 500;
  color: var(--wb-accent-text);
  opacity: 0;
  transition: opacity var(--wb-transition);
}

.timeline-item:hover .timeline-apply-hint,
.timeline-item:focus-visible .timeline-apply-hint {
  opacity: 1;
}

.timeline-dot {
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.timeline-dot.is-ok {
  background-color: var(--wb-success);
}

.timeline-dot.is-warn {
  background-color: var(--wb-warning);
}

.timeline-dot.is-err {
  background-color: var(--wb-danger);
}

.timeline-content {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
}

.timeline-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.timeline-repo {
  font-size: 12px;
  font-weight: 600;
  color: var(--wb-text-1);
}

.timeline-time {
  font-size: 11px;
  color: var(--wb-text-3);
  flex: 0 0 auto;
}

.timeline-branch {
  font-size: 11.5px;
  color: var(--wb-text-2);
}

.timeline-stats {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}

.t-stat.is-ok {
  color: var(--wb-success);
}

.t-stat.is-warn {
  color: var(--wb-warning);
}

.t-stat.is-err {
  color: var(--wb-danger);
}

.t-stat.is-muted {
  color: var(--wb-text-3);
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px 12px;
  color: var(--wb-text-3);
  font-size: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.win-close-pref {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: 4px;
}

.win-close-label {
  font-size: 12px;
  color: var(--wb-text-3);
  white-space: nowrap;
}

.win-close-select {
  width: 146px;
}

.header-icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: var(--wb-radius-sm);
  border: 1px solid var(--wb-border);
  background-color: transparent;
  color: var(--wb-text-2);
  cursor: pointer;
  transition:
    background-color var(--wb-transition),
    border-color var(--wb-transition),
    color var(--wb-transition),
    transform 140ms var(--wb-ease-out);
}

.header-icon-btn:active {
  transform: scale(0.96);
}

.header-icon-btn:hover {
  background-color: var(--wb-row-hover);
  border-color: var(--wb-border-strong);
  color: var(--wb-text-1);
}

.header-icon-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--wb-accent-ring);
}

.history-count-dot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background-color: var(--wb-accent);
}

.account-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-sunken);
  color: var(--wb-text-1);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    background-color var(--wb-transition),
    border-color var(--wb-transition),
    transform 140ms var(--wb-ease-out);
}

.account-pill:active {
  transform: scale(0.97);
}

.account-pill:hover,
.account-pill.is-open {
  border-color: var(--wb-accent-border);
  background-color: var(--wb-accent-hover);
}

.account-pill:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--wb-accent-ring);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  flex: 0 0 auto;
}

.status-dot.is-online {
  background-color: var(--wb-success);
  box-shadow: 0 0 0 3px var(--wb-success-soft);
}

.status-dot.is-offline {
  background-color: var(--wb-text-3);
}

.account-pill-label {
  font-weight: 500;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-pill-count {
  padding: 1px 6px;
  border-radius: 999px;
  background-color: var(--wb-bg-subtle);
  color: var(--wb-text-2);
  font-size: 11px;
}

.account-pill-sep {
  width: 1px;
  height: 12px;
  background-color: var(--wb-border);
}

.account-pill-toggle {
  color: var(--wb-accent-text);
  font-weight: 500;
}

.account-chevron {
  color: var(--wb-text-3);
  transition: transform var(--wb-transition);
}

.account-chevron.rotated {
  transform: rotate(180deg);
}

.auth-drawer {
  border-top: 1px solid var(--wb-divider);
  background-color: var(--wb-bg-surface);
  padding: 12px 16px 14px;
}

.auth-drawer-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.auth-drawer-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--wb-text-1);
}

.auth-endpoint {
  font-size: 11px;
  font-weight: 400;
  color: var(--wb-text-3);
  padding: 2px 7px;
  border-radius: 4px;
  background-color: var(--wb-bg-subtle);
}

.auth-drawer-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.field-label {
  font-size: 12px;
  color: var(--wb-text-2);
}

.auth-action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.auth-action-left {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.auth-hint {
  font-size: 12px;
  color: var(--wb-text-3);
}

.auth-feedback-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.auth-loading-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--wb-text-3);
}

.auth-error-shake {
  display: inline-block;
  animation: wb-error-shake 260ms var(--wb-ease-out);
}

.wb-icon-swap-enter-active {
  transition:
    opacity 140ms var(--wb-ease-out),
    transform 140ms var(--wb-ease-out),
    filter 140ms var(--wb-ease-out);
}

.wb-icon-swap-leave-active {
  transition:
    opacity 90ms var(--wb-ease-out),
    transform 90ms var(--wb-ease-out),
    filter 90ms var(--wb-ease-out);
}

.wb-icon-swap-enter-from {
  opacity: 0;
  transform: rotate(-18deg) scale(0.92);
  filter: blur(2px);
}

.wb-icon-swap-leave-to {
  opacity: 0;
  transform: rotate(16deg) scale(0.92);
  filter: blur(2px);
}

@media (max-width: 720px) {
  .token-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
