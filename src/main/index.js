import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import path, { join } from "node:path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import fs from "node:fs";
import axios from "axios";
import AdmZip from "adm-zip";
import FormData from "form-data";
import { runAutoTask, stopAutoTask } from "./newAutoWorkTask";
import xlsx from "xlsx"; 
import { autoUpdater } from "electron-updater";
import { getDateRangeByType,getTodayString,sleep,logData,ensureAuth } from './utils';
import DEFAULT_CONFIG from "./config";

const getAppRootDir = () => {
  return app.getPath("userData");
};

const DATA_ROOT = join(getAppRootDir(), "ZS_Assistant_Storage");
const PROFILES_DIR = join(DATA_ROOT, "profiles_records");
const USER_DATA_PATH = join(DATA_ROOT, "zs_user_config.json");

if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });

let userData = {};
let globalUiSender = null;
let autoFetchTimer = null; 



// --- 🌟 核心：爆款剧单抓取逻辑 (带 Token 鉴权版) ---
const fetchGoodDramasLogic = async (params) => {
  isFetchCancelled = false; // 每次启动前重置
  try {
    // 🌟 1. 自动鉴权：传入账号、密码和当前硬盘存的 session
    const authRes = await ensureAuth(
      userData.WORKING_CONFIG?.account,
      userData.WORKING_CONFIG?.password,
      userData.session
    );

    if (!authRes.success) {
      return { success: false, msg: authRes.msg };
    }

    // 🌟 2. 鉴权成功！如果是新登录的，把新 session 永久保存进配置文件
    if (authRes.session.time !== userData.session?.time) {
      userData.session = authRes.session;
      saveUserData(); // 写入 zs_user_config.json
    }

    const authHeaders = authRes.headers; // 拿到了可以直接用的 headers!

    const today = getTodayString();
    const { roiThreshold = 0.70, exportConfig, selectedProfiles, interval, ...restParams } = params || {};
    let allDramas = []; 
    let currentPage = 1;
    const MAX_PAGE_SIZE = 200; 
    let totalItems = 0;

    const cleanParams = Object.fromEntries(
      Object.entries(restParams).filter(([_, v]) => v !== null && v !== undefined)
    );

    do {
      if (isFetchCancelled) {
       console.log("🛑 收到中止指令，停止翻页");
       return { success: false, msg: 'CANCELLED' }; // 直接退出并返回取消状态
     }
      const queryObj = {
        bookInfo: '', promotionInfo: '', advertiserInfo: '', cdpProjectInfo: '', cdpPromotionInfo: '',
        bidType: 'NO_BID', linkType: 'IAP', copyrightType: '分销', carrier: 'link',
        startDay: today, endDay: today,
        'sortingFields[0].field': 'statCost', 'sortingFields[0].order': 'desc',
        pageNo: currentPage, pageSize: MAX_PAGE_SIZE, ...cleanParams 
      };

      const searchParams = new URLSearchParams(queryObj).toString();
      const url = `https://api.iocpx.com/adv-report-query/promotionDay/getLatestCostByDay?${searchParams}`;

      console.log(`[抓取中] 日期:${today} | 第 ${currentPage} 页...`);
      
      // 🌟 3. 发起抓取请求，直接塞入自动生成的 authHeaders
      const response = await axios.get(url, { 
        headers: authHeaders,
        timeout: 20000 
      });

      const list = response.data?.data?.list || [];
      totalItems = response.data?.data?.total || 0;
      allDramas.push(...list);

      if (allDramas.length >= totalItems || list.length === 0) break;
      currentPage++;
      await sleep(1000); 

    } while (true);

    console.log(`✅ 抓取结束。今日总条数: ${allDramas.length}`);

    const currentTime = new Date().toLocaleTimeString();
    const filteredGoodList = allDramas
      .filter(item => item.attributionBillingGameInAppRoi1day > roiThreshold)
      .map(item => ({
        bookName: item.bookName, roi: item.attributionBillingGameInAppRoi1day,
        cost: item.statCost || 0, fetchTime: currentTime
      }));
      const testList = filteredGoodList.slice(0, 1);

    return { success: true, data: testList, totalProcessed: allDramas.length };
    // return { success: true, data: filteredGoodList, totalProcessed: allDramas.length };

  } catch (error) {
    console.error("抓取异常:", error.message);
    return { success: false, msg: error.message };
  }
};

function loadUserData() {
  if (fs.existsSync(USER_DATA_PATH)) {
    try {
      const content = fs.readFileSync(USER_DATA_PATH, "utf-8");
      const parsedData = JSON.parse(content);
      userData = { ...DEFAULT_CONFIG, ...parsedData };
    } catch (e) {
      console.error("❌ 读取配置文件失败:", e);
      userData = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  } else {
    userData = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    saveUserData();
  }
}

function saveUserData() {
  try {
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2));
    console.log("💾 配置已安全同步至 AppData");
  } catch (e) {
    console.error("❌ 配置文件保存失败:", e);
  }
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    show: false,
    title: `漫剧神器 v${app.getVersion()}`,
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon: join(__dirname, "../../build/icon.png") } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    const currentVersion = app.getVersion();
    let isFirstRunAfterUpdate = false;

    if (userData.lastAppVersion !== currentVersion) {
      isFirstRunAfterUpdate = true;
      userData.lastAppVersion = currentVersion;
      saveUserData(); 
    }

    mainWindow.webContents.send("init-settings", {
      ...userData,
      appVersion: app.getVersion(),
      isUpdated: isFirstRunAfterUpdate, 
    });
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  loadUserData(); 

  electronApp.setAppUserModelId("com.electron");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  // ==========================================
  // 自动更新逻辑
  // ==========================================
  autoUpdater.setFeedURL("http://129.204.86.63:3535/updates");
  autoUpdater.autoDownload = false; 

  const sendUpdateMessage = (payload) => {
    if (globalUiSender) {
      globalUiSender.send("update-message", payload);
    } else {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) windows[0].webContents.send("update-message", payload);
    }
  };

  autoUpdater.on("checking-for-update", () => console.log("🔄 正在检查更新..."));
  autoUpdater.on("update-available", (info) => {
    sendUpdateMessage({ type: "available", version: info.version, msg: `发现新版本 v${info.version}` });
  });
  autoUpdater.on("update-not-available", () => {
    sendUpdateMessage({ type: "latest", msg: "当前已经是最新版本！" });
  });
  autoUpdater.on("download-progress", (progressObj) => {
    sendUpdateMessage({ type: "downloading", percent: Math.round(progressObj.percent) });
  });
  autoUpdater.on("update-downloaded", () => {
    sendUpdateMessage({ type: "downloaded", msg: "🚀 新版本下载完成" });
  });
  autoUpdater.on("error", () => {
    sendUpdateMessage({ type: "error", msg: `更新失败` });
  });

  ipcMain.on("check-for-updates", (event) => {
    globalUiSender = event.sender; 
    autoUpdater.checkForUpdates();
  });
  ipcMain.on("confirm-download", () => autoUpdater.downloadUpdate());
  ipcMain.on("confirm-install", () => autoUpdater.quitAndInstall());

  // ==========================================
  // 🌟🌟🌟 爆款抓取 IPC 监听 🌟🌟🌟
  // ==========================================

  ipcMain.handle("fetch-good-dramas", async (event, params) => {
    return await fetchGoodDramasLogic(params);
  });

ipcMain.on("start-auto-fetch", (event, config) => {
    globalUiSender = event.sender;
    
    // 每次启动前先清理旧的定时器
    if (autoFetchTimer) clearInterval(autoFetchTimer);
    
    const intervalMs = config.interval * 60 * 1000; 

    const executeRoutine = async () => {
      event.sender.send("fetch-log-update", { type: 'success', msg: `[${new Date().toLocaleTimeString()}] 正在按条件执行后台自动巡航...` });
      
      const res = await fetchGoodDramasLogic(config);
      
      if (res.success && res.data.length > 0) {
        event.sender.send("fetch-log-update", { type: 'data', list: res.data });
        
        try {
          // 🚀 1. 后台生成一张带预设的 Excel 剧单
          const globalAssetsDir = join(PROFILES_DIR, "global_assets");
          if (!fs.existsSync(globalAssetsDir)) fs.mkdirSync(globalAssetsDir, { recursive: true });
          
          const excelName = `Auto_Dramas_${Date.now()}.xlsx`;
          const excelPath = join(globalAssetsDir, excelName);

          // 🌟 提取前端传过来的预设配置，如果没有则给默认兜底值
          const exportConf = config.exportConfig || { copyright: "ZZ番茄", materialCount: 30 };

          const headers = ["版权", "产品ID", "产品名称", "素材名称", "素材个数", "指定素材", "新建项目数", "新建广告数", "素材文件名称"];
          const rows = [headers];
          
          res.data.forEach(item => {
            // 🌟 把预设数据填入对应的列里，项目数和广告数默认给 1
            rows.push([
              exportConf.copyright,        // [0] 版权
              "",                          // [1] 产品ID
              item.bookName,               // [2] 产品名称 (剧名)
              "",                          // [3] 素材名称
              exportConf.materialCount,    // [4] 素材个数
              "",                          // [5] 指定素材
              1,                           // [6] 新建项目数 (写死默认 1)
              1,                           // [7] 新建广告数 (写死默认 1)
              ""                           // [8] 素材文件名称
            ]);
          });

          const ws = xlsx.utils.aoa_to_sheet(rows);
          
          // 🌟 设置列宽，防止剧名太长被折叠看不清
          ws['!cols'] = [
            { wch: 12 }, // [0] 版权
            { wch: 12 }, // [1] 产品ID
            { wch: 35 }, // [2] 产品名称 (⭐加宽)
            { wch: 15 }, // [3] 素材名称
            { wch: 10 }, // [4] 素材个数
            { wch: 15 }, // [5] 指定素材
            { wch: 12 }, // [6] 新建项目数
            { wch: 12 }, // [7] 新建广告数
            { wch: 20 }, // [8] 素材文件名称
          ];

          const wb = xlsx.utils.book_new();
          xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
          xlsx.writeFile(wb, excelPath);

          event.sender.send("fetch-log-update", { type: 'success', msg: `发现 ${res.data.length} 个爆款，已应用预设并生成内部剧单，准备触发自动化上剧...` });

          // 🚀 2. 自动组装运行任务配置 
          const RUNTIME_CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
          RUNTIME_CONFIG.KEY_CONFIG.userKey = userData.KEY_CONFIG?.userKey || "";
          RUNTIME_CONFIG.WORKING_CONFIG = userData.WORKING_CONFIG || {};
          RUNTIME_CONFIG.FILES.DRAMA_LIST = excelPath;
          
          // 🌟 把 session 传过去，防止 runAutoTask 重复登录被踢下线
          RUNTIME_CONFIG.session = userData.session; 
          
          // 🌟 核心修正：一定要接收前端传来的方案列表，并进行过滤！
          const chosenProfiles = config.selectedProfiles || [];
          
          RUNTIME_CONFIG.SELECTED_PROFILES = Object.keys(userData.profiles || {})
            .filter(profileName => chosenProfiles.includes(profileName)) // 👈 必须加上这一行！只保留打钩的方案
            .map(profileName => {
              const profileFolder = join(PROFILES_DIR, profileName);
              const pData = userData.profiles[profileName];
              return {
                name: profileName,
                businessType: pData.businessType,
                TEMPLATE: join(profileFolder, pData.files.TEMPLATE),
                ACCOUNTS: join(profileFolder, pData.files.ACCOUNTS),
              };
            });

          RUNTIME_CONFIG.SETTINGS.ACTION = "publish";

          // 🚀 3. 直接执行核心任务函数
          event.sender.send("task-status-change", true);
          await runAutoTask(event.sender, RUNTIME_CONFIG);
          
          event.sender.send("fetch-log-update", { type: 'success', msg: `🎉 本轮爆款跟进任务执行完毕！` });
          
        } catch (autoErr) {
          event.sender.send("fetch-log-update", { type: 'error', msg: `自动上剧执行失败: ${autoErr.message}` });
        } finally {
          event.sender.send("task-status-change", false);
        }

      } else if (res.success && res.data.length === 0) {
        event.sender.send("fetch-log-update", { type: 'success', msg: `[${new Date().toLocaleTimeString()}] 本次巡航未发现 ROI > ${config.roiThreshold || 0.7} 的爆款` });
      } else if (res.msg !== 'CANCELLED') {
        // 如果是中途取消引发的退出，不报红字错误
        event.sender.send("fetch-log-update", { type: 'error', msg: '后台巡航抓取失败: ' + res.msg });
      }
    };

    executeRoutine(); // 收到指令后立刻先跑一次
    autoFetchTimer = setInterval(executeRoutine, intervalMs); // 随后按定时器循环跑
    event.sender.send("fetch-log-update", { type: 'status', isRunning: true });
  });

// 3. 停止自动巡航
  ipcMain.on("stop-auto-fetch", (event) => {
    // 1. 清除下一轮的定时器
    if (autoFetchTimer) {
      clearInterval(autoFetchTimer);
      autoFetchTimer = null;
    }
    
    // 🌟 2. 核心修复 1：强行阻断当前正在执行的【自动化上剧】任务！
    stopAutoTask();

    // 🌟 2. 核心修复 2：同时强行阻断可能正在进行的【接口翻页抓取】任务！
    isFetchCancelled = true; 
    
    event.sender.send("fetch-log-update", { type: 'status', isRunning: false });
    event.sender.send("fetch-log-update", { 
      type: 'success', 
      msg: '🛑 已向后台发送停止指令，所有抓取和上剧任务将被中止！' 
    });
  });

  // ==========================================
  // 原有 IPC 通信监听
  // ==========================================

  ipcMain.handle("dialog:openFile", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle("import-profile-file", async (event, { profileName, sourcePath }) => {
      try {
        if (!profileName) throw new Error("请先输入或选择方案名称");
        const targetFolder = join(PROFILES_DIR, profileName);
        if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

        const fileName = path.basename(sourcePath);
        const targetPath = join(targetFolder, fileName);
        fs.copyFileSync(sourcePath, targetPath);

        return { success: true, fileName: fileName };
      } catch (err) {
        return { success: false, msg: err.message };
      }
  });

  ipcMain.on("open-profile-folder", (event, profileName) => {
    const folderPath = profileName ? join(PROFILES_DIR, profileName) : PROFILES_DIR;
    shell.openPath(fs.existsSync(folderPath) ? folderPath : PROFILES_DIR);
  });

  ipcMain.handle("delete-profile-folder", async (event, profileName) => {
    try {
      if (!profileName) return { success: false, msg: "方案名为空" };
      const targetDir = join(PROFILES_DIR, profileName);
      if (fs.existsSync(targetDir)) {
        await fs.promises.rm(targetDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });

  ipcMain.handle("open-file-external", async (event, payload) => {
    try {
      let targetPath = payload;
      if (typeof payload === "object" && payload !== null) {
        targetPath = join(PROFILES_DIR, payload.profileName, payload.fileName);
      }
      const errorMessage = await shell.openPath(targetPath);
      if (errorMessage) return { success: false, msg: errorMessage };
      return { success: true };
    } catch (err) {
      return { success: false, msg: err.message };
    }
  });

  ipcMain.on("update-profiles", (event, profiles) => {
    userData.profiles = profiles;
    saveUserData();
  });

  ipcMain.on("save-settings-only", (event, flatData) => {
    userData.KEY_CONFIG.userKey = flatData.userKey;
    userData.WORKING_CONFIG = {
      account: flatData.workingAccount, 
      password: flatData.workingPassword,
    };
    userData.FILES = {
      ...userData.FILES,
      globalDramaList: flatData.globalDramaList,
      PAGE_NUM: flatData.pageNum,
      PROJECT_NUM: flatData.projectNum,
      ADS_NUM: flatData.adsNum,
      isAccountFlat: flatData.isAccountFlat,
      dateRange: flatData.dateRange,
    };
    if (!userData.SETTINGS) userData.SETTINGS = {};
    userData.SETTINGS.ACCOUNT_MATCH_COUNT = flatData.accountMatchCount;
    saveUserData();
  });

  ipcMain.on("save-session-persistent", (event, sessionData) => {
    userData.session = sessionData;
    saveUserData();
  });

  ipcMain.on("stop-task", (event) => {
    stopAutoTask();
    if (globalUiSender) {
      globalUiSender.send("log-update", "⚠️ 正在取消任务，请稍候..."); 
    }
  });

  ipcMain.on("run-task", async (event, uiConfig) => {
    globalUiSender = event.sender; 
    userData.lastConfig = uiConfig;
    saveUserData();

    const RUNTIME_CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    RUNTIME_CONFIG.KEY_CONFIG.userKey = uiConfig.userKey;
    RUNTIME_CONFIG.WORKING_CONFIG = {
      account: uiConfig.workingAccount,
      password: uiConfig.workingPassword,
    };
    RUNTIME_CONFIG.FILES.DRAMA_LIST = join(PROFILES_DIR, "global_assets", uiConfig.globalDramaList);

    RUNTIME_CONFIG.SELECTED_PROFILES = uiConfig.selectedProfiles.map(
      (profileName) => {
        const profileFolder = join(PROFILES_DIR, profileName);
        const pData = userData.profiles[profileName];
        return {
          name: profileName,
          businessType: pData.businessType,
          TEMPLATE: join(profileFolder, pData.files.TEMPLATE),
          ACCOUNTS: join(profileFolder, pData.files.ACCOUNTS),
        };
      },
    );

    RUNTIME_CONFIG.FILES.PAGE_NUM = uiConfig.pageNum ?? 1;
    RUNTIME_CONFIG.FILES.PROJECT_NUM = uiConfig.projectNum ?? 1;
    RUNTIME_CONFIG.FILES.ADS_NUM = uiConfig.adsNum ?? 1;
    RUNTIME_CONFIG.FILES.isAccountFlat = uiConfig.isAccountFlat ?? false;
    RUNTIME_CONFIG.FILES.dateRange = uiConfig.dateRange || "";
    RUNTIME_CONFIG.SETTINGS.ACTION = uiConfig.action;

    if (!RUNTIME_CONFIG.SETTINGS) RUNTIME_CONFIG.SETTINGS = {};
    RUNTIME_CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT = uiConfig.accountMatchCount ?? 2;
    RUNTIME_CONFIG.session = userData.session;

    try {
      event.sender.send("task-status-change", true);
      await runAutoTask(event.sender, RUNTIME_CONFIG);
      event.sender.send("log-update", "🎉 [系统] 队列内所有方案自动化流程执行完毕。");
    } catch (err) {
      event.sender.send("log-update", `❌ [程序异常] ${err.message}`);
    } finally {
      event.sender.send("task-status-change", false);
    }
  });

  ipcMain.handle("cloud:save-profiles", async (event, { userKey, profiles }) => {
      try {
        const zip = new AdmZip();
        if (fs.existsSync(PROFILES_DIR)) zip.addLocalFolder(PROFILES_DIR, "profiles_records");
        zip.addFile("profiles_config.json", Buffer.from(JSON.stringify(profiles), "utf8"));

        const zipBuffer = zip.toBuffer();
        const form = new FormData();
        form.append("license_key", userKey);
        form.append("backup_file", zipBuffer, { filename: `backup_${userKey}.zip`, contentType: "application/zip" });

        const headers = form.getHeaders();
        headers["Content-Length"] = form.getLengthSync();

        const response = await axios.post("http://129.204.86.63:3535/api/profiles/save", form, {
            headers, timeout: 60000, maxBodyLength: Infinity, maxContentLength: Infinity
        });
        return response.data;
      } catch (error) {
        const serverDetail = error.response?.data?.msg || error.message;
        return { status: "error", msg: "备份失败: " + serverDetail };
      }
    }
  );

  ipcMain.handle("cloud:get-profiles", async (event, userKey) => {
    try {
      const response = await axios.get(`http://129.204.86.63:3535/api/profiles/get?license_key=${userKey}`, {
          responseType: "arraybuffer", timeout: 60000
      });

      const contentType = response.headers["content-type"];
      if (contentType && contentType.includes("application/json")) {
        return JSON.parse(Buffer.from(response.data).toString("utf8"));
      }

      const zip = new AdmZip(Buffer.from(response.data));
      zip.extractAllTo(DATA_ROOT, true);

      const oldDirPath = join(DATA_ROOT, "profiles_data");
      if (fs.existsSync(oldDirPath) && oldDirPath !== PROFILES_DIR) {
        if (fs.existsSync(PROFILES_DIR)) fs.rmSync(PROFILES_DIR, { recursive: true, force: true });
        fs.renameSync(oldDirPath, PROFILES_DIR);
      }

      const configPath = join(DATA_ROOT, "profiles_config.json");
      let profilesData = {};

      if (fs.existsSync(configPath)) {
        profilesData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        userData.profiles = profilesData;
        saveUserData();
        fs.unlinkSync(configPath);
      }
      return { status: "ok", data: profilesData };
    } catch (error) {
      return { status: "error", msg: "下载失败: " + error.message };
    }
  });

  ipcMain.handle("dialog:showMessage", async (event, options) => {
    const result = await dialog.showMessageBox(BrowserWindow.fromWebContents(event.sender), options);
    return result.response;
  });

  ipcMain.handle("download-drama-template", async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const desktopPath = app.getPath("desktop");
      const defaultPath = path.join(desktopPath, "全局剧单_标准模板.xlsx");

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "保存全局剧单模板",
        defaultPath: defaultPath, 
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }],
      });

      if (canceled || !filePath) return { success: false, msg: "取消下载" };

      const headers = ["版权", "产品ID", "产品名称", "素材名称", "素材个数", "指定素材", "新建项目数", "新建广告数", "素材文件名称"];
      const worksheet = xlsx.utils.aoa_to_sheet([headers]);

      worksheet["!cols"] = [
        { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
        { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 25 },
      ];

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      xlsx.writeFile(workbook, filePath);

      return { success: true, filePath };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });

  ipcMain.on("open-storage-dir", () => {
    shell.openPath(DATA_ROOT);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  // 🌟 新增：手动导出带有预设配置的剧单
  ipcMain.handle("export-dramas-excel", async (event, { dramas, config }) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      const defaultPath = path.join(app.getPath("desktop"), `爆款剧单_${getTodayString()}.xlsx`);

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "导出爆款剧单",
        defaultPath: defaultPath,
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }],
      });

      if (canceled || !filePath) return { success: false, msg: "取消下载" };

      // 组装带配置的 Excel 行
      const headers = ["版权", "产品ID", "产品名称", "素材名称", "素材个数", "指定素材", "新建项目数", "新建广告数", "素材文件名称"];
      const rows = [headers];
      
      dramas.forEach(item => {
        rows.push([
          config.copyright || "",         // 填入预设的版权
          "", 
          item.bookName, 
          "", 
          config.materialCount || 30,     // 填入素材个数
          "", 
          "",         // 填入项目数
          "",             // 填入广告数
          ""
        ]);
      });

      const ws = xlsx.utils.aoa_to_sheet(rows);
      // 🌟 新增：设置列宽 (wch 代表字符宽度，剧名设为 35，非常长)
      ws['!cols'] = [
        { wch: 12 }, // [0] 版权
        { wch: 12 }, // [1] 产品ID
        { wch: 35 }, // [2] 产品名称 (⭐加宽)
        { wch: 15 }, // [3] 素材名称
        { wch: 10 }, // [4] 素材个数
        { wch: 15 }, // [5] 指定素材
        { wch: 12 }, // [6] 新建项目数
        { wch: 12 }, // [7] 新建广告数
        { wch: 20 }, // [8] 素材文件名称
      ];
      const wb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
      xlsx.writeFile(wb, filePath);

      return { success: true, filePath };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });
});

let isFetchCancelled = false;
ipcMain.on("cancel-fetch-dramas", () => {
  isFetchCancelled = true;
});

// 定义基础地址（建议放在文件顶部，方便复用）
const BASE_SERVER_URL = "http://129.204.86.63:3535";

// 🌟 保存雷达配置 (本地 + 云端)
ipcMain.handle("save-fetch-settings", async (event, data) => {
  try {
    // 1. 保存到本地配置对象 (确保你的全局变量名是 userData)
    userData.fetchSettings = data;
    saveUserData(); 

    // 2. 获取当前卡密
    const userKey = userData.KEY_CONFIG?.userKey;

    if (userKey && userKey.trim() !== "") {
      // 拼接到你服务器上的新接口
      const saveUrl = `${BASE_SERVER_URL}/api/fetch-settings/save`;
      
      await axios.post(saveUrl, {
        license_key: userKey.trim(),
        settings: data
      }, { timeout: 5000 });
      
      console.log("✅ 雷达配置已成功同步至云端");
    }
    
    return { success: true };
  } catch (error) {
    console.error("❌ 保存配置时发生异常:", error.message);
    // 注意：即使云端同步失败，由于本地已经 saveUserData 了，
    // 这里也可以返回 success: true，或者返回 false 让前端提示
    return { success: false, msg: "本地已保存，但同步云端失败: " + error.message };
  }
});

// 🌟 读取雷达配置 (开机/切换页面时调用)
ipcMain.handle("get-fetch-settings", async () => {
  try {
    const userKey = userData.KEY_CONFIG?.userKey;

    if (userKey && userKey.trim() !== "") {
      const getUrl = `${BASE_SERVER_URL}/api/fetch-settings/get?license_key=${userKey.trim()}`;
      
      const response = await axios.get(getUrl, { timeout: 5000 });
      
      if (response.data.status === 'ok' && response.data.data) {
        // 同步服务器最新的配置到本地
        userData.fetchSettings = response.data.data;
        saveUserData();
        return { success: true, data: response.data.data };
      }
    }
    
    // 如果没有卡密或服务器没数据，回退读取本地
    return { success: true, data: userData.fetchSettings || null };
  } catch (error) {
    console.log("⚠️ 读取云端配置失败，使用本地缓存:", error.message);
    return { success: true, data: userData.fetchSettings || null };
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});