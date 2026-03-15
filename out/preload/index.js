"use strict";
const electron = require("electron");
const api = {
  // --- 基础文件操作 ---
  openFile: () => electron.ipcRenderer.invoke("dialog:openFile"),
  openExternal: (path) => electron.ipcRenderer.invoke("open-file-external", path),
  // 🌟 新增：物理导入文件到方案专属目录
  importFile: (data) => electron.ipcRenderer.invoke("import-profile-file", data),
  // 🌟 新增：打开方案或数据文件夹
  openProfileFolder: (name) => electron.ipcRenderer.send("open-profile-folder", name),
  // 🌟 新增：获取拖拽文件的真实本地路径 (突破 Electron 27+ 安全限制)
  getFilePath: (file) => electron.webUtils.getPathForFile(file),
  // --- 任务控制 ---
  runTask: (config) => electron.ipcRenderer.send("run-task", config),
  stopTask: () => electron.ipcRenderer.send("stop-task"),
  // 🌟 新增停止发信
  // 🌟 新增：监听任务运行状态的变化
  onTaskStatusChange: (callback) => {
    const sub = (_event, val) => callback(val);
    electron.ipcRenderer.on("task-status-change", sub);
    return () => electron.ipcRenderer.removeListener("task-status-change", sub);
  },
  // --- 方案与设置管理 ---
  updateProfiles: (profiles) => electron.ipcRenderer.send("update-profiles", profiles),
  // 🌟 修复：将 saveSettingsOnly 改为 saveSettings，匹配 App.vue 的调用
  saveSettings: (config) => electron.ipcRenderer.send("save-settings-only", config),
  deleteProfileFolder: (profileName) => electron.ipcRenderer.invoke("delete-profile-folder", profileName),
  // --- 云端同步 ---
  cloudSave: (data) => electron.ipcRenderer.invoke("cloud:save-profiles", data),
  cloudGet: (key) => electron.ipcRenderer.invoke("cloud:get-profiles", key),
  // --- 系统弹窗 ---
  showMessage: (options) => electron.ipcRenderer.invoke("dialog:showMessage", options),
  // --- 监听器 (主进程 -> 渲染进程) ---
  onLogUpdate: (callback) => {
    const sub = (_event, val) => callback(val);
    electron.ipcRenderer.on("log-update", sub);
    return () => electron.ipcRenderer.removeListener("log-update", sub);
  },
  onInitSettings: (callback) => {
    const sub = (_event, val) => callback(val);
    electron.ipcRenderer.on("init-settings", sub);
    return () => electron.ipcRenderer.removeListener("init-settings", sub);
  },
  downloadDramaTemplate: () => electron.ipcRenderer.invoke("download-drama-template"),
  //更新控制接口
  checkForUpdates: () => electron.ipcRenderer.send("check-for-updates"),
  confirmDownload: () => electron.ipcRenderer.send("confirm-download"),
  confirmInstall: () => electron.ipcRenderer.send("confirm-install"),
  //接收更新进度的监听器
  onUpdateMessage: (callback) => {
    electron.ipcRenderer.on("update-message", (event, data) => callback(data));
  },
  openStorageDir: () => electron.ipcRenderer.send("open-storage-dir")
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.api = api;
}
