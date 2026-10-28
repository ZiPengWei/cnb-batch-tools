<template>
  <n-config-provider>
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-loading-bar-provider>
            <n-flex
              :class="'app-root'"
              :style="[styles.contentInner, styles.listThemeVars]"
              vertical
            >
              <div
                :style="styles.authCardWrap"
              >
                <n-card
                  :segmented="{ content: true }"
                >
                  <template #header>
                    <n-space align="center">
                      CNB 认证
                      <n-popover
                        placement="bottom-end"
                        trigger="click"
                      >
                        <template #trigger>
                          <n-badge
                            dot
                            :show="hasUpdate"
                          >
                            <n-button
                              text
                              type="primary"
                            >
                              v{{ currentVersion || '?' }}
                            </n-button>
                          </n-badge>
                        </template>
                        <n-space vertical>
                          <n-text :style="styles.caption">
                            当前版本 v{{ currentVersion || '?' }}
                          </n-text>
                          <n-space
                            v-if="updateChecking"
                            align="center"
                          >
                            <n-spin :style="styles.inlineSpinner" />
                            <n-text
                              depth="3"
                              :style="styles.caption"
                            >
                              正在检查更新...
                            </n-text>
                          </n-space>
                          <template v-else-if="hasUpdate">
                            <n-text type="warning">
                              发现新版本 v{{ latestVersion }}
                            </n-text>
                            <n-button
                              type="primary"
                              @click="openReleasePage"
                            >
                              前往下载
                            </n-button>
                          </template>
                          <template v-else-if="updateError">
                            <n-text
                              depth="3"
                              :style="styles.caption"
                            >
                              {{ updateError }}
                            </n-text>
                            <n-button
                              secondary
                              @click="runCheckUpdate"
                            >
                              重试
                            </n-button>
                          </template>
                          <n-text
                            v-else
                            depth="3"
                            :style="styles.caption"
                          >
                            已是最新版本
                          </n-text>
                          <n-button
                            :disabled="updateChecking"
                            text
                            @click="runCheckUpdate"
                          >
                            检查更新
                          </n-button>
                        </n-space>
                      </n-popover>
                    </n-space>
                  </template>
                  <template #header-extra>
                    <n-space align="center">
                      <n-tag
                        v-if="auth.connected"
                        round
                        type="success"
                      >
                        已连接: {{ auth.userName }}
                      </n-tag>
                      <n-tag
                        v-else
                        round
                        type="default"
                      >
                        未连接
                      </n-tag>
                      <n-radio-group v-model:value="authTab">
                        <n-radio-button value="login">
                          网页登录
                        </n-radio-button>
                        <n-radio-button value="token">
                          访问令牌
                        </n-radio-button>
                      </n-radio-group>
                      <n-button
                        text
                        type="primary"
                        @click="isAuthExpanded = !isAuthExpanded"
                      >
                        {{ isAuthExpanded ? '收起' : '配置' }}
                      </n-button>
                    </n-space>
                  </template>
                  <n-collapse-transition :show="isAuthExpanded">
                    <n-space
                      :style="styles.authPanel"
                      vertical
                    >
                      <template v-if="authTab === 'token'">
                        <n-grid
                          :cols="24"
                          :x-gap="24"
                        >
                          <n-grid-item :span="12">
                            <n-space vertical>
                              <n-text
                                depth="3"
                                :style="styles.caption"
                              >
                                CNB API 地址
                              </n-text>
                              <n-input
                                v-model:value="auth.baseUrl"
                                placeholder="https://api.cnb.cool"
                              />
                            </n-space>
                          </n-grid-item>
                          <n-grid-item :span="12">
                            <n-space vertical>
                              <n-text
                                depth="3"
                                :style="styles.caption"
                              >
                                访问令牌 (Access Token)
                              </n-text>
                              <n-input
                                v-model:value="auth.token"
                                placeholder="在 cnb.cool 个人设置中创建访问令牌"
                                show-password-on="click"
                                type="password"
                              />
                            </n-space>
                          </n-grid-item>
                        </n-grid>
                        <n-space align="center">
                          <n-button
                            :disabled="auth.loggingIn || auth.busy"
                            :loading="auth.busy"
                            @click="auth.connect()"
                          >
                            {{ auth.busy ? '验证中...' : '使用令牌连接' }}
                          </n-button>
                          <n-checkbox v-model:checked="auth.rememberToken">
                            记住令牌（仅本机保存，网页登录不受此项影响）
                          </n-checkbox>
                        </n-space>
                      </template>
                      <template v-else>
                        <n-space align="center">
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
                        </n-space>
                        <n-text
                          depth="3"
                          :style="styles.caption"
                        >
                          网页账号登录：弹出 CNB 登录窗口，无需创建令牌；登录状态自动保存，并支持仓库置顶双向同步。
                        </n-text>
                      </template>
                      <n-space
                        v-if="auth.connected"
                        align="center"
                      >
                        <n-button
                          :disabled="auth.loggingIn || auth.busy"
                          quaternary
                          type="error"
                          @click="auth.logout()"
                        >
                          退出登录
                        </n-button>
                      </n-space>
                      <n-text
                        v-if="auth.connected && projects.loading"
                        depth="3"
                        :style="styles.caption"
                      >
                        <n-spin :style="styles.inlineSpinner" />
                        正在刷新项目列表...
                      </n-text>
                      <n-text
                        v-if="auth.error"
                        :style="styles.caption"
                        type="error"
                      >
                        {{ auth.error }}
                      </n-text>
                    </n-space>
                  </n-collapse-transition>
                  <n-collapse-transition :show="!isAuthExpanded">
                    <div
                      v-if="!isAuthExpanded"
                      :style="styles.authCollapsed"
                    >
                      <div :style="styles.authCollapsedRow">
                        <n-text
                          depth="3"
                          :style="styles.caption"
                        >
                          {{ auth.baseUrl || '未设置 CNB API 地址' }}
                        </n-text>
                        <n-text
                          v-if="auth.connected"
                          depth="3"
                          :style="styles.caption"
                        >
                          项目：{{ projects.items.length }} 个
                        </n-text>
                      </div>
                    </div>
                  </n-collapse-transition>
                </n-card>
              </div>

              <div class="triple-row">
                <div :style="styles.col">
                  <n-card
                    :content-style="styles.cardContent"
                    :style="styles.card"
                    title="1. 选择仓库"
                  >
                    <template #header-extra>
                      <n-button
                        :disabled="!canUseContent || projects.loading"
                        text
                        type="primary"
                        @click="projects.loadProjects()"
                      >
                        {{ projects.loading ? '加载中...' : '刷新' }}
                      </n-button>
                    </template>
                    <div :style="styles.fill">
                      <n-input
                        v-model:value="projects.filter"
                        clearable
                        :disabled="!canUseContent"
                        placeholder="过滤仓库..."
                        @update:value="projects.setFilter"
                      />
                      <n-text
                        v-if="projects.pinError"
                        :style="styles.caption"
                        type="error"
                      >
                        {{ projects.pinError }}
                      </n-text>
                      <div
                        aria-label="项目列表"
                        :style="styles.scrollArea"
                      >
                        <div :style="styles.scrollInner">
                          <div
                            v-if="projects.sortedItems.length"
                            :style="styles.listStack"
                          >
                            <n-button
                              v-for="p in projects.sortedItems"
                              :key="p.id"
                              block
                              :class="'gl-list-item'"
                              :data-item-key="String(p.id)"
                              :data-selected="projects.selectedRepo === p.id ? 'true' : 'false'"
                              :style="styles.listItemButton"
                              text
                              :title="p.display"
                              :type="projects.selectedRepo === p.id ? 'primary' : 'default'"
                              @click="onClickProject(p, $event)"
                            >
                              <span
                                class="gl-ellipsis-1"
                                :style="styles.repoNameText"
                              >{{ p.display }}</span>
                              <span
                                :aria-label="projects.pinnedRepos.includes(p.id) ? `取消置顶 ${p.display}` : `置顶 ${p.display}`"
                                class="pin-btn"
                                :data-pinned="projects.pinnedRepos.includes(p.id) ? 'true' : 'false'"
                                role="button"
                                :style="[styles.pinBtn, projects.pinnedRepos.includes(p.id) ? styles.pinBtnOn : styles.pinBtnOff]"
                                tabindex="0"
                                :title="projects.pinnedRepos.includes(p.id) ? '取消置顶' : '置顶'"
                                @click.stop="projects.togglePin(p.id)"
                                @keydown.enter.stop.prevent="projects.togglePin(p.id)"
                                @keydown.space.stop.prevent="projects.togglePin(p.id)"
                              >
                                📌
                              </span>
                            </n-button>
                          </div>
                          <div
                            v-else
                            :style="styles.emptyFill"
                          >
                            <template v-if="projects.loading">
                              <n-spin />
                              <n-text
                                depth="3"
                                :style="styles.caption"
                              >
                                加载中...
                              </n-text>
                            </template>
                            <n-empty
                              v-else
                              :description="projects.items.length ? '无匹配项目' : '暂无数据'"
                            />
                          </div>
                        </div>
                      </div>
                      <n-text
                        depth="3"
                        :style="styles.caption"
                      >
                        已选: {{ projects.selectedProjectName || '(无)' }}
                      </n-text>
                    </div>
                  </n-card>
                </div>

                <div :style="styles.col">
                  <n-card
                    :content-style="styles.cardContent"
                    :style="styles.card"
                    title="2. 选择源分支"
                  >
                    <template #header-extra>
                      <n-button
                        :disabled="!projects.selectedRepo || projects.sourceBranchesLoading"
                        text
                        type="primary"
                        @click="projects.loadAllBranches()"
                      >
                        {{ projects.sourceBranchesLoading ? '加载中...' : '刷新' }}
                      </n-button>
                    </template>
                    <div :style="styles.fill">
                      <n-input
                        v-model:value="sourceFilter"
                        clearable
                        :disabled="!projects.selectedRepo || projects.sourceBranchesLoading"
                        placeholder="过滤源分支..."
                      />
                      <div
                        aria-label="源分支列表"
                        :style="styles.scrollArea"
                      >
                        <div :style="styles.scrollInner">
                          <div
                            v-if="displaySourceBranches.length"
                            :style="styles.listStack"
                          >
                            <n-button
                              v-for="b in displaySourceBranches"
                              :key="b"
                              block
                              :class="'gl-list-item'"
                              :data-item-key="b"
                              :data-selected="projects.selectedSourceBranch === b ? 'true' : 'false'"
                              :style="styles.listItemButton"
                              text
                              :title="b"
                              :type="projects.selectedSourceBranch === b ? 'primary' : 'default'"
                              @click="onClickSourceBranch(b, $event)"
                            >
                              <span class="gl-ellipsis-1">{{ b }}</span>
                            </n-button>
                          </div>
                          <div
                            v-else
                            :style="styles.emptyFill"
                          >
                            <template v-if="projects.sourceBranchesLoading">
                              <n-spin />
                              <n-text
                                depth="3"
                                :style="styles.caption"
                              >
                                加载中...
                              </n-text>
                            </template>
                            <div
                              v-else-if="projects.sourceBranchesError"
                              :style="styles.emptyFill"
                            >
                              <n-text type="error">
                                {{ projects.sourceBranchesError }}
                              </n-text>
                            </div>
                            <n-empty
                              v-else
                              :description="projects.sourceBranches?.length && sourceFilter.trim() ? '无匹配' : '暂无数据'"
                            />
                          </div>
                        </div>
                      </div>
                      <n-text
                        depth="3"
                        :style="styles.caption"
                      >
                        共 {{ displaySourceBranches.length }} 个分支
                      </n-text>
                    </div>
                  </n-card>
                </div>

                <div :style="styles.col">
                  <n-card
                    :content-style="styles.cardContent"
                    :style="styles.card"
                    title="3. 选择目标分支"
                  >
                    <template #header-extra>
                      <n-space align="center">
                        <n-button
                          :disabled="!displayTargetRows.some((row) => row.type === 'branch')"
                          text
                          type="primary"
                          @click="selectVisibleTargets"
                        >
                          全选当前
                        </n-button>
                        <n-button
                          :disabled="!merge.selectedTargets.length"
                          text
                          @click="merge.selectedTargets = []"
                        >
                          清空
                        </n-button>
                      </n-space>
                    </template>
                    <div :style="styles.fill">
                      <n-input
                        v-model:value="merge.targetFilter"
                        clearable
                        placeholder="过滤目标分支..."
                      />
                      <div
                        aria-label="目标分支列表"
                        :style="styles.scrollArea"
                      >
                        <div :style="styles.scrollInner">
                          <div
                            v-if="displayTargetRows.length"
                            :style="styles.listStack"
                          >
                            <template
                              v-for="(row, idx) in displayTargetRows"
                              :key="row.type === 'separator' ? `sep-${idx}` : row.name"
                            >
                              <div
                                v-if="row.type === 'separator'"
                                :style="styles.listSeparator"
                              />
                              <n-button
                                v-else
                                :aria-pressed="merge.selectedTargets.includes(row.name)"
                                block
                                :class="'gl-list-item'"
                                :data-item-key="row.name"
                                :data-selected="merge.selectedTargets.includes(row.name) ? 'true' : 'false'"
                                :style="styles.listItemButton"
                                text
                                :title="row.name"
                                :type="merge.selectedTargets.includes(row.name) ? 'primary' : 'default'"
                                @click="onClickTargetRow(row.name, $event)"
                              >
                                <template #icon>
                                  <span
                                    v-if="merge.selectedTargets.includes(row.name)"
                                    :style="styles.checkIcon"
                                  >✓</span>
                                  <span
                                    v-else-if="row.isCore"
                                    :style="styles.starIcon"
                                    title="核心环境分支"
                                  >★</span>
                                  <span
                                    v-else
                                    :style="styles.checkIcon"
                                  >+</span>
                                </template>
                                <span class="gl-ellipsis-1">{{ row.name }}</span>
                              </n-button>
                            </template>
                          </div>
                          <div
                            v-else
                            :style="styles.emptyFill"
                          >
                            <template v-if="projects.targetBranchesLoading">
                              <n-spin />
                              <n-text
                                depth="3"
                                :style="styles.caption"
                              >
                                加载中...
                              </n-text>
                            </template>
                            <div
                              v-else-if="projects.targetBranchesError"
                              :style="styles.emptyFill"
                            >
                              <n-text type="error">
                                {{ projects.targetBranchesError }}
                              </n-text>
                            </div>
                            <n-empty
                              v-else
                              description="暂无数据"
                            />
                          </div>
                        </div>
                      </div>
                      <n-text
                        depth="3"
                        :style="styles.caption"
                      >
                        已选: {{ merge.selectedTargets.length }} 个
                      </n-text>
                    </div>
                  </n-card>
                </div>
              </div>

              <div
                class="action-bar"
                :style="styles.actionBar"
              >
                <div :style="styles.actionSummary">
                  <n-text strong>
                    {{ projects.selectedProjectName || '请选择仓库' }}
                  </n-text>
                  <n-text
                    depth="3"
                    :style="styles.caption"
                  >
                    {{ projects.selectedSourceBranch || '未选择源分支' }}
                    <span v-if="merge.selectedTargets.length">
                      → {{ selectedTargetsSummary }}
                    </span>
                    <span v-else>→ 未选择目标分支</span>
                  </n-text>
                </div>
                <n-space align="center">
                  <n-text
                    v-if="merge.selectedTargets.length"
                    depth="3"
                    :style="styles.caption"
                  >
                    已选 {{ merge.selectedTargets.length }} 个目标分支
                  </n-text>
                  <n-button
                    :disabled="merge.running || !projects.selectedRepo || !projects.selectedSourceBranch || !merge.selectedTargets.length"
                    :loading="merge.running"
                    type="primary"
                    @click="onClickBatch"
                  >
                    {{ merge.running ? '处理中...' : mergeButtonText }}
                  </n-button>
                </n-space>
              </div>
            </n-flex>

            <BatchMergeFlowDialog
              ref="batchMergeFlowDialogRef"
            />
          </n-loading-bar-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useAuthStore } from './renderer/store/auth'
import { useProjectsStore } from './renderer/store/projects'
import { useMergeStore } from './renderer/store/merge'
import BatchMergeFlowDialog, { type BatchMergeFlowDialogExposed } from './renderer/components/BatchMergeFlowDialog.vue'
import {
  checkForUpdate,
  getAppVersion,
  getUpdateStatus,
  onUpdateStatus,
  openExternal,
  type UpdateStatus,
} from './renderer/ipc/bridge'
import {
  NButton,
  NCheckbox,
  NConfigProvider,
  NDialogProvider,
  NInput,
  NGlobalStyle,
  NText,
  NSpin,
  NEmpty,
  NFlex,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
  NCard,
  NGrid,
  NGridItem,
  NSpace,
  NTag,
  NCollapseTransition,
  NRadioGroup,
  NRadioButton,
  NBadge,
  NPopover,
  useThemeVars,
} from './renderer/ui/naive'

const auth = useAuthStore()
const projects = useProjectsStore()
const merge = useMergeStore()

const canUseContent = computed(() => auth.connected)

const sourceBranch = computed(() => projects.selectedSourceBranch)
const selectedTargets = computed(() => merge.selectedTargets)

const sourceFilter = ref('')

const themeVars = useThemeVars()

const styles = computed(() => {
  const v = themeVars.value

  return {
    listThemeVars: {
      '--gl-list-transition': '160ms',
      '--gl-list-radius': v.borderRadiusSmall,
      '--gl-list-indicator': v.primaryColor,
      '--gl-list-indicator-hover': v.primaryColorHover,
      '--gl-list-bg-hover': `color-mix(in srgb, ${v.primaryColor} 10%, transparent)`,
      '--gl-list-bg-selected': `color-mix(in srgb, ${v.primaryColor} 16%, transparent)`,
      '--gl-list-bg-active': `color-mix(in srgb, ${v.primaryColorPressed} 22%, transparent)`,
      '--gl-list-shadow-hover': 'none',
      '--gl-list-shadow-selected': 'none',
      '--gl-list-focus-ring': `0 0 0 2px color-mix(in srgb, ${v.primaryColor} 38%, transparent)`,
      '--gl-list-text-selected': v.textColor1,
    },
    contentInner: {
      width: 'min(1618px, 94vw)',
      height: '100vh',
      margin: '0 auto',
      padding: 'min(24px, 4vw)',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px',
      flexGrow: 1,
      flexShrink: 0,
      boxSizing: 'border-box',
    },
    authCardWrap: {
      flex: '0 0 auto',
      minHeight: 0,
    },
    authPanel: {
      paddingTop: '12px',
    },
    authCollapsed: {
      paddingTop: '8px',
    },
    authCollapsedRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '12px',
      flexWrap: 'wrap',
    },
    caption: {
      fontSize: '12px',
    },
    inlineSpinner: {
      marginRight: '4px',
      verticalAlign: 'middle',
    },
    actionBar: {
      flex: '0 0 auto',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: '15px',
      padding: '12px 15px',
      border: `1px solid ${v.borderColor}`,
      borderRadius: v.borderRadius,
      backgroundColor: v.cardColor,
      boxSizing: 'border-box',
    },
    actionSummary: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: 0,
      overflowWrap: 'anywhere',
    },
    col: {
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    },
    card: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    },
    cardContent: {
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      minHeight: 0,
      gap: '12px',
    },
    fill: {
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
    },
    scrollArea: {
      flex: '1 0 auto',
      height: 0,
      border: `1px solid ${v.borderColor}`,
      borderRadius: v.borderRadiusSmall,
      padding: '4px',
      position: 'relative',
      overflowY: 'auto',
      overflowX: 'hidden',
      overscrollBehavior: 'contain',
      scrollBehavior: 'smooth',
      boxSizing: 'border-box',
    },
    scrollInner: {
      minHeight: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    emptyFill: {
      flex: 1,
      minHeight: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: '8px',
      padding: '12px',
      boxSizing: 'border-box',
    },
    listStack: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    listItemButton: {
      justifyContent: 'flex-start',
      padding: '6px 10px 6px 14px',
    },
    repoNameText: {
      flex: '1 1 auto',
      minWidth: 0,
      textAlign: 'left',
    },
    pinBtn: {
      flex: '0 0 auto',
      marginLeft: '8px',
      fontSize: '12px',
      lineHeight: 1,
      cursor: 'pointer',
      userSelect: 'none',
    },
    pinBtnOn: {
      opacity: 1,
    },
    pinBtnOff: {
      opacity: 0.3,
      filter: 'grayscale(1)',
    },
    listSeparator: {
      height: '1px',
      backgroundColor: v.borderColor,
      margin: '4px 0',
    },
    emptyState: {
      padding: '12px',
      textAlign: 'center',
      color: v.textColor3,
    },
    starIcon: {
      color: v.warningColor,
    },
    checkIcon: {
      display: 'inline-block',
      width: '14px',
      color: v.primaryColor,
      textAlign: 'center',
      fontWeight: 600,
    },
  } as const
})

function isSubsequence(needle: string, haystack: string) {
  if (!needle) return true
  let j = 0
  for (let i = 0; i < haystack.length && j < needle.length; i++) {
    if (haystack[i] === needle[j]) j++
  }
  return j === needle.length
}

function matchesBranch(query: string, branch: string) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const s = branch.toLowerCase()
  if (s.includes(q)) return true
  return isSubsequence(q, s)
}

const displaySourceBranches = computed(() => {
  const list = projects.sourceBranches || []
  return list.filter((b) => matchesBranch(sourceFilter.value, b))
})

type TargetRow = { type: 'branch'; name: string; isCore: boolean } | { type: 'separator' }

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
  rows.map((name) => ({ type: 'branch' as const, name, isCore: true }))
  rows.push(...core.map((name) => ({ type: 'branch' as const, name, isCore: true })))
  if (core.length && others.length) rows.push({ type: 'separator' })
  rows.push(...others.map((name) => ({ type: 'branch' as const, name, isCore: false })))
  return rows
})

const selectedTargetsSummary = computed(() => {
  const targets = selectedTargets.value
  const preview = targets.slice(0, 3).join('、')
  return targets.length > 3 ? `${preview} 等 ${targets.length} 个` : preview
})

const mergeButtonText = computed(() => {
  const sc = sourceBranch.value ? 1 : 0
  const tc = selectedTargets.value.length
  if (sc > 0 && tc > 0) return `合并 (${tc})`
  return '合并'
})

const batchMergeFlowDialogRef = ref<BatchMergeFlowDialogExposed | null>(null)
const isAuthExpanded = ref(true)
/** 认证卡展示的登录方式（网页登录/令牌），仅控制面板显示，不影响已连接状态；默认网页登录 */
const authTab = ref<'login' | 'token'>('login')

// ---------- 应用更新检查（主进程自动检查，渲染层仅展示，不强制更新） ----------
const currentVersion = ref('')
const latestVersion = ref('')
const hasUpdate = ref(false)
const updateChecking = ref(false)
const updateError = ref('')
const releaseUrl = ref('https://github.com/ZiPengWei/batch-tools/releases/latest')

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

let offUpdateStatus: (() => void) | null = null

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

function onClickSourceBranch(name: string, e: MouseEvent) {
  projects.selectedSourceBranch = name
  scrollEventTargetIntoView(e)
}

function onClickTargetRow(name: string, e: MouseEvent) {
  onToggleTarget(name)
  scrollEventTargetIntoView(e)
}

function onToggleTarget(name: string) {
  merge.toggleTarget(name)
}

function selectVisibleTargets() {
  const visible = displayTargetRows.value
    .filter((row): row is { type: 'branch'; name: string; isCore: boolean } => row.type === 'branch')
    .map((row) => row.name)
  merge.selectedTargets = [...new Set([...merge.selectedTargets, ...visible])]
}

watch(
  () => auth.connected,
  (val) => {
    isAuthExpanded.value = !val
  },
  { immediate: true }
)

// 认证出错（含切换账号失败）时自动展开认证面板，避免错误提示被折叠看不见
watch(
  () => auth.error,
  (val) => {
    if (val) isAuthExpanded.value = true
  }
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
  // 默认展示"网页登录"；原本已用令牌连接（有用户信息）时才默认展示令牌面板
  if (auth.connected && auth.mode === 'token') authTab.value = 'token'

  // 更新检查：订阅主进程推送 + 恢复已缓存的检查结果（主进程启动 3 秒后会自动检查）
  try {
    currentVersion.value = await getAppVersion()
  } catch {
    /* 非 Electron 环境下跳过 */
  }
  offUpdateStatus = onUpdateStatus(applyUpdateStatus)
  try {
    applyUpdateStatus(await getUpdateStatus())
  } catch {
    /* ignore */
  }
})

onUnmounted(() => {
  offUpdateStatus?.()
  offUpdateStatus = null
})
</script>

<style scoped>
.triple-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 15px;
  flex: 1 1 auto;
  min-height: 0;
}

.pin-btn:focus-visible {
  outline: 2px solid var(--gl-list-indicator);
  outline-offset: 2px;
  border-radius: 2px;
}

.gl-list-item {
  position: relative;
  justify-content: flex-start;
  width: 100%;
  text-align: left;
  border-radius: var(--gl-list-radius);
  transition:
    background-color var(--gl-list-transition) ease,
    box-shadow var(--gl-list-transition) ease,
    color var(--gl-list-transition) ease,
    transform var(--gl-list-transition) ease;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

.gl-list-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 4px;
  border-radius: 2px;
  background-color: var(--gl-list-indicator);
  opacity: 0;
  transform: scaleY(0.85);
  transition:
    opacity var(--gl-list-transition) ease,
    transform var(--gl-list-transition) ease,
    background-color var(--gl-list-transition) ease;
}

.gl-list-item[data-selected='true'] {
  background-color: var(--gl-list-bg-selected);
  box-shadow: var(--gl-list-shadow-selected);
  color: var(--gl-list-text-selected);
  font-weight: 600;
}

.gl-list-item[data-selected='true']::before {
  opacity: 1;
  transform: scaleY(1);
}

.gl-list-item:hover {
  background-color: var(--gl-list-bg-hover);
  box-shadow: var(--gl-list-shadow-hover);
}

.gl-list-item[data-selected='true']:hover {
  background-color: var(--gl-list-bg-selected);
  box-shadow: var(--gl-list-shadow-selected);
}

.gl-list-item:active {
  background-color: var(--gl-list-bg-active);
  transform: translateY(0.5px);
}

.gl-list-item:disabled {
  transform: none;
  box-shadow: none;
}

.gl-list-item:disabled::before {
  opacity: 0;
  transform: scaleY(0.85);
}

.gl-list-item:focus-visible,
.gl-list-item.n-button--focus {
  outline: none;
  box-shadow: var(--gl-list-focus-ring), var(--gl-list-shadow-hover);
}

.gl-list-item[data-selected='true']:focus-visible,
.gl-list-item[data-selected='true'].n-button--focus {
  outline: none;
  box-shadow: var(--gl-list-focus-ring), var(--gl-list-shadow-selected);
}

/* 单行省略：适用于按钮列表中的项目/分支名等一行展示的文本 */
.gl-ellipsis-1 {
  display: block;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 多行省略：如需要可改用该 class（默认 2 行） */
.gl-ellipsis-2 {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

@media (max-width: 960px) {
  .triple-row {
    grid-template-columns: minmax(0, 1fr);
    overflow-y: auto;
  }

  .triple-row > div {
    min-height: 320px;
  }

  .action-bar {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  .gl-list-item,
  .gl-list-item::before {
    transition: none;
  }
}
</style>
