/// <reference types="vite/client" />

interface Window {
  ipcRenderer?: import("electron").IpcRenderer & {
    /** preload 额外注入的只读平台标识（win32/darwin/...） */
    platform?: NodeJS.Platform;
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
