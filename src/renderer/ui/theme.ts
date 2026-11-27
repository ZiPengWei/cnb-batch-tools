import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { GlobalThemeOverrides } from 'naive-ui'

export type ThemeMode = 'system' | 'dark' | 'light'

export const THEME_MODE_STORAGE_KEY = 'cnb-theme-mode'

const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei UI', 'Segoe UI', system-ui, sans-serif"
const FONT_MONO =
  "'JetBrains Mono', 'SF Mono', ui-monospace, 'Cascadia Code', Menlo, Monaco, Consolas, monospace"

/**
 * 深色主题：曜石青蓝（Obsidian & Electric Cyan）
 * 冷调深曜石画布 + 发丝细边框 + 澄澈电光青主色，与成功绿/琥珀警告彻底解耦。
 */
export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily: FONT_SANS,
    fontFamilyMono: FONT_MONO,
    fontSize: '13px',
    fontSizeSmall: '12px',
    fontSizeMedium: '13px',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    primaryColor: '#0EA5E9',
    primaryColorHover: '#38BDF8',
    primaryColorPressed: '#0284C7',
    primaryColorSuppl: '#38BDF8',
    infoColor: '#38BDF8',
    infoColorHover: '#7DD3FC',
    infoColorPressed: '#0284C7',
    successColor: '#22C55E',
    successColorHover: '#4ADE80',
    successColorPressed: '#16A34A',
    warningColor: '#F59E0B',
    warningColorHover: '#FBBF24',
    warningColorPressed: '#D97706',
    errorColor: '#F43F5E',
    errorColorHover: '#FB7185',
    errorColorPressed: '#E11D48',
    bodyColor: '#0C0E12',
    cardColor: '#12151C',
    modalColor: '#151922',
    popoverColor: '#181D27',
    tableColor: '#12151C',
    inputColor: '#0B0D12',
    inputColorDisabled: '#10131A',
    actionColor: '#171B24',
    hoverColor: 'rgba(148, 163, 184, 0.1)',
    borderColor: 'rgba(148, 163, 184, 0.14)',
    dividerColor: 'rgba(148, 163, 184, 0.11)',
    textColorBase: '#ECEFF4',
    textColor1: '#ECEFF4',
    textColor2: '#CBD5E1',
    textColor3: '#7C8BA1',
    placeholderColor: '#5B6980',
    boxShadow1: '0 2px 8px rgba(0, 0, 0, 0.35)',
    boxShadow2: '0 10px 30px rgba(0, 0, 0, 0.5)',
    boxShadow3: '0 18px 48px rgba(0, 0, 0, 0.62)',
  },
  Button: {
    heightMedium: '32px',
    paddingMedium: '0 13px',
    borderRadiusMedium: '7px',
    fontWeight: '500',
    textColorPrimary: '#04121C',
    textColorHoverPrimary: '#04121C',
    textColorPressedPrimary: '#04121C',
    textColorFocusPrimary: '#04121C',
    textColorDisabledPrimary: 'rgba(236, 239, 244, 0.45)',
    colorPrimary: '#38BDF8',
    colorHoverPrimary: '#7DD3FC',
    colorPressedPrimary: '#0EA5E9',
    colorFocusPrimary: '#38BDF8',
    borderPrimary: '1px solid rgba(125, 211, 252, 0.35)',
    borderHoverPrimary: '1px solid rgba(186, 230, 253, 0.55)',
    borderPressedPrimary: '1px solid rgba(56, 189, 248, 0.4)',
    color: 'rgba(255, 255, 255, 0.04)',
    colorHover: 'rgba(255, 255, 255, 0.08)',
    colorPressed: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderHover: '1px solid rgba(148, 163, 184, 0.34)',
  },
  Input: {
    heightMedium: '32px',
    borderRadius: '7px',
    color: '#0B0D12',
    colorFocus: '#0D1017',
    border: '1px solid rgba(148, 163, 184, 0.14)',
    borderHover: '1px solid rgba(148, 163, 184, 0.28)',
    borderFocus: '1px solid #38BDF8',
    boxShadowFocus: '0 0 0 2px rgba(56, 189, 248, 0.18)',
    caretColor: '#38BDF8',
    fontSizeMedium: '13px',
  },
  Select: {
    peers: {
      InternalSelection: {
        heightMedium: '30px',
        borderRadius: '7px',
        color: '#0B0D12',
        border: '1px solid rgba(148, 163, 184, 0.16)',
        borderHover: '1px solid rgba(148, 163, 184, 0.3)',
        borderActive: '1px solid #38BDF8',
        boxShadowActive: '0 0 0 2px rgba(56, 189, 248, 0.18)',
        fontSizeMedium: '12px',
      },
      InternalSelectMenu: {
        color: '#181D27',
        borderRadius: '8px',
        optionColorActive: 'rgba(56, 189, 248, 0.14)',
        optionColorPending: 'rgba(148, 163, 184, 0.1)',
      },
    },
  },
  Radio: {
    buttonBorderRadius: '6px',
    buttonHeightMedium: '30px',
    buttonColor: '#0B0D12',
    buttonColorActive: 'rgba(56, 189, 248, 0.14)',
    buttonBorderColor: 'rgba(148, 163, 184, 0.16)',
    buttonBorderColorActive: 'rgba(56, 189, 248, 0.5)',
    buttonTextColor: '#94A3B8',
    buttonTextColorHover: '#ECEFF4',
    buttonTextColorActive: '#7DD3FC',
    buttonBoxShadowFocus: '0 0 0 2px rgba(56, 189, 248, 0.2)',
  },
  Popover: {
    color: '#181D27',
    borderRadius: '10px',
    padding: '14px',
    boxShadow: '0 14px 38px rgba(0, 0, 0, 0.56), 0 0 0 1px rgba(148, 163, 184, 0.14)',
  },
  Dialog: {
    color: '#151922',
    borderRadius: '12px',
    padding: '20px 22px 18px',
    titleFontSize: '15px',
    titleFontWeight: '600',
    titleTextColor: '#ECEFF4',
    textColor: '#CBD5E1',
    iconColor: '#38BDF8',
    border: '1px solid rgba(148, 163, 184, 0.16)',
  },
  Tag: {
    borderRadius: '6px',
    heightMedium: '24px',
    fontSizeMedium: '12px',
    colorBordered: 'rgba(148, 163, 184, 0.1)',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    colorPrimary: 'rgba(56, 189, 248, 0.14)',
    borderPrimary: '1px solid rgba(56, 189, 248, 0.34)',
    textColorPrimary: '#7DD3FC',
    colorSuccess: 'rgba(34, 197, 94, 0.14)',
    borderSuccess: '1px solid rgba(34, 197, 94, 0.32)',
    textColorSuccess: '#4ADE80',
    colorWarning: 'rgba(245, 158, 11, 0.14)',
    borderWarning: '1px solid rgba(245, 158, 11, 0.32)',
    textColorWarning: '#FBBF24',
    colorError: 'rgba(244, 63, 94, 0.14)',
    borderError: '1px solid rgba(244, 63, 94, 0.32)',
    textColorError: '#FB7185',
  },
  Alert: {
    borderRadius: '8px',
    padding: '10px 12px',
    colorWarning: 'rgba(245, 158, 11, 0.09)',
    borderWarning: '1px solid rgba(245, 158, 11, 0.25)',
    contentTextColorWarning: '#FDE68A',
    iconColorWarning: '#F59E0B',
  },
  Log: {
    fontSize: '12px',
    lineHeight: '1.55',
    loaderTextColor: '#7C8BA1',
  },
  Progress: {
    railColor: 'rgba(148, 163, 184, 0.14)',
    fillColor: '#38BDF8',
  },
}

/**
 * 浅色主题：云岩微雾（Cloud Slate & Ocean Cobalt）
 * 冷白微灰画布 + 纯白工作台面板 + 沉稳海洋钴蓝，高对比度且柔和护眼。
 */
export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    fontFamily: FONT_SANS,
    fontFamilyMono: FONT_MONO,
    fontSize: '13px',
    fontSizeSmall: '12px',
    fontSizeMedium: '13px',
    borderRadius: '8px',
    borderRadiusSmall: '6px',
    primaryColor: '#0284C7',
    primaryColorHover: '#0369A1',
    primaryColorPressed: '#075985',
    primaryColorSuppl: '#0EA5E9',
    infoColor: '#0284C7',
    infoColorHover: '#0369A1',
    infoColorPressed: '#075985',
    successColor: '#16A34A',
    successColorHover: '#15803D',
    successColorPressed: '#166534',
    warningColor: '#D97706',
    warningColorHover: '#B45309',
    warningColorPressed: '#92400E',
    errorColor: '#E11D48',
    errorColorHover: '#BE123C',
    errorColorPressed: '#9F1239',
    bodyColor: '#F4F6F9',
    cardColor: '#FFFFFF',
    modalColor: '#FFFFFF',
    popoverColor: '#FFFFFF',
    tableColor: '#FFFFFF',
    inputColor: '#F8FAFC',
    inputColorDisabled: '#F1F5F9',
    actionColor: '#F8FAFC',
    hoverColor: 'rgba(15, 23, 42, 0.05)',
    borderColor: '#E2E8F0',
    dividerColor: '#E2E8F0',
    textColorBase: '#0F172A',
    textColor1: '#0F172A',
    textColor2: '#334155',
    textColor3: '#64748B',
    placeholderColor: '#94A3B8',
    boxShadow1: '0 1px 3px rgba(15, 23, 42, 0.06)',
    boxShadow2: '0 8px 24px rgba(15, 23, 42, 0.1)',
    boxShadow3: '0 16px 40px rgba(15, 23, 42, 0.14)',
  },
  Button: {
    heightMedium: '32px',
    paddingMedium: '0 13px',
    borderRadiusMedium: '7px',
    fontWeight: '500',
    color: '#FFFFFF',
    colorHover: '#F8FAFC',
    colorPressed: '#F1F5F9',
    border: '1px solid #CBD5E1',
    borderHover: '1px solid #94A3B8',
  },
  Input: {
    heightMedium: '32px',
    borderRadius: '7px',
    color: '#F8FAFC',
    colorFocus: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderHover: '1px solid #CBD5E1',
    borderFocus: '1px solid #0284C7',
    boxShadowFocus: '0 0 0 2px rgba(2, 132, 199, 0.14)',
    caretColor: '#0284C7',
    fontSizeMedium: '13px',
  },
  Select: {
    peers: {
      InternalSelection: {
        heightMedium: '30px',
        borderRadius: '7px',
        color: '#F8FAFC',
        border: '1px solid #E2E8F0',
        borderHover: '1px solid #CBD5E1',
        borderActive: '1px solid #0284C7',
        boxShadowActive: '0 0 0 2px rgba(2, 132, 199, 0.14)',
        fontSizeMedium: '12px',
      },
    },
  },
  Radio: {
    buttonBorderRadius: '6px',
    buttonHeightMedium: '30px',
    buttonColor: '#F8FAFC',
    buttonColorActive: 'rgba(2, 132, 199, 0.1)',
    buttonBorderColor: '#E2E8F0',
    buttonBorderColorActive: '#0284C7',
    buttonTextColor: '#475569',
    buttonTextColorHover: '#0F172A',
    buttonTextColorActive: '#0369A1',
  },
  Popover: {
    color: '#FFFFFF',
    borderRadius: '10px',
    padding: '14px',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.06)',
  },
  Dialog: {
    color: '#FFFFFF',
    borderRadius: '12px',
    padding: '20px 22px 18px',
    titleFontSize: '15px',
    titleFontWeight: '600',
    titleTextColor: '#0F172A',
    textColor: '#334155',
    iconColor: '#0284C7',
    border: '1px solid #E2E8F0',
  },
  Tag: {
    borderRadius: '6px',
    heightMedium: '24px',
    fontSizeMedium: '12px',
    colorBordered: '#F1F5F9',
    border: '1px solid #E2E8F0',
    colorPrimary: 'rgba(2, 132, 199, 0.09)',
    borderPrimary: '1px solid rgba(2, 132, 199, 0.26)',
    textColorPrimary: '#0369A1',
    colorSuccess: 'rgba(22, 163, 74, 0.09)',
    borderSuccess: '1px solid rgba(22, 163, 74, 0.25)',
    textColorSuccess: '#15803D',
    colorWarning: 'rgba(217, 119, 6, 0.1)',
    borderWarning: '1px solid rgba(217, 119, 6, 0.26)',
    textColorWarning: '#B45309',
    colorError: 'rgba(225, 29, 72, 0.09)',
    borderError: '1px solid rgba(225, 29, 72, 0.24)',
    textColorError: '#BE123C',
  },
  Alert: {
    borderRadius: '8px',
    padding: '10px 12px',
    colorWarning: '#FFFBEB',
    borderWarning: '1px solid #FDE68A',
    contentTextColorWarning: '#92400E',
    iconColorWarning: '#D97706',
  },
  Log: {
    fontSize: '12px',
    lineHeight: '1.55',
  },
  Progress: {
    railColor: '#E2E8F0',
    fillColor: '#0284C7',
  },
}

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(THEME_MODE_STORAGE_KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    /* ignore */
  }
  return 'system'
}

function applyDocumentTheme(dark: boolean) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function useTheme() {
  const mode = ref<ThemeMode>(readStoredMode())
  let switchTimer: ReturnType<typeof setTimeout> | null = null
  const media =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: dark)')
      : null
  const systemDark = ref<boolean>(media?.matches ?? false)

  const isDark = computed(() => {
    if (mode.value === 'dark') return true
    if (mode.value === 'light') return false
    return systemDark.value
  })

  const themeOverrides = computed(() =>
    isDark.value ? darkThemeOverrides : lightThemeOverrides,
  )

  function triggerSmoothThemeTransition() {
    if (typeof document === 'undefined') return
    document.documentElement.classList.add('wb-theme-switching')
    if (switchTimer) clearTimeout(switchTimer)
    switchTimer = setTimeout(() => {
      document.documentElement.classList.remove('wb-theme-switching')
      switchTimer = null
    }, 240)
  }

  function setMode(next: ThemeMode) {
    triggerSmoothThemeTransition()
    mode.value = next
    try {
      localStorage.setItem(THEME_MODE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }

  function cycleMode() {
    const order: ThemeMode[] = ['system', 'dark', 'light']
    const idx = order.indexOf(mode.value)
    setMode(order[(idx + 1) % order.length])
  }

  const onMediaChange = (e: MediaQueryListEvent) => {
    systemDark.value = e.matches
  }

  onMounted(() => {
    media?.addEventListener?.('change', onMediaChange)
  })

  onUnmounted(() => {
    media?.removeEventListener?.('change', onMediaChange)
    if (switchTimer) {
      clearTimeout(switchTimer)
      switchTimer = null
    }
    if (typeof document !== 'undefined') {
      document.documentElement.classList.remove('wb-theme-switching')
    }
  })

  watch(isDark, (dark) => applyDocumentTheme(dark), { immediate: true })

  return {
    mode,
    isDark,
    themeOverrides,
    setMode,
    cycleMode,
  }
}
