export interface HighlightSegment {
  text: string
  hit: boolean
}

export interface SplitRepoPath {
  namespace: string
  name: string
}

export type BranchTone = 'main' | 'env' | 'feat' | 'fix' | 'release' | 'default'

export type TargetProgressStatus =
  | 'pending'
  | 'running'
  | 'merged'
  | 'conflict'
  | 'noop'
  | 'failed'

export interface MergeProgressSnapshot {
  statuses: Record<string, TargetProgressStatus>
  completed: number
  total: number
  percent: number
}

export function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true
  let j = 0
  for (let i = 0; i < haystack.length && j < needle.length; i++) {
    if (haystack[i] === needle[j]) j++
  }
  return j === needle.length
}

export function matchesBranch(query: string, branch: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const s = branch.toLowerCase()
  if (s.includes(q)) return true
  return isSubsequence(q, s)
}

/**
 * 将 `org/sub/repo-name` 拆分为命名空间与主仓库名，
 * 避免长组织前缀把真正重要的仓库名截断。
 */
export function splitRepoPath(display: string): SplitRepoPath {
  const text = (display || '').trim()
  const idx = text.lastIndexOf('/')
  if (idx <= 0 || idx >= text.length - 1) {
    return { namespace: '', name: text }
  }
  return {
    namespace: text.slice(0, idx),
    name: text.slice(idx + 1),
  }
}

/**
 * 根据分支命名习惯识别克制的语义微色，帮助在长列表中一眼区分分支类型。
 */
export function getBranchTone(name: string): BranchTone {
  const lower = (name || '').trim().toLowerCase()
  if (!lower) return 'default'
  if (lower === 'main' || lower === 'master') return 'main'
  if (lower === 'dev' || lower === 'test' || lower === 'gray') return 'env'
  if (lower.startsWith('feat/') || lower.startsWith('feature/')) return 'feat'
  if (
    lower.startsWith('fix/') ||
    lower.startsWith('bugfix/') ||
    lower.startsWith('hotfix/')
  ) {
    return 'fix'
  }
  if (lower.startsWith('release/') || lower.startsWith('rel/')) return 'release'
  return 'default'
}

/**
 * 将文本按查询词切分为高亮/普通片段：
 * 优先高亮完整连续子串，其次高亮子序列命中的字符。
 */
export function buildHighlightSegments(
  text: string,
  query: string,
): HighlightSegment[] {
  const q = (query || '').trim().toLowerCase()
  if (!q || !text) return [{ text, hit: false }]

  const lower = text.toLowerCase()
  const subIdx = lower.indexOf(q)
  if (subIdx >= 0) {
    const out: HighlightSegment[] = []
    if (subIdx > 0) out.push({ text: text.slice(0, subIdx), hit: false })
    out.push({ text: text.slice(subIdx, subIdx + q.length), hit: true })
    if (subIdx + q.length < text.length) {
      out.push({ text: text.slice(subIdx + q.length), hit: false })
    }
    return out
  }

  const hits = new Set<number>()
  let j = 0
  for (let i = 0; i < lower.length && j < q.length; i++) {
    if (lower[i] === q[j]) {
      hits.add(i)
      j++
    }
  }
  if (j < q.length) return [{ text, hit: false }]

  const segments: HighlightSegment[] = []
  let curHit = hits.has(0)
  let buf = ''
  for (let i = 0; i < text.length; i++) {
    const isHit = hits.has(i)
    if (isHit !== curHit) {
      if (buf) segments.push({ text: buf, hit: curHit })
      buf = text[i]
      curHit = isHit
    } else {
      buf += text[i]
    }
  }
  if (buf) segments.push({ text: buf, hit: curHit })
  return segments
}

/**
 * 从实时合并日志流解析每个目标分支的当前进度状态，驱动弹窗实时状态点亮与进度条。
 */
export function parseMergeProgress(
  targets: string[],
  logLines: string[],
): MergeProgressSnapshot {
  const statuses: Record<string, TargetProgressStatus> = {}
  for (const t of targets) statuses[t] = 'pending'

  const total = targets.length
  if (!total) {
    return { statuses, completed: 0, total: 0, percent: 0 }
  }

  let matchedRealLog = false
  let e2eStep = 0
  let e2eTotal = 0

  const findTargetInLine = (line: string): string | null => {
    const arrowIdx = line.indexOf('->')
    if (arrowIdx < 0) return null
    const after = line.slice(arrowIdx + 2).trim()
    for (const t of targets) {
      if (
        after === t ||
        after.startsWith(`${t} `) ||
        after.startsWith(`${t}(`) ||
        after.startsWith(`${t}（`)
      ) {
        return t
      }
    }
    return null
  }

  for (const raw of logLines) {
    const line = raw || ''
    const e2eMatch = line.match(/E2E step\s+(\d+)\s*\/\s*(\d+)/)
    if (e2eMatch) {
      e2eStep = Number(e2eMatch[1]) || 0
      e2eTotal = Number(e2eMatch[2]) || 0
      continue
    }

    const target = findTargetInLine(line)
    if (!target) continue
    matchedRealLog = true

    if (line.startsWith('正在处理:') || line.startsWith('正在创建 PR:') || line.startsWith('无冲突，执行合并:')) {
      if (statuses[target] === 'pending') statuses[target] = 'running'
    } else if (line.startsWith('✓ 合并成功:') || line.startsWith('✓ PR 已被合并:')) {
      statuses[target] = 'merged'
    } else if (line.startsWith('✗ 检测到冲突')) {
      statuses[target] = 'conflict'
    } else if (line.startsWith('无变更，跳过:') || line.startsWith('无需合并（无变更）:')) {
      statuses[target] = 'noop'
    } else if (
      line.startsWith('创建 PR 失败:') ||
      line.startsWith('合并未完成:') ||
      line.startsWith('合并调用失败:') ||
      line.startsWith('处理失败:')
    ) {
      statuses[target] = 'failed'
    }
  }

  if (!matchedRealLog && e2eTotal > 0) {
    const ratio = Math.min(1, Math.max(0, e2eStep / e2eTotal))
    const doneCount = Math.floor(ratio * total)
    for (let i = 0; i < total; i++) {
      if (i < doneCount) statuses[targets[i]] = 'merged'
      else if (i === doneCount && ratio < 1) statuses[targets[i]] = 'running'
    }
    return {
      statuses,
      completed: doneCount,
      total,
      percent: Math.round(ratio * 100),
    }
  }

  let completed = 0
  let runningCount = 0
  for (const t of targets) {
    const st = statuses[t]
    if (st === 'merged' || st === 'conflict' || st === 'noop' || st === 'failed') {
      completed++
    } else if (st === 'running') {
      runningCount++
    }
  }

  const percent = Math.min(
    100,
    Math.round(((completed + runningCount * 0.45) / total) * 100),
  )

  return { statuses, completed, total, percent }
}
