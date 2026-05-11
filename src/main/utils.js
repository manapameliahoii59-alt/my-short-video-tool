/* eslint-disable */
import fs from "fs";
import path from "path";
import util from "util";
import crypto from "crypto";
import axios from "axios";
import xlsx from "xlsx";

// 👇 Node.js 内置模块
import os from "os";
import { execSync } from "child_process";

// --- 1. 环境与路径配置 ---
const isPkg = typeof process.pkg !== "undefined";
const rootDir = isPkg ? path.dirname(process.execPath) : process.cwd();

// --- 2. 基础工具函数 ---

/** 获取本地时间字符串 */
const getTime = () => new Date().toLocaleTimeString();

/** 随机延迟执行 */
// const randomSleep = (min, max) => {
//   const ms = Math.floor(Math.random() * (max - min + 1) + min);
//   return new Promise((resolve) => setTimeout(resolve, ms));
// };

// src/main/utils.js 推荐改法
const randomSleep = (min, max, getCancelStatus) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      // 🌟 每 100ms 检查一次是否点击了取消
      if (getCancelStatus && getCancelStatus()) {
        clearInterval(timer);
        resolve(true); // 被取消了
      }
      if (Date.now() - start >= ms) {
        clearInterval(timer);
        resolve(false); // 正常睡醒
      }
    }, 100);
  });
};

/** 清理字符串空格 */
function clearSpaces(str) {
  return str ? String(str).replace(/\s+/g, "") : "";
}

/** 智能分割字符串为数组（支持换行、中英文逗号） */
function smartSplit(str) {
  if (!str) return [];
  return String(str)
    .split(/[\n,、]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

// --- 3. 业务逻辑与授权核心 ---

/** 根据主体/价格进行匹配逻辑 */
function matchByInput(list, input) {
  
  const major = parseInt(input);
  if (isNaN(major) || !Array.isArray(list)) return null;

  const result = list
    .filter((item) => {
      const val = parseFloat(item.price || item.subject || 0);
      return Math.floor(val) === major;
    })
    .sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));

  return result.length > 0 ? result[0] : null;
}

/** * 获取本地唯一机器码 (稳定提取硬件级特征)
 */
function getMachineId() {
  try {
    // 首选方案：获取 Windows 底层的 BIOS/主板 UUID，极度稳定
    if (process.platform === "win32") {
      const stdout = execSync("wmic csproduct get uuid", { encoding: "utf8" });
      const lines = stdout
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length >= 2 && lines[1]) {
        // 用 md5 加密一下，防止出现乱码或特殊字符
        return crypto.createHash("md5").update(lines[1]).digest("hex");
      }
    }
  } catch (e) {
    // 如果 wmic 被用户电脑的安全软件拦截，静默失败，走兜底方案
  }

  // 兜底方案：使用 CPU型号 + 内存总大小 + 主机名 组合作为指纹
  const cpuModel = os.cpus()?.[0]?.model || "unknown_cpu";
  const hostname = os.hostname();
  const mem = os.totalmem();
  const rawId = `${cpuModel}_${hostname}_${mem}`;
  return crypto.createHash("md5").update(rawId).digest("hex");
}

// async function checkAuth(userKey, workingAccount) {
//   const SERVER_URL = "http://129.204.86.63:3535/api/verify";

//   if (!userKey || userKey.trim() === "") {
//     console.log("🚫 本地未配置卡密(userKey)，请检查 config.js");
//     return { status: -1, msg: "未配置卡密" };
//   }

//   // 🌟 前端提前拦截
//   if (!workingAccount || String(workingAccount).trim() === "") {
//     console.log("🚫 本地未配置主账号");
//     return { status: -1, msg: "请先在 [系统设置] 中填写【主账号】" };
//   }

//   // 抓取当前电脑的硬件机器码
//   const machineId = getMachineId();
//   try {
//     const response = await axios.post(
//       SERVER_URL,
//       {
//         license_key: userKey.trim(),
//         machine_id: machineId,
//         working_account: String(workingAccount).trim(),
//       },
//       { timeout: 8000 },
//     );

//     const resData = response.data;

//     if (resData.status === "ok") {
//       console.log(`\n🔑 授权验证通过: ${resData.msg}`);
//       // 🌟🌟🌟 核心修改：在这里把后端下发的时间参数提取出来一起返回！
//       // 如果后端没传这两个字段，默认就是 undefined，我们在调用方做好兼容就行
//       return {
//         status: 1,
//         msg: resData.msg,
//         minTime: resData.min_time, // 对应后端的字段名，请根据实际情况调整
//         maxTime: resData.max_time, // 对应后端的字段名，请根据实际情况调整
//       };
//     } else {
//       console.log(`\n🚫 授权被拦截: ${resData.msg}`);
//       return { status: -1, msg: resData.msg };
//     }
//   } catch (error) {
//     console.log(`\n🌐 网络异常，无法连接到验证服务器。`);
//     return { status: -1, msg: "无法连接验证服务器，请检查网络" };
//   }
// }

/** 验证服务器请求失败（超时、断网等）时最多尝试次数，含首次 */
const CHECK_AUTH_NETWORK_MAX_ATTEMPTS = 3;

/**
 * 权限验证 (对接全新计费网关 - 卡密+账号+密码绑定)
 * 网络异常时会自动重试（共最多 CHECK_AUTH_NETWORK_MAX_ATTEMPTS 次），业务拒绝不重试。
 * @param {string} userKey 授权卡密
 * @param {string} workingAccount 用户在界面填写的业务主账号
 * @param {string} workingPassword 业务主账号的密码 🌟新增
 */
async function checkAuth(userKey, workingAccount, workingPassword) {
  const SERVER_URL = "http://129.204.86.63:3535/api/verify";

  if (!userKey || userKey.trim() === "") {
    console.log("🚫 本地未配置卡密(userKey)，请检查 config.js");
    return { status: -1, msg: "未配置卡密" };
  }

  // 前端提前拦截
  if (!workingAccount || String(workingAccount).trim() === "") {
    console.log("🚫 本地未配置账号");
    return { status: -1, msg: "请先在 [系统设置] 中填写【账号】" };
  }

  // 🌟 对密码进行简易加密 (Base64编码，防肉眼明文识别和简单抓包)
  let encryptedPassword = "";
  if (workingPassword) {
    // 将明文密码转成 Base64 格式
    encryptedPassword = Buffer.from(String(workingPassword)).toString("base64");
  }

  const machineId = getMachineId();
  const postBody = {
    license_key: userKey.trim(),
    machine_id: machineId,
    working_account: String(workingAccount).trim(),
    working_password: encryptedPassword,
  };

  for (let attempt = 1; attempt <= CHECK_AUTH_NETWORK_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.post(SERVER_URL, postBody, { timeout: 8000 });

      const resData = response.data;

      if (resData.status === "ok") {
        console.log(`\n🔑 授权验证通过: ${resData.msg}`);
        return {
          status: 1,
          msg: resData.msg,
          minTime: resData.min_time,
          maxTime: resData.max_time,
        };
      }
      console.log(`\n🚫 授权被拦截: ${resData.msg}`);
      return { status: -1, msg: resData.msg };
    } catch (error) {
      console.log(
        `\n🌐 网络异常，无法连接到验证服务器。(第 ${attempt}/${CHECK_AUTH_NETWORK_MAX_ATTEMPTS} 次)`,
      );
      if (attempt < CHECK_AUTH_NETWORK_MAX_ATTEMPTS) {
        const delayMs = 1000 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      console.log(`\n🌐 网络异常，已重试仍无法连接到验证服务器。`);
      return { status: -1, msg: "无法连接验证服务器，请检查网络" };
    }
  }

  return { status: -1, msg: "无法连接验证服务器，请检查网络" };
}

/** 格式化打印数据解析结果 */
const logData = (data) => {
  const cleanData = data && data.status && data.config ? data.data : data;
  console.log(`\n🚀 [${getTime()}] 数据解析结果:`);
  console.log(
    util.inspect(cleanData, {
      showHidden: false,
      depth: null,
      colors: true,
      breakLength: 100,
    }),
  );
  console.log("-------------------------------------------\n");
};

/** 写入任务执行状态到 CSV */
const recordTaskStatus = (dramaInfo, configData, status, message = "") => {
  const statusFile = path.join(rootDir, "task_execution_log.csv");
  const timestamp = new Date().toLocaleString().replace(/,/g, "");

  if (!fs.existsSync(statusFile)) {
    const header = "\ufeff时间,剧名,主体,策略包,邮箱,版权,状态,详细信息\n";
    fs.writeFileSync(statusFile, header, "utf-8");
  }

  const row = [
    timestamp,
    dramaInfo.targetDramaName,
    configData.proConfig_subject,
    configData.proConfig_strategyId,
    configData.proConfig_email,
    configData.proConfig_copyright,
    status,
    message.replace(/[\r\n,]/g, " "),
  ]
    .map((item) => `"${item}"`)
    .join(",");

  fs.appendFileSync(statusFile, row + "\n", "utf-8");
};

/** 通用保存 JSON 或文本数据 */
const saveData = (fileName, data) => {
  try {
    const content =
      typeof data === "object" ? JSON.stringify(data, null, 2) : String(data);
    const filePath = path.join(rootDir, fileName);
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`✅ 数据已导出: ${filePath}`);
  } catch (error) {
    console.error("❌ 写入文件失败:", error);
  }
};

/**
 * 根据选项返回日期范围 (YYYY-MM-DD)
 * 如果 type 为空或无效，默认返回今日日期
 * @param {string} type - 选项标签名 (如 "昨天", "近七天" 等)
 * @returns {Object} { startDay: string, endDay: string }
 */
function getDateRangeByType(type) {
  const now = new Date();

  // 内部辅助：格式化日期为 YYYY-MM-DD
  const format = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  let start = new Date(now);
  let end = new Date(now);

  // 如果 type 为空，直接走默认逻辑返回今天
  if (type) {
    switch (type) {
      case "今天":
        // 保持默认
        break;
      case "昨天":
        start.setDate(now.getDate() - 1);
        end.setDate(now.getDate() - 1);
        break;
      case "近三天":
        start.setDate(now.getDate() - 2);
        break;
      case "近七天":
        start.setDate(now.getDate() - 6);
        break;
      case "近十五天":
        start.setDate(now.getDate() - 14);
        break;
      case "近一个月":
        start.setMonth(now.getMonth() - 1);
        break;
      case "本周":
        const day = now.getDay() || 7;
        start.setDate(now.getDate() - day + 1);
        break;
      case "本月":
        start.setDate(1);
        break;
      case "上个月":
        start.setMonth(now.getMonth() - 1);
        start.setDate(1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      default:
        // 匹配不到预设值时，也保持为今天
        break;
    }
  }

  return {
    startDay: format(start),
    endDay: format(end),
  };
}

// --- 5. Excel 缓存读取逻辑 ---

// 模块级缓存变量
let accountsCache = null;

const readRowsFromJsonPayload = (filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  return [];
};

const getNormalizedSidecarPath = (filePath) => `${filePath}.normalized.json`;

/** 导入时会生成 .normalized.json；用户若之后直接改 xlsx/csv，侧车会过期，应读源文件 */
function shouldReadFromSidecar(filePath, sidecarPath) {
  if (!fs.existsSync(sidecarPath)) return false;
  if (!fs.existsSync(filePath)) return true;
  try {
    return fs.statSync(filePath).mtimeMs <= fs.statSync(sidecarPath).mtimeMs;
  } catch {
    return true;
  }
}

function readTabularRows(filePath) {
  try {
    const sidecarPath = getNormalizedSidecarPath(filePath);
    if (shouldReadFromSidecar(filePath, sidecarPath)) {
      return readRowsFromJsonPayload(sidecarPath);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".json") {
      return readRowsFromJsonPayload(filePath);
    }

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  } catch (error) {
    console.error(`❌ 读取表格数据失败: ${error.message}`);
    return [];
  }
}

function readTabularHeaders(filePath) {
  try {
    const sidecarPath = getNormalizedSidecarPath(filePath);
    if (shouldReadFromSidecar(filePath, sidecarPath)) {
      const content = fs.readFileSync(sidecarPath, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed?.headers)) {
        return parsed.headers.map((v) => String(v).trim());
      }
      const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
      return rows[0] ? Object.keys(rows[0]) : [];
    }

    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".json") {
      const rows = readRowsFromJsonPayload(filePath);
      return rows[0] ? Object.keys(rows[0]) : [];
    }

    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return (xlsx.utils.sheet_to_json(sheet, { header: 1 })[0] || []).map((v) =>
      String(v).trim(),
    );
  } catch (_error) {
    return [];
  }
}

/**
 * 从内存或硬盘获取账号全量数据
 * @param {string} filePath 账号 Excel 的绝对路径
 */
function getCachedAccounts(filePath) {
  if (accountsCache) {
    return accountsCache;
  }

  console.log("📂 [工具类] 正在读取账号库文件到内存...");
  try {
    const rows = readTabularRows(filePath);
    accountsCache = rows;
    console.log(`✅ 账号库加载完毕，共 ${rows.length} 条记录。`);
    return rows;
  } catch (error) {
    console.error(`❌ 读取账号库失败: ${error.message}`);
    return [];
  }
}

/**
 * 清空账号缓存 (每次启动新任务前调用)
 */
function clearAccountsCache() {
  accountsCache = null;
}

/** 获取今日日期字符串 (YYYY-MM-DD) */
const getTodayString = () => {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** 基础睡眠函数 (Promise) */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- 🌟 新增：全局自动化公共鉴权服务 ---
/**
 * 确保获取有效的登录凭证 (支持缓存复用与静默重登)
 * @param {string} account 账号
 * @param {string} password 密码
 * @param {object} currentSession 当前内存/硬盘中的 session {token, time}
 * @param {string} baseUrl 接口基准地址
* @returns {Promise<object>} { success, session, headers, msg }
 */
async function ensureAuth(account, password, currentSession = null, baseUrl = "https://api.iocpx.com") {
  let sessionId = "";

  const authClient = axios.create({
    baseURL: baseUrl,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://console.iocpx.com",
      Referer: "https://console.iocpx.com/",
    },
  });

  // 1. 尝试复用缓存的 Token (6天内有效)
  if (currentSession?.token && Date.now() - (currentSession.time || 0) < 6 * 24 * 60 * 60 * 1000) {
    sessionId = currentSession.token;
    try {
      const testHeaders = {
        authorization: sessionId,
        cookie: `ocpx_session_id=${sessionId}`,
      };
      // 试探性请求
      let testAuthRes = await authClient.get("/merchant/auth/info", { headers: testHeaders });

      if (testAuthRes.data?.code == 1001000001) {
        console.log("🔄 [鉴权服务] 登录已过期, 准备重新登陆...");
        sessionId = "";
      } else {
        console.log("✅ [鉴权服务] 登录状态有效 (缓存复用)");
        // 激活模块
        await authClient.post("/merchant/auth/login2", { moduleId: 3 }, { headers: testHeaders });
        return { success: true, session: currentSession, headers: testHeaders };
      }
    } catch (err) {
      sessionId = "";
    }
  }

  // 2. 真正执行账号密码登录
  if (!sessionId) {
    console.log("🔐 [鉴权服务] 正在执行自动登录...");
    if (!account || !password) {
      return { success: false, msg: "未配置主账号或密码，请前往系统设置填写" };
    }

    try {
      const r1 = await authClient.post("/merchant/auth/login1", {
        email: account,
        password: password,
        rememberMe: true,
      });

      const setCookie = r1.headers["set-cookie"];
      if (!setCookie) throw new Error("未获取到 Cookie 信息");

      sessionId = setCookie
        .find((s) => s.startsWith("ocpx_session_id="))
        .split(";")[0]
        .split("=")[1];

      await authClient.post(
        "/merchant/auth/login2",
        { moduleId: 3 },
        { headers: { cookie: `ocpx_session_id=${sessionId}` } }
      );

      const newSession = { token: sessionId, time: Date.now() };
      const newHeaders = {
        authorization: sessionId,
        cookie: `ocpx_session_id=${sessionId}`,
      };

      console.log("✅ [鉴权服务] 账号密码自动登录成功！");
      return { success: true, session: newSession, headers: newHeaders };
    } catch (err) {
      console.error("❌ [鉴权服务] 登录失败:", err.message);
      return { success: false, msg: `登录失败: ${err.message}` };
    }
  }
}

// --- 自动化任务：账号匹配、素材名匹配、Excel 布局校验（不依赖任务内全局 CONFIG） ---

/**
 * 按模板行从账号库 Excel 行中筛选并随机抽取指定数量的「账号」列
 */
function pickAccountsForPublish(rows, targetConfig, businessType, matchCount) {
  if (!Array.isArray(rows)) return [];

  const availableRows = rows.filter((row) => {
    const accountStr = String(row["账号"] || "").trim();
    if (!accountStr || accountStr === "undefined") {
      return false;
    }

    if (!targetConfig.email || !targetConfig.copyright) {
      return false;
    }

    const basicMatch =
      String(row["邮箱"]).trim() === String(targetConfig.email).trim() &&
      String(row["版权"]).trim() === String(targetConfig.copyright).trim();

    if (!basicMatch) return false;

    let subjectMatch = false;
    const rowSubject = String(row["主体"]).trim();
    const targetSubject = String(targetConfig.subject).trim();

    if (businessType === "端原生-付费短剧") {
      const rowVal = Math.floor(parseFloat(rowSubject));
      const targetVal = Math.floor(parseFloat(targetSubject));

      if (!isNaN(rowVal) && !isNaN(targetVal)) {
        subjectMatch = rowVal === targetVal;
      } else {
        subjectMatch = rowSubject === targetSubject;
      }
    } else {
      subjectMatch = rowSubject === targetSubject;
    }

    return subjectMatch;
  });

  const shuffled = availableRows.sort(() => 0.5 - Math.random());
  const countToTake = Math.min(shuffled.length, matchCount);

  return shuffled
    .slice(0, countToTake)
    .map((row) => String(row["账号"]).trim());
}

/** 在素材文件夹列表中按名称（去空格匹配）查找一项 */
function findMaterialFolderByName(materialFileNameList, fileName) {
  if (
    !materialFileNameList ||
    !Array.isArray(materialFileNameList) ||
    materialFileNameList.length === 0 ||
    !fileName
  ) {
    return undefined;
  }
  return materialFileNameList.find(
    (item) => item.name === clearSpaces(fileName),
  );
}

/**
 * 校验多个 Excel 是否存在且首行列头包含必填项
 * @param {Array<{ name: string, path: string, headers: string[] }>} specs
 */
function validateAutomationWorkbookLayout(specs) {
  const errors = [];
  for (const file of specs) {
    if (!fs.existsSync(file.path)) {
      errors.push(`❌ 文件丢失: ${file.name} (路径: ${file.path})`);
      continue;
    }
    try {
      const actualHeaders = readTabularHeaders(file.path);
      const missing = file.headers.filter((h) => !actualHeaders.includes(h));
      if (missing.length > 0) {
        errors.push(
          `❌ 文件列缺失: ${file.name} 缺少必要列: [${missing.join(", ")}]`,
        );
      }
    } catch (e) {
      errors.push(`❌ 文件读取失败: ${file.name} (${e.message})`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** 批量确保目录存在（递归创建） */
function ensureDirectories(dirs) {
  if (!Array.isArray(dirs)) return;
  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (_e) {}
    }
  });
}

// 👇 改用 ES Module 导出
export {
  rootDir,
  getTime,
  randomSleep,
  clearSpaces,
  smartSplit,
  matchByInput,
  checkAuth,
  logData,
  recordTaskStatus,
  saveData,
  getDateRangeByType,
  getCachedAccounts,
  clearAccountsCache,
  getTodayString, // 🌟 新增
  sleep,           // 🌟 新增
  ensureAuth,
  pickAccountsForPublish,
  findMaterialFolderByName,
  validateAutomationWorkbookLayout,
  ensureDirectories,
  readTabularRows,
};
