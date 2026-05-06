// 🌟 1. 在这里增加引入 webUtils
import { contextBridge, ipcRenderer, webUtils } from "electron";

const api = {
  // --- 基础文件操作 ---
  openFile: () => ipcRenderer.invoke("dialog:openFile"),
  openExternal: (path) => ipcRenderer.invoke("open-file-external", path),

  // 🌟 新增：物理导入文件到方案专属目录
  importFile: (data) => ipcRenderer.invoke("import-profile-file", data),

  // 🌟 新增：打开方案或数据文件夹
  openProfileFolder: (name) => ipcRenderer.send("open-profile-folder", name),

  // 🌟 新增：获取拖拽文件的真实本地路径 (突破 Electron 27+ 安全限制)
  getFilePath: (file) => webUtils.getPathForFile(file),

  // --- 任务控制 ---
  runTask: (config) => ipcRenderer.send("run-task", config),
  stopTask: () => ipcRenderer.send("stop-task"), // 🌟 新增停止发信

  // 🌟 新增：监听任务运行状态的变化
  onTaskStatusChange: (callback) => {
    const sub = (_event, val) => callback(val);
    ipcRenderer.on("task-status-change", sub);
    return () => ipcRenderer.removeListener("task-status-change", sub);
  },

  // --- 方案与设置管理 ---
  updateProfiles: (profiles) => ipcRenderer.send("update-profiles", profiles),

  // 🌟 修复：将 saveSettingsOnly 改为 saveSettings，匹配 App.vue 的调用
  saveSettings: (config) => ipcRenderer.send("save-settings-only", config),

  deleteProfileFolder: (profileName) =>
    ipcRenderer.invoke("delete-profile-folder", profileName),
  renameProfileFolder: (payload) =>
    ipcRenderer.invoke("rename-profile-folder", payload),

  // --- 云端同步 ---
  cloudSave: (data) => ipcRenderer.invoke("cloud:save-profiles", data),
  cloudGet: (key) => ipcRenderer.invoke("cloud:get-profiles", key),
  /** 仅同步方案集 JSON：POST { account, profileSets } */
  saveProfileSetsRemote: (payload) => ipcRenderer.invoke("profile-sets:save-remote", payload),
  /** 仅拉取方案集：GET ?account= */
  getProfileSetsRemote: (account) => ipcRenderer.invoke("profile-sets:get-remote", account),

  // --- 系统弹窗 ---
  showMessage: (options) => ipcRenderer.invoke("dialog:showMessage", options),

  // --- 监听器 (主进程 -> 渲染进程) ---
  onLogUpdate: (callback) => {
    const sub = (_event, val) => callback(val);
    ipcRenderer.on("log-update", sub);
    return () => ipcRenderer.removeListener("log-update", sub);
  },
  onInitSettings: (callback) => {
    const sub = (_event, val) => callback(val);
    ipcRenderer.on("init-settings", sub);
    return () => ipcRenderer.removeListener("init-settings", sub);
  },
  reloadCurrentInstanceSettings: () =>
    ipcRenderer.invoke("settings:reload-current-instance"),
  downloadDramaTemplate: () => ipcRenderer.invoke("download-drama-template"),

  //更新控制接口
  checkForUpdates: () => ipcRenderer.send("check-for-updates"),
  confirmDownload: () => ipcRenderer.send("confirm-download"),
  confirmInstall: () => ipcRenderer.send("confirm-install"),

  //接收更新进度的监听器
  onUpdateMessage: (callback) => {
    ipcRenderer.on("update-message", (event, data) => callback(data));
  },
  openStorageDir: () => ipcRenderer.send("open-storage-dir"),
  // --- 爆款数据抓取 ---
  startAutoFetch: (config) => ipcRenderer.send("start-auto-fetch", config),
  stopAutoFetch: () => ipcRenderer.send("stop-auto-fetch"),
  onFetchLogUpdate: (callback) => {
    const sub = (_event, val) => callback(val);
    ipcRenderer.on("fetch-log-update", sub);
    return () => ipcRenderer.removeListener("fetch-log-update", sub);
  },
  exportDramasExcel: (payload) => ipcRenderer.invoke("export-dramas-excel", payload),
  fetchGoodDramas: (params) => ipcRenderer.invoke("fetch-good-dramas", params),
  cancelFetchDramas: () => ipcRenderer.send("cancel-fetch-dramas"), // 🌟 增加这一行
  saveFetchSettings: (data) => ipcRenderer.invoke("save-fetch-settings", data),
  getFetchSettings: () => ipcRenderer.invoke("get-fetch-settings"),
};

// 暴露接口到 window.api
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.api = api;
}
