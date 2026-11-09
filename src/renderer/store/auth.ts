import { acceptHMRUpdate, defineStore } from 'pinia'
import { clearAuth, setAuth, webLogin } from '../ipc/bridge'
import { useProjectsStore } from './projects'

const isE2E =
  (import.meta as any).env?.VITE_E2E === '1' ||
  String((import.meta as any).env?.MODE || '').toLowerCase() === 'e2e'

export const CNB_AUTH_STORAGE_KEY = 'cnb-auth'

const COOKIE_BASE_URL = 'https://cnb.cool'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    baseUrl: 'https://api.cnb.cool',
    token: '',
    /** cnb.cool 网页会话 Cookie（网页登录后获得，用于置顶同步或 Cookie 模式认证） */
    webCookie: '',
    /** 认证模式：token=访问令牌，cookie=网页登录（无需令牌） */
    mode: 'token' as 'token' | 'cookie',
    rememberToken: false,
    connected: false,
    userName: '',
    error: '',
    busy: false,
    loggingIn: false,
  }),
  actions: {
    async loadLocal() {
      try {
        const raw = localStorage.getItem(CNB_AUTH_STORAGE_KEY)
        if (raw) {
          const data = JSON.parse(raw) as any
          if (typeof data.baseUrl === 'string') this.baseUrl = data.baseUrl
          if (typeof data.token === 'string') this.token = data.token
          if (typeof data.webCookie === 'string') this.webCookie = data.webCookie
          if (data.mode === 'cookie' || data.mode === 'token') this.mode = data.mode
          if (typeof data.rememberToken === 'boolean') this.rememberToken = data.rememberToken
        }
      } catch {}
      if (isE2E) {
        this.connected = true
        this.userName = 'E2E'
        const projects = useProjectsStore()
        projects.loadProjects()
        return
      }
      // 有已保存的凭证时静默重连，恢复登录状态
      // （macOS 关窗重开 / 应用重启后不再回到登录页）
      await this.restoreSession()
    },
    /**
     * 静默重连：用已持久化的凭证向主进程重新认证并恢复 connected 状态。
     * 成功则恢复用户名并加载仓库列表；失败则静默保持未连接（凭证保留，用户可手动重试）。
     */
    async restoreSession() {
      if (this.connected) return
      const hasCredentials =
        this.mode === 'cookie' ? Boolean(this.webCookie) : Boolean(this.token)
      if (!hasCredentials) return
      this.busy = true
      try {
        const res = await setAuth({
          baseUrl: this.baseUrl,
          token: this.token,
          webCookie: this.webCookie,
          mode: this.mode,
        })
        if (res?.ok) {
          this.connected = true
          this.userName = res.user?.nickname || res.user?.username || ''
          const projects = useProjectsStore()
          projects.loadProjects()
        }
      } catch {
        /* 静默失败：网络异常等场景不打扰用户 */
      } finally {
        this.busy = false
      }
    },
    saveLocal() {
      // 网页登录（Cookie 模式）始终记住会话，不受"保存登录状态"控制；
      // "保存登录状态"仅对访问令牌生效。
      if (this.mode === 'cookie') {
        localStorage.setItem(
          CNB_AUTH_STORAGE_KEY,
          JSON.stringify({
            baseUrl: this.baseUrl,
            token: '',
            webCookie: this.webCookie,
            mode: this.mode,
            rememberToken: this.rememberToken,
          }),
        )
        return
      }
      if (!this.rememberToken) {
        localStorage.removeItem(CNB_AUTH_STORAGE_KEY)
        return
      }
      localStorage.setItem(
        CNB_AUTH_STORAGE_KEY,
        JSON.stringify({
          baseUrl: this.baseUrl,
          token: this.token,
          webCookie: this.webCookie,
          mode: this.mode,
          rememberToken: this.rememberToken,
        }),
      )
    },
    /** 应用内网页登录：弹出 CNB 登录窗口，成功后以 Cookie 模式连接（无需令牌） */
    async loginViaWeb(forceFresh = false) {
      this.error = ''
      this.loggingIn = true
      try {
        const res = await webLogin({ forceFresh })
        if (!res.ok) {
          if (res.error !== '登录窗口已关闭') this.error = res.error
          return false
        }
        this.webCookie = res.cookie
        this.mode = 'cookie'
        this.baseUrl = COOKIE_BASE_URL
        this.token = ''
        this.saveLocal()
        const r = await setAuth({
          baseUrl: COOKIE_BASE_URL,
          token: '',
          webCookie: res.cookie,
          mode: 'cookie',
        })
        if (r?.ok) {
          this.connected = true
          this.userName =
            r.user?.nickname || r.user?.username || res.user?.nickname || res.user?.username || ''
          const projects = useProjectsStore()
          projects.loadProjects()
          return true
        }
        this.connected = false
        this.error = r?.error?.message || '网页登录会话验证失败'
        return false
      } catch (e) {
        this.error = String(e)
        return false
      } finally {
        this.loggingIn = false
      }
    },
    /**
     * 切换账号：弹出全新登录窗口（清空网页会话，不会自动复用上一次登录的账号）。
     * 切换期间保持当前账号状态不变；登录成功后才更新为新账号，
     * 关闭登录窗（取消）或登录失败则维持原状。
     */
    async switchAccount() {
      this.error = ''
      return this.loginViaWeb(true)
    },
    /**
     * 退出登录：清空本地持久化凭证与主进程认证，回到未连接状态。
     * 不清除 CNB 网页会话本身（partition），下次网页登录可能一键恢复，
     * 需彻底换号请使用"切换账号"（强制全新登录）。
     */
    async logout() {
      this.connected = false
      this.userName = ''
      this.error = ''
      this.token = ''
      this.webCookie = ''
      this.mode = 'token'
      this.rememberToken = false
      localStorage.removeItem(CNB_AUTH_STORAGE_KEY)
      try {
        await clearAuth()
      } catch {
        /* 主进程清理失败不阻塞本地退出 */
      }
    },
    async connect() {
      this.error = ''
      if (!this.baseUrl.trim() || !this.token.trim()) {
        this.error = '请输入 CNB API 地址和访问令牌'
        return
      }
      if (isE2E) {
        this.connected = true
        this.userName = 'E2E'
        const projects = useProjectsStore()
        projects.loadProjects()
        return
      }
      this.busy = true
      try {
        const res = await setAuth({
          baseUrl: this.baseUrl.trim(),
          token: this.token.trim(),
          webCookie: this.webCookie.trim(),
          mode: 'token',
        })
        if (res?.ok) {
          this.connected = true
          this.userName = res.user?.nickname || res.user?.username || ''
          this.saveLocal()
          const projects = useProjectsStore()
          projects.loadProjects()
        } else {
          this.connected = false
          this.error = res?.error?.message || '认证失败'
        }
      } catch (e) {
        this.connected = false
        this.error = String(e)
      } finally {
        this.busy = false
      }
    },
  },
})

// 开发模式下支持 store 热更新（否则 HMR 后仍复用旧 store 实例）
if (import.meta.hot) {
  acceptHMRUpdate(useAuthStore, import.meta.hot)
}
