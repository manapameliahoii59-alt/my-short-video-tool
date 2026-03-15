import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import path, { join } from "node:path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import fs from "node:fs";
import axios from "axios";
import AdmZip from "adm-zip";
import FormData from "form-data";
import { runAutoTask } from "./newAutoWorkTask";
import xlsx from "xlsx"; // 确保顶部有引入 xlsx
import { autoUpdater } from "electron-updater";

// 🌟 引入唯一的初始化配置模版
import DEFAULT_CONFIG from "./config";

// --- 1. 路径定义逻辑 ---

const getAppRootDir = () => {
  return is.dev ? process.cwd() : path.dirname(app.getPath("exe"));
};

const DATA_ROOT = join(getAppRootDir(), "data");
const PROFILES_DIR = join(DATA_ROOT, "profiles_data");
const USER_DATA_PATH = join(DATA_ROOT, "user-data.json");

// 确保环境文件夹存在
if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
if (!fs.existsSync(PROFILES_DIR))
  fs.mkdirSync(PROFILES_DIR, { recursive: true });

// 内存中的用户配置数据
let userData = {};
// 🌟 用于全局保存前端的发送通道，确保更新进度能准确发给界面
let globalUiSender = null;

// --- 2. 核心数据操作函数 ---

/**
 * 加载并合并配置文件
 */
function loadUserData() {
  if (fs.existsSync(USER_DATA_PATH)) {
    try {
      const content = fs.readFileSync(USER_DATA_PATH, "utf-8");
      const parsedData = JSON.parse(content);

      // 🌟 核心：将“出厂默认设置”与“本地存储数据”合并
      // 这样即便以后增加了新功能/新字段，旧用户的 JSON 也会自动补全结构
      userData = { ...DEFAULT_CONFIG, ...parsedData };
      console.log("📖 [系统] 配置文件读取成功，结构已对齐最新规范");
    } catch (e) {
      console.error("❌ 读取配置文件失败:", e);
      userData = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
  } else {
    // 首次运行，直接克隆默认配置
    userData = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    saveUserData();
    console.log("🌱 [系统] 首次运行，已创建初始配置文件");
  }
}

/**
 * 持久化保存数据到本地磁盘
 */
function saveUserData() {
  try {
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2));
  } catch (e) {
    console.error("❌ 配置文件保存失败:", e);
  }
}

// --- 3. 窗口管理 ---

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1050,
    height: 750,
    show: false,
    title: "短视频助手 v1.0",
    autoHideMenuBar: true,
    ...(process.platform === "linux"
      ? { icon: join(__dirname, "../../build/icon.png") }
      : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    // 🌟 启动时将完整的 userData 发送给前端 App.vue
    mainWindow.webContents.send("init-settings", userData);
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

// --- 4. App 生命周期控制 ---

app.whenReady().then(() => {
  loadUserData(); // 优先加载配置

  electronApp.setAppUserModelId("com.electron");
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  // ==========================================
  // 🌟🌟🌟 新增：自动更新核心逻辑 🌟🌟🌟
  // ==========================================
  autoUpdater.setFeedURL("http://129.204.86.63:3535/updates");
  autoUpdater.autoDownload = false; // 关闭自动下载，让用户自己决定

  // 封装发消息给界面的小工具
  const sendUpdateMessage = (payload) => {
    if (globalUiSender) {
      globalUiSender.send("update-message", payload);
    } else {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0)
        windows[0].webContents.send("update-message", payload);
    }
  };

  autoUpdater.on("checking-for-update", () => {
    console.log("🔄 正在检查更新...");
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`✨ 发现新版本: v${info.version}`);
    sendUpdateMessage({
      type: "available",
      version: info.version,
      msg: `发现新版本 v${info.version}，是否立即在后台下载？`,
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendUpdateMessage({ type: "latest", msg: "当前已经是最新版本！" });
  });

  autoUpdater.on("download-progress", (progressObj) => {
    sendUpdateMessage({
      type: "downloading",
      percent: Math.round(progressObj.percent),
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendUpdateMessage({
      type: "downloaded",
      msg: "🚀 新版本下载完成，是否立即重启以完成安装？",
    });
  });

  autoUpdater.on("error", (err) => {
    //err.message
    sendUpdateMessage({ type: "error", msg: `更新失败` });
  });

  // 接收前端检查更新的指令
  ipcMain.on("check-for-updates", (event) => {
    globalUiSender = event.sender; // 记住是哪个窗口发起的检查
    autoUpdater.checkForUpdates();
  });

  // 接收前端同意下载的指令
  ipcMain.on("confirm-download", () => {
    autoUpdater.downloadUpdate();
  });

  // 接收前端同意重启安装的指令
  ipcMain.on("confirm-install", () => {
    autoUpdater.quitAndInstall();
  });
  // ==========================================
  // 🌟🌟🌟 自动更新逻辑结束 🌟🌟🌟
  // ==========================================

  // --- 5. IPC 通信监听 ---

  // 选择文件对话框
  ipcMain.handle("dialog:openFile", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
    });
    return canceled ? null : filePaths[0];
  });

  // 物理导入文件到方案目录
  ipcMain.handle(
    "import-profile-file",
    async (event, { profileName, sourcePath }) => {
      try {
        if (!profileName) throw new Error("请先输入或选择方案名称");
        const targetFolder = join(PROFILES_DIR, profileName);
        if (!fs.existsSync(targetFolder))
          fs.mkdirSync(targetFolder, { recursive: true });

        const fileName = path.basename(sourcePath);
        const targetPath = join(targetFolder, fileName);
        fs.copyFileSync(sourcePath, targetPath);

        return { success: true, fileName: fileName };
      } catch (err) {
        return { success: false, msg: err.message };
      }
    },
  );

  // 打开方案所在的物理文件夹
  ipcMain.on("open-profile-folder", (event, profileName) => {
    const folderPath = profileName
      ? join(PROFILES_DIR, profileName)
      : PROFILES_DIR;
    shell.openPath(fs.existsSync(folderPath) ? folderPath : PROFILES_DIR);
  });

  // 删除方案物理目录
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

  // 支持动态拼接物理路径的文件打开操作
  ipcMain.handle("open-file-external", async (event, payload) => {
    try {
      let targetPath = payload;

      // 如果前端传过来的是一个对象（包含了方案名和文件名）
      if (typeof payload === "object" && payload !== null) {
        // 动态拼凑出文件的真实绝对路径
        targetPath = join(PROFILES_DIR, payload.profileName, payload.fileName);
      }

      const errorMessage = await shell.openPath(targetPath);
      if (errorMessage) return { success: false, msg: errorMessage };
      return { success: true };
    } catch (err) {
      return { success: false, msg: err.message };
    }
  });

  // 更新方案列表
  ipcMain.on("update-profiles", (event, profiles) => {
    userData.profiles = profiles;
    saveUserData();
  });

  // 保存系统全局设置 (映射扁平数据到嵌套结构)
  ipcMain.on("save-settings-only", (event, flatData) => {
    // 映射回嵌套结构
    userData.KEY_CONFIG.userKey = flatData.userKey;
    userData.WORKING_CONFIG = {
      account: flatData.workingAccount, // 已修正拼写
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
    // 保存账号匹配数
    if (!userData.SETTINGS) userData.SETTINGS = {};
    userData.SETTINGS.ACCOUNT_MATCH_COUNT = flatData.accountMatchCount;
    saveUserData();
  });

  // 保存 Token 等会话信息
  ipcMain.on("save-session-persistent", (event, sessionData) => {
    userData.session = sessionData;
    saveUserData();
  });

  // 【核心任务执行】
  ipcMain.on("run-task", async (event, uiConfig) => {
    globalUiSender = event.sender; // 也可以顺便更新一下发送通道
    userData.lastConfig = uiConfig;
    saveUserData();

    const RUNTIME_CONFIG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

    // 基础鉴权注入
    RUNTIME_CONFIG.KEY_CONFIG.userKey = uiConfig.userKey;
    RUNTIME_CONFIG.WORKING_CONFIG = {
      account: uiConfig.workingAccount,
      password: uiConfig.workingPassword,
    };

    // 1. 拼接全局剧单的绝对路径
    RUNTIME_CONFIG.FILES.DRAMA_LIST = join(
      PROFILES_DIR,
      "global_assets",
      uiConfig.globalDramaList,
    );

    // 2. 组装所有被选中的方案队列
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

    // 3. 其他全局变量同步
    RUNTIME_CONFIG.FILES.PAGE_NUM = uiConfig.pageNum ?? 1;
    RUNTIME_CONFIG.FILES.PROJECT_NUM = uiConfig.projectNum ?? 1;
    RUNTIME_CONFIG.FILES.ADS_NUM = uiConfig.adsNum ?? 1;
    RUNTIME_CONFIG.FILES.isAccountFlat = uiConfig.isAccountFlat ?? false;
    RUNTIME_CONFIG.FILES.dateRange = uiConfig.dateRange || "";
    RUNTIME_CONFIG.SETTINGS.ACTION = uiConfig.action;

    if (!RUNTIME_CONFIG.SETTINGS) RUNTIME_CONFIG.SETTINGS = {};
    RUNTIME_CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT =
      uiConfig.accountMatchCount ?? 2;

    RUNTIME_CONFIG.session = userData.session;

    try {
      await runAutoTask(event.sender, RUNTIME_CONFIG);
      event.sender.send(
        "log-update",
        "🎉 [系统] 队列内所有方案自动化流程执行完毕。",
      );
    } catch (err) {
      event.sender.send("log-update", `❌ [程序异常] ${err.message}`);
    }
  });

  // --- 6. 云端逻辑 ---
  ipcMain.handle(
    "cloud:save-profiles",
    async (event, { userKey, profiles }) => {
      try {
        const zip = new AdmZip();
        if (fs.existsSync(PROFILES_DIR))
          zip.addLocalFolder(PROFILES_DIR, "profiles_data");
        zip.addFile(
          "profiles_config.json",
          Buffer.from(JSON.stringify(profiles), "utf8"),
        );

        const zipBuffer = zip.toBuffer();
        const form = new FormData();
        form.append("license_key", userKey);
        form.append("backup_file", zipBuffer, {
          filename: `backup_${userKey}.zip`,
          contentType: "application/zip",
        });

        const headers = form.getHeaders();
        headers["Content-Length"] = form.getLengthSync();

        const response = await axios.post(
          "http://129.204.86.63:3535/api/profiles/save",
          form,
          {
            headers,
            timeout: 60000,
            maxBodyLength: Infinity,
            maxContentLength: Infinity,
          },
        );

        return response.data;
      } catch (error) {
        const serverDetail = error.response?.data?.msg || error.message;
        return { status: "error", msg: "备份失败: " + serverDetail };
      }
    },
  );

  ipcMain.handle("cloud:get-profiles", async (event, userKey) => {
    try {
      const response = await axios.get(
        `http://129.204.86.63:3535/api/profiles/get?license_key=${userKey}`,
        {
          responseType: "arraybuffer",
          timeout: 60000,
        },
      );

      const contentType = response.headers["content-type"];
      if (contentType && contentType.includes("application/json")) {
        return JSON.parse(Buffer.from(response.data).toString("utf8"));
      }

      const zip = new AdmZip(Buffer.from(response.data));
      zip.extractAllTo(DATA_ROOT, true);

      const configPath = join(DATA_ROOT, "profiles_config.json");
      let profilesData = {};
      if (fs.existsSync(configPath)) {
        profilesData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        fs.unlinkSync(configPath);
      }
      return { status: "ok", data: profilesData };
    } catch (error) {
      return { status: "error", msg: "下载失败: " + error.message };
    }
  });

  ipcMain.handle("dialog:showMessage", async (event, options) => {
    const result = await dialog.showMessageBox(
      BrowserWindow.fromWebContents(event.sender),
      options,
    );
    return result.response;
  });

  ipcMain.handle("download-drama-template", async (event) => {
    try {
      // 动态获取当前发出请求的窗口实例
      const win = BrowserWindow.fromWebContents(event.sender);

      // 弹出保存文件对话框，并绑定到当前窗口
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "保存全局剧单模板",
        defaultPath: "全局剧单_标准模板.xlsx",
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }],
      });

      if (canceled || !filePath) {
        return { success: false, msg: "取消下载" };
      }

      // 使用精准表头
      const headers = [
        "版权",
        "产品ID",
        "产品名称",
        "素材名称",
        "素材个数",
        "指定素材",
        "新建项目数",
        "新建广告数",
        "素材文件名称",
      ];

      // 将表头转换为 Excel 数据格式
      const worksheet = xlsx.utils.aoa_to_sheet([headers]);

      // 优化列宽
      worksheet["!cols"] = [
        { wch: 10 }, // 版权
        { wch: 15 }, // 产品ID
        { wch: 20 }, // 产品名称
        { wch: 20 }, // 素材名称
        { wch: 10 }, // 素材个数
        { wch: 25 }, // 指定素材
        { wch: 12 }, // 新建项目数
        { wch: 12 }, // 新建广告数
        { wch: 25 }, // 素材文件名称
      ];

      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");

      // 写入到用户选择的路径
      xlsx.writeFile(workbook, filePath);

      return { success: true, filePath };
    } catch (error) {
      console.error("生成模板失败:", error);
      return { success: false, msg: error.message };
    }
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
