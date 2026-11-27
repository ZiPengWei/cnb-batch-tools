<template>
  <svg
    aria-hidden="true"
    class="app-icon"
    fill="none"
    :height="size"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    :stroke-width="strokeWidth"
    viewBox="0 0 24 24"
    :width="size"
  >
    <template v-if="name === 'search'">
      <circle
        cx="11"
        cy="11"
        r="7"
      />
      <path d="m20 20-3.5-3.5" />
    </template>
    <template v-else-if="name === 'refresh'">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </template>
    <template v-else-if="name === 'pin'">
      <path d="M12 17v5" />
      <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
    </template>
    <template v-else-if="name === 'pin-filled'">
      <path d="M12 17v5" />
      <path
        d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
        fill="currentColor"
      />
    </template>
    <template v-else-if="name === 'external-link'">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </template>
    <template v-else-if="name === 'git-branch'">
      <line
        x1="6"
        x2="6"
        y1="3"
        y2="15"
      />
      <circle
        cx="18"
        cy="6"
        r="3"
      />
      <circle
        cx="6"
        cy="18"
        r="3"
      />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </template>
    <template v-else-if="name === 'git-merge'">
      <circle
        cx="18"
        cy="18"
        r="3"
      />
      <circle
        cx="6"
        cy="6"
        r="3"
      />
      <path d="M6 21V9a9 9 0 0 0 9 9" />
    </template>
    <template v-else-if="name === 'folder-git'">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      <circle
        cx="12"
        cy="13"
        r="2"
      />
      <path d="M14 13h3" />
      <path d="M7 13h3" />
    </template>
    <template v-else-if="name === 'star'">
      <polygon
        fill="currentColor"
        points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
      />
    </template>
    <template v-else-if="name === 'check'">
      <polyline
        class="check-stroke"
        pathLength="1"
        points="20 6 9 17 4 12"
      />
    </template>
    <template v-else-if="name === 'arrow-right'">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle
        cx="12"
        cy="12"
        r="4"
      />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </template>
    <template v-else-if="name === 'monitor'">
      <rect
        height="14"
        rx="2"
        width="20"
        x="2"
        y="3"
      />
      <line
        x1="8"
        x2="16"
        y1="21"
        y2="21"
      />
      <line
        x1="12"
        x2="12"
        y1="17"
        y2="21"
      />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="m6 9 6 6 6-6" />
    </template>
    <template v-else-if="name === 'sliders'">
      <line
        x1="4"
        x2="4"
        y1="21"
        y2="14"
      />
      <line
        x1="4"
        x2="4"
        y1="10"
        y2="3"
      />
      <line
        x1="12"
        x2="12"
        y1="21"
        y2="12"
      />
      <line
        x1="12"
        x2="12"
        y1="8"
        y2="3"
      />
      <line
        x1="20"
        x2="20"
        y1="21"
        y2="16"
      />
      <line
        x1="20"
        x2="20"
        y1="12"
        y2="3"
      />
      <line
        x1="1"
        x2="7"
        y1="14"
        y2="14"
      />
      <line
        x1="9"
        x2="15"
        y1="8"
        y2="8"
      />
      <line
        x1="17"
        x2="23"
        y1="16"
        y2="16"
      />
    </template>
    <template v-else-if="name === 'key'">
      <circle
        cx="7.5"
        cy="15.5"
        r="5.5"
      />
      <path d="m21 2-9.6 9.6" />
      <path d="m15.5 7.5 3 3L22 7l-3-3" />
    </template>
    <template v-else-if="name === 'terminal'">
      <polyline points="4 17 10 11 4 5" />
      <line
        x1="12"
        x2="20"
        y1="19"
        y2="19"
      />
    </template>
    <template v-else-if="name === 'history'">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect
        height="14"
        rx="2"
        ry="2"
        width="14"
        x="8"
        y="8"
      />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </template>
    <template v-else-if="name === 'check-circle'">
      <circle
        cx="12"
        cy="12"
        r="10"
      />
      <path d="m9 12 2 2 4-4" />
    </template>
    <template v-else-if="name === 'alert-triangle'">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </template>
    <template v-else-if="name === 'x-circle'">
      <circle
        cx="12"
        cy="12"
        r="10"
      />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </template>
    <template v-else-if="name === 'x'">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'inbox'">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </template>
  </svg>
</template>

<script setup lang="ts">
export type AppIconName =
  | 'search'
  | 'refresh'
  | 'pin'
  | 'pin-filled'
  | 'external-link'
  | 'git-branch'
  | 'git-merge'
  | 'folder-git'
  | 'star'
  | 'check'
  | 'arrow-right'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'chevron-down'
  | 'sliders'
  | 'key'
  | 'terminal'
  | 'history'
  | 'copy'
  | 'check-circle'
  | 'alert-triangle'
  | 'x-circle'
  | 'x'
  | 'minus'
  | 'inbox'

withDefaults(
  defineProps<{
    name: AppIconName
    size?: number
    strokeWidth?: number
  }>(),
  {
    size: 14,
    strokeWidth: 1.8,
  },
)
</script>

<style scoped>
.app-icon {
  display: inline-block;
  flex: 0 0 auto;
  vertical-align: middle;
}
</style>
