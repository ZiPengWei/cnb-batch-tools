<template>
  <template
    v-for="(seg, idx) in segments"
    :key="idx"
  >
    <mark
      v-if="seg.hit"
      class="wb-match-hit"
    >{{ seg.text }}</mark>
    <template v-else>
      {{ seg.text }}
    </template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { buildHighlightSegments } from '../utils/branchMatch'

const props = defineProps<{
  text: string
  query?: string
}>()

const segments = computed(() =>
  buildHighlightSegments(props.text, props.query || ''),
)
</script>

<style scoped>
mark.wb-match-hit {
  background-color: var(--wb-accent-soft);
  color: var(--wb-accent-text);
}
</style>
