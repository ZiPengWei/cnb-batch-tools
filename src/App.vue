<template>
  <n-config-provider
    :theme="isDark ? darkTheme : undefined"
    :theme-overrides="themeOverrides"
  >
    <n-global-style />
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <n-loading-bar-provider>
            <WorkbenchShell
              :theme-mode="mode"
              @cycle-theme="cycleMode"
            />
          </n-loading-bar-provider>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import {
  darkTheme,
  NConfigProvider,
  NDialogProvider,
  NGlobalStyle,
  NLoadingBarProvider,
  NMessageProvider,
  NNotificationProvider,
} from './renderer/ui/naive'
import { useTheme } from './renderer/ui/theme'
import WorkbenchShell from './renderer/components/WorkbenchShell.vue'

const { mode, isDark, themeOverrides, cycleMode } = useTheme()
</script>
