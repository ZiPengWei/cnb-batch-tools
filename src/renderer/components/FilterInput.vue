<template>
  <n-input
    ref="inputRef"
    clearable
    :disabled="disabled"
    :placeholder="placeholder"
    :value="inner"
    @update:value="onInput"
  />
</template>

<script setup lang="ts">
/**
 * FilterInput
 * 用途：列表过滤输入框（防抖）。输入即时回显在组件内部，
 * 停顿后才向父级发出最终值——大列表场景下父组件（App）无需随每次按键重渲染，
 * 只在停顿后做一次列表重算。
 *
 * Props：
 * - modelValue: 防抖后的对外值（v-model）
 * - placeholder / disabled: 透传给 n-input
 * - delay: 防抖毫秒数（默认 120）
 *
 * Emits：
 * - update:modelValue: (v: string) 防抖后的最终值
 */
import { onUnmounted, ref, watch } from 'vue'
import { NInput } from '../ui/naive'

/** 供父组件聚焦输入框（Ctrl/Cmd+F 快捷键） */
export type FilterInputExposed = { focus: () => void }

const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    disabled?: boolean
    delay?: number
  }>(),
  {
    modelValue: '',
    placeholder: '',
    disabled: false,
    delay: 120,
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
    // 外部赋值（如切仓库清空过滤词）时同步输入框；防抖回写（值相同）忽略
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

onUnmounted(() => {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
})
</script>
