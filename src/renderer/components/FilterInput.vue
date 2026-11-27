<template>
  <div class="filter-input-wrap">
    <n-input
      ref="inputRef"
      clearable
      :disabled="disabled"
      :placeholder="placeholder"
      :value="inner"
      @keydown.escape="onEscape"
      @update:value="onInput"
    >
      <template #prefix>
        <span class="filter-prefix">
          <AppIcon
            name="search"
            :size="13"
          />
        </span>
      </template>
      <template
        v-if="shortcut && !inner"
        #suffix
      >
        <kbd class="filter-kbd wb-mono">{{ shortcut }}</kbd>
      </template>
    </n-input>
  </div>
</template>

<script setup lang="ts">
/**
 * FilterInput
 * 用途：列表过滤输入框（防抖）。输入即时回显在组件内部，
 * 停顿后才向父级发出最终值；按 Esc 立即清空并失焦。
 */
import { onUnmounted, ref, watch } from 'vue'
import { NInput } from '../ui/naive'
import AppIcon from './AppIcon.vue'

/** 供父组件聚焦输入框（Ctrl/Cmd+F 或 Cmd+1/2/3 快捷键） */
export type FilterInputExposed = { focus: () => void }

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    disabled?: boolean
    delay?: number
    shortcut?: string
  }>(),
  {
    modelValue: '',
    placeholder: '',
    disabled: false,
    delay: 120,
    shortcut: '',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

const inner = ref(props.modelValue)
let timer: ReturnType<typeof setTimeout> | null = null

const inputRef = ref<InstanceType<typeof NInput> | null>(null)

function focus() {
  inputRef.value?.focus()
}

defineExpose<FilterInputExposed>({ focus })

watch(
  () => props.modelValue,
  (v) => {
    if (v === inner.value) return
    inner.value = v
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  },
)

function onInput(v: string) {
  inner.value = v
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    emit('update:modelValue', inner.value)
  }, props.delay)
}

function onEscape(e: KeyboardEvent) {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  if (inner.value) {
    e.preventDefault()
    e.stopPropagation()
    inner.value = ''
    emit('update:modelValue', '')
  } else {
    inputRef.value?.blur()
  }
}

onUnmounted(() => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
})
</script>

<style scoped>
.filter-input-wrap {
  flex: 0 0 auto;
}

.filter-prefix {
  display: inline-flex;
  align-items: center;
  color: var(--wb-text-3);
  margin-right: 2px;
}

.filter-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  border: 1px solid var(--wb-border);
  background-color: var(--wb-bg-subtle);
  color: var(--wb-text-3);
  font-size: 10px;
  line-height: 1;
  letter-spacing: 0.02em;
  pointer-events: none;
  user-select: none;
}
</style>
