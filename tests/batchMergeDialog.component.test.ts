import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BatchMergeConfirmDialog from '../src/renderer/components/BatchMergeConfirmDialog.vue'

describe('BatchMergeConfirmDialog', () => {
  const originalIpc = (globalThis as any).window?.ipcRenderer

  beforeEach(() => {
    (globalThis as any).window.ipcRenderer = {
      on: vi.fn(),
      off: vi.fn(),
      invoke: vi.fn(),
    }
  })

  afterEach(() => {
    (globalThis as any).window.ipcRenderer = originalIpc
  })

  it('点击确认会触发 run 并发出 run-finish', async () => {
    const run = vi.fn().mockResolvedValue({
      ok: true,
      merged: [{ source: 'feat', target: 'main' }],
      conflicts: [],
      noop: [],
      failures: [],
    })

    const wrapper = mount(BatchMergeConfirmDialog, {
      attachTo: document.body,
      props: {
        show: true,
        repo: 'org/repo',
        sourceBranches: ['feat'],
        targetCount: 2,
        logLines: [],
        run,
      },
    })

    await nextTick()

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '确认',
    )
    expect(confirmBtn).toBeTruthy()
    ;(confirmBtn as HTMLButtonElement).click()

    for (let i = 0; i < 8; i++) {
      await nextTick()
      await Promise.resolve()
    }

    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('org/repo', ['feat'])
    expect(wrapper.emitted('run-finish')).toBeTruthy()
    expect(wrapper.emitted('run-finish')![0]?.[0]).toEqual({
      ok: true,
      merged: [{ source: 'feat', target: 'main' }],
      conflicts: [],
      noop: [],
      failures: [],
    })

    wrapper.unmount()
  })

  it('repo 为空时点击确认不会触发 run', async () => {
    const run = vi.fn().mockResolvedValue(null)

    const wrapper = mount(BatchMergeConfirmDialog, {
      attachTo: document.body,
      props: {
        show: true,
        repo: '',
        sourceBranches: ['feat'],
        targetCount: 1,
        logLines: [],
        run,
      },
    })

    await nextTick()

    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(
      (b) => (b.textContent || '').trim() === '确认',
    )
    expect(confirmBtn).toBeTruthy()
    ;(confirmBtn as HTMLButtonElement).click()

    for (let i = 0; i < 4; i++) {
      await nextTick()
      await Promise.resolve()
    }

    expect(run).not.toHaveBeenCalled()
    expect(wrapper.emitted('run-finish')).toBeFalsy()

    wrapper.unmount()
  })
})

describe('BatchMergeConfirmDialog 目标标签可移除与合并历史', () => {
  const originalIpc2 = (globalThis as any).window?.ipcRenderer

  beforeEach(() => {
    (globalThis as any).window.ipcRenderer = {
      on: vi.fn(),
      off: vi.fn(),
      invoke: vi.fn(),
    }
  })

  afterEach(() => {
    (globalThis as any).window.ipcRenderer = originalIpc2
  })

  it('点击目标标签的关闭按钮 emit remove-target', async () => {
    const run = vi.fn()
    const wrapper = mount(BatchMergeConfirmDialog, {
      attachTo: document.body,
      props: {
        show: true,
        repo: 'org/repo',
        sourceBranches: ['feat'],
        targetCount: 2,
        targetBranches: ['dev', 'test'],
        logLines: [],
        run,
      },
    })
    await nextTick()

    const closeBtns = document.body.querySelectorAll(
      '.n-tag .n-base-close',
    )
    expect(closeBtns.length).toBe(2)
    ;(closeBtns[0] as HTMLElement).click()
    await nextTick()

    expect(wrapper.emitted('remove-target')).toBeTruthy()
    expect(wrapper.emitted('remove-target')![0][0]).toBe('dev')
    wrapper.unmount()
  })

  it('展示当前仓库的上次合并记录与最近历史', async () => {
    const now = Date.now()
    const run = vi.fn()
    const wrapper = mount(BatchMergeConfirmDialog, {
      attachTo: document.body,
      props: {
        show: true,
        repo: 'org/repo',
        sourceBranches: ['feat'],
        targetCount: 1,
        targetBranches: ['dev'],
        logLines: [],
        run,
        history: [
          { ts: now - 3_600_000, repo: 'org/repo', source: 'feat', targets: ['dev', 'test'], ok: true, merged: 2, conflicts: 0, failures: 0, noop: 0 },
          { ts: now - 86_400_000, repo: 'org/repo', source: 'fix', targets: ['dev'], ok: false, merged: 0, conflicts: 1, failures: 0, noop: 0 },
          { ts: now - 7_200_000, repo: 'org/other', source: 'x', targets: ['y'], ok: true, merged: 1, conflicts: 0, failures: 0, noop: 0 },
        ],
      },
    })
    await nextTick()

    const text = document.body.textContent || ''
    expect(text).toContain('上次合并：1 小时前 · feat → dev、test · 成功 2 / 冲突 0 / 失败 0')
    expect(text).toContain('该仓库最近 2 次合并')
    expect(text).toContain('1 天前 · fix → dev（成功 0 / 冲突 1 / 失败 0）')
    // 其他仓库的记录不展示
    expect(text).not.toContain('org/other')
    wrapper.unmount()
  })

  it('无历史记录时不显示上次合并文案', async () => {
    const run = vi.fn()
    const wrapper = mount(BatchMergeConfirmDialog, {
      attachTo: document.body,
      props: {
        show: true,
        repo: 'org/repo',
        sourceBranches: ['feat'],
        targetCount: 1,
        targetBranches: ['dev'],
        logLines: [],
        run,
        history: [],
      },
    })
    await nextTick()

    const text = document.body.textContent || ''
    expect(text).not.toContain('上次合并')
    expect(text).not.toContain('次合并')
    wrapper.unmount()
  })
})
