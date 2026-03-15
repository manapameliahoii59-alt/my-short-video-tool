import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import path, { join } from "node:path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import fs from "node:fs";
import axios from "axios";
import AdmZip from "adm-zip";
import FormData from "form-data";
import { runAutoTask, stopAutoTask } from "./newAutoWorkTask";
import xlsx from "xlsx"; // 确保顶部有引入 xlsx
import { autoUpdater } from "electron-updater";

// 🌟 引入唯一的初始化配置模版
import DEFAULT_CONFIG from "./config";

// --- 🌟 搬家核心：定义 AppData 下的安全根目录 ---
const getAppRootDir = () => {
  // 自动指向 C:\Users\xxx\AppData\Roaming\你的项目名
  return app.getPath("userData");
};

// --- 🌟 重新定义所有子路径 ---
// 🌟 独特的文件夹与文件名
const DATA_ROOT = join(getAppRootDir(), "ZS_Assistant_Storage");
const PROFILES_DIR = join(DATA_ROOT, "profiles_records");
const USER_DATA_PATH = join(DATA_ROOT, "zs_user_config.json");

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
 * 加载配置
 */
function loadUserData() {
  if (fs.existsSync(USER_DATA_PATH)) {
    try {
      const content = fs.readFileSync(USER_DATA_PATH, "utf-8");
      const parsedData = JSON.parse(content);
      // 合并默认配置，确保结构对齐
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

/**
 * 保存配置
 */
function saveUserData() {
  try {
    fs.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2));
    console.log("💾 配置已安全同步至 AppData");
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
    title: `漫剧神器 v${app.getVersion()}`,
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

    // 1. 获取当前软件的真实版本号 (比如从 package.json 读到的 1.0.2)
    const currentVersion = app.getVersion();

    // 2. 核心逻辑：判断是不是更新后的首次打开
    let isFirstRunAfterUpdate = false;

    // 如果配置文件里存的版本号，跟当前版本号不一样，说明更新了！
    if (userData.lastAppVersion !== currentVersion) {
      isFirstRunAfterUpdate = true;

      // 更新内存中的版本号，并立刻写入硬盘 (这样下次打开两者就一样了，不会再弹窗)
      userData.lastAppVersion = currentVersion;
      saveUserData(); // 调用你现有的保存函数，写入 zs_user_config.json
    }

    // 🌟 启动时将完整的 userData 发送给前端 App.vue
    mainWindow.webContents.send("init-settings", {
      ...userData,
      appVersion: app.getVersion(),
      isUpdated: isFirstRunAfterUpdate, // 把“是否刚更新”的标记发给前端
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

  // 🌟 接收取消指令
  ipcMain.on("stop-task", (event) => {
    console.log("📥 主进程：接收到前端取消指令"); // 加一行 log 确认信号通了
    stopAutoTask();
    if (globalUiSender) {
      globalUiSender.send("log-update", "⚠️ 正在取消任务，请稍候..."); // 👈 修改文案
    }
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
      // 🌟 告诉前端：任务开始了，让按钮变成“停止”
      event.sender.send("task-status-change", true);

      await runAutoTask(event.sender, RUNTIME_CONFIG);
      event.sender.send(
        "log-update",
        "🎉 [系统] 队列内所有方案自动化流程执行完毕。",
      );
    } catch (err) {
      event.sender.send("log-update", `❌ [程序异常] ${err.message}`);
    } finally {
      // 🌟 告诉前端：任务结束了（不管是正常跑完、报错还是被中止），让按钮恢复“启动”
      event.sender.send("task-status-change", false);
    }
  });

  // --- 6. 云端逻辑 ---
  ipcMain.handle(
    "cloud:save-profiles",
    async (event, { userKey, profiles }) => {
      try {
        const zip = new AdmZip();
        if (fs.existsSync(PROFILES_DIR))
          zip.addLocalFolder(PROFILES_DIR, "profiles_records");
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

      // 🌟 1. 执行解压到 DATA_ROOT
      zip.extractAllTo(DATA_ROOT, true);

      // 🌟 2. 兼容性处理：如果云端包里叫 profiles_data，但我们现在叫 profiles_records
      // 我们检查一下是否解压出了“旧名字”的文件夹，如果是，把它改名为新名字
      const oldDirPath = join(DATA_ROOT, "profiles_data");
      if (fs.existsSync(oldDirPath) && oldDirPath !== PROFILES_DIR) {
        // 如果 profiles_records 已存在，先删除（或合并），这里简单处理为覆盖
        if (fs.existsSync(PROFILES_DIR)) {
          fs.rmSync(PROFILES_DIR, { recursive: true, force: true });
        }
        fs.renameSync(oldDirPath, PROFILES_DIR);
        console.log(
          "🚚 已自动将云端旧目录 profiles_data 更名为 profiles_records",
        );
      }

      const configPath = join(DATA_ROOT, "profiles_config.json");
      let profilesData = {};

      if (fs.existsSync(configPath)) {
        profilesData = JSON.parse(fs.readFileSync(configPath, "utf-8"));

        // 🌟 3. 核心修复：必须更新内存中的 userData 并写入 zs_user_config.json
        // 否则前端界面虽然拿到了数据，但下次重启软件，配置又会变回下载前的样子
        userData.profiles = profilesData;
        saveUserData();

        fs.unlinkSync(configPath);
      }

      // 返回给前端，触发界面刷新
      return { status: "ok", data: profilesData };
    } catch (error) {
      console.error("云端恢复失败:", error);
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

  // --- 下载剧单模板 (默认指向桌面) ---
  ipcMain.handle("download-drama-template", async (event) => {
    try {
      // 1. 获取当前窗口实例
      const win = BrowserWindow.fromWebContents(event.sender);

      // 2. 获取用户桌面路径并拼接默认文件名
      const desktopPath = app.getPath("desktop");
      const defaultPath = path.join(desktopPath, "全局剧单_标准模板.xlsx");

      // 3. 弹出保存对话框
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: "保存全局剧单模板",
        defaultPath: defaultPath, // 🌟 关键修改：默认位置设为桌面
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }],
      });

      // 4. 如果用户取消了保存
      if (canceled || !filePath) {
        return { success: false, msg: "取消下载" };
      }

      // 5. 准备 Excel 数据头
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

      // 6. 使用 xlsx 库生成表格
      // 将表头作为第一行
      const worksheet = xlsx.utils.aoa_to_sheet([headers]);

      // 7. 优化列宽 (wch 为字符宽度)
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

      // 8. 物理写入文件到用户选择的路径
      xlsx.writeFile(workbook, filePath);

      return { success: true, filePath };
    } catch (error) {
      console.error("❌ 生成模板失败:", error);
      return { success: false, msg: error.message };
    }
  });

  ipcMain.on("open-storage-dir", () => {
    // DATA_ROOT 是你之前定义的 AppData 存储路径
    shell.openPath(DATA_ROOT);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
