<template>
  <div
    aria-busy="true"
    aria-label="加载中"
    class="skeleton-list"
  >
    <div
      v-for="(w, i) in widths"
      :key="i"
      class="skeleton-row"
      :class="{ 'is-two-line': twoLine }"
    >
      <div
        v-if="!twoLine"
        class="skeleton-dot shimmer"
      />
      <div class="skeleton-lines">
        <div
          class="skeleton-bar shimmer"
          :style="{ width: w }"
        />
        <div
          v-if="twoLine"
          class="skeleton-sub shimmer"
          :style="{ width: subWidths[i] }"
        />
      </div>
    </div>
    <span class="skeleton-sr">加载中...</span>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    twoLine?: boolean
  }>(),
  {
    twoLine: false,
  },
)

const widths = ['64%', '78%', '52%', '84%', '60%', '72%']
const subWidths = ['40%', '48%', '34%', '52%', '38%', '44%']
</script>

<style scoped>
/* 160ms 防闪烁延迟：快速请求返回时骨架屏不闪现，仅在真实等待时柔和浮出 */
.skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 4px;
  width: 100%;
  animation: wb-skeleton-reveal 180ms var(--wb-ease-out) 160ms both;
}

.skeleton-row {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 6px 10px;
  border-radius: var(--wb-radius-sm);
}

.skeleton-row.is-two-line {
  padding: 7px 10px;
}

.skeleton-dot {
  width: 13px;
  height: 13px;
  border-radius: 4px;
  flex: 0 0 auto;
}

.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1 1 auto;
}

.skeleton-bar {
  height: 11px;
  border-radius: 5px;
}

.skeleton-sub {
  height: 8px;
  border-radius: 4px;
  opacity: 0.65;
}

/* 使用伪元素 transform: translateX 走 GPU 合成，避免 background-position 每帧重绘 */
.shimmer {
  position: relative;
  overflow: hidden;
  background-color: var(--wb-bg-subtle);
}

.shimmer::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--wb-border) 50%,
    transparent 100%
  );
  transform: translateX(-100%);
  animation: wb-shimmer-slide 1.25s linear infinite;
}

.skeleton-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
}

@keyframes wb-skeleton-reveal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes wb-shimmer-slide {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .shimmer::after {
    animation: none;
    opacity: 0;
  }
}
</style>
