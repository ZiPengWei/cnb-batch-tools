<template>
  <div class="empty-state-box">
    <div class="empty-icon-ring">
      <AppIcon
        :name="icon"
        :size="18"
      />
    </div>
    <span class="empty-title">{{ title }}</span>
    <span
      v-if="hint"
      class="empty-hint"
    >{{ hint }}</span>
  </div>
</template>

<script setup lang="ts">
import AppIcon, { type AppIconName } from './AppIcon.vue'

withDefaults(
  defineProps<{
    icon?: AppIconName
    title: string
    hint?: string
  }>(),
  {
    icon: 'inbox',
    hint: '',
  },
)
</script>

<style scoped>
.empty-state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 20px 16px;
  text-align: center;
}

.empty-icon-ring {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  margin-bottom: 2px;
  border-radius: 10px;
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-sunken);
  color: var(--wb-text-3);
}

.empty-title {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--wb-text-2);
}

.empty-hint {
  font-size: 11.5px;
  color: var(--wb-text-3);
  max-width: 210px;
  line-height: 1.45;
}
</style>
