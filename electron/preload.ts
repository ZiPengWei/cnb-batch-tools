import { ipcRenderer, contextBridge } from "electron";

// --------- Expose some API to the Renderer process ---------
type AnyListener = (...args: any[]) => any;
type ListenerEntry = { wrapped: AnyListener; count: number };

const listenerMap = new Map<string, Map<AnyListener, ListenerEntry>>();

function getChannelMap(channel: string) {
  let m = listenerMap.get(channel);
  if (!m) {
    m = new Map();
    listenerMap.set(channel, m);
  }
  return m;
}

contextBridge.exposeInMainWorld("ipcRenderer", {
  // 只读平台标识（win32/darwin/...），供渲染层按平台显示设置项
  platform: process.platform,
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args;
    const ch = String(channel);
    const map = getChannelMap(ch);
    const origin = listener as any as AnyListener;
    const existing = map.get(origin);
    if (existing) {
      existing.count += 1;
      return ipcRenderer.on(ch, existing.wrapped as any);
    }
    const wrapped: AnyListener = (event: any, ...rest: any[]) =>
      origin(event, ...rest);
    map.set(origin, { wrapped, count: 1 });
    return ipcRenderer.on(ch, wrapped as any);
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, listener] = args as any;
    const ch = String(channel);
    if (!listener) return ipcRenderer.off(ch, listener as any);
    const map = getChannelMap(ch);
    const entry = map.get(listener as AnyListener);
    if (entry) {
      const res = ipcRenderer.off(ch, entry.wrapped as any);
      entry.count -= 1;
      if (entry.count <= 0) map.delete(listener as AnyListener);
      if (map.size === 0) listenerMap.delete(ch);
      return res;
    }
    return ipcRenderer.off(ch, listener as any);
  },
  removeAllListeners(channel: string) {
    const ch = String(channel);
    listenerMap.delete(ch);
    return (ipcRenderer as any).removeAllListeners?.(ch);
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },

  // You can expose other APTs you need here.
  // ...
});
