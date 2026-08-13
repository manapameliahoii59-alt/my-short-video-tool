"use strict";
const electron = require("electron");
const path$1 = require("node:path");
const utils = require("@electron-toolkit/utils");
const fs$1 = require("node:fs");
const axios = require("axios");
const AdmZip = require("adm-zip");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const xlsx = require("xlsx");
const os = require("os");
const child_process = require("child_process");
const electronUpdater = require("electron-updater");
const isPkg = typeof process.pkg !== "undefined";
const rootDir = isPkg ? path.dirname(process.execPath) : process.cwd();
const randomSleep = (min, max, getCancelStatus) => {
  const ms = Math.floor(Math.random() * (max - min + 1) + min);
  const start = Date.now();
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (getCancelStatus && getCancelStatus()) {
        clearInterval(timer);
        resolve(true);
      }
      if (Date.now() - start >= ms) {
        clearInterval(timer);
        resolve(false);
      }
    }, 100);
  });
};
function clearSpaces(str) {
  return str ? String(str).replace(/\s+/g, "") : "";
}
function smartSplit(str) {
  if (!str) return [];
  return String(str).split(/[\n、]+/).map((item) => item.trim()).filter((item) => item.length > 0);
}
function matchByInput(list, input) {
  const major = parseInt(input);
  if (isNaN(major) || !Array.isArray(list)) return null;
  const result = list.filter((item) => {
    const val = parseFloat(item.price || item.subject || 0);
    return Math.floor(val) === major;
  }).sort((a, b) => parseFloat(b.price || 0) - parseFloat(a.price || 0));
  return result.length > 0 ? result[0] : null;
}
function getMachineId() {
  try {
    if (process.platform === "win32") {
      const stdout = child_process.execSync("wmic csproduct get uuid", { encoding: "utf8" });
      const lines = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length >= 2 && lines[1]) {
        return crypto.createHash("md5").update(lines[1]).digest("hex");
      }
    }
  } catch (e) {
  }
  const cpuModel = os.cpus()?.[0]?.model || "unknown_cpu";
  const hostname = os.hostname();
  const mem = os.totalmem();
  const rawId = `${cpuModel}_${hostname}_${mem}`;
  return crypto.createHash("md5").update(rawId).digest("hex");
}
const CHECK_AUTH_NETWORK_MAX_ATTEMPTS = 3;
async function checkAuth(userKey, workingAccount, workingPassword) {
  const SERVER_URL = "http://129.204.86.63:3535/api/verify";
  if (!userKey || userKey.trim() === "") {
    console.log("🚫 本地未配置卡密(userKey)，请检查 config.js");
    return { status: -1, msg: "未配置卡密" };
  }
  if (!workingAccount || String(workingAccount).trim() === "") {
    console.log("🚫 本地未配置账号");
    return { status: -1, msg: "请先在 [系统设置] 中填写【账号】" };
  }
  let encryptedPassword = "";
  if (workingPassword) {
    encryptedPassword = Buffer.from(String(workingPassword)).toString("base64");
  }
  const machineId = getMachineId();
  const postBody = {
    license_key: userKey.trim(),
    machine_id: machineId,
    working_account: String(workingAccount).trim(),
    working_password: encryptedPassword
  };
  for (let attempt = 1; attempt <= CHECK_AUTH_NETWORK_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await axios.post(SERVER_URL, postBody, { timeout: 8e3 });
      const resData = response.data;
      if (resData.status === "ok") {
        console.log(`
🔑 授权验证通过: ${resData.msg}`);
        return {
          status: 1,
          msg: resData.msg,
          minTime: resData.min_time,
          maxTime: resData.max_time
        };
      }
      console.log(`
🚫 授权被拦截: ${resData.msg}`);
      return { status: -1, msg: resData.msg };
    } catch (error) {
      console.log(
        `
🌐 网络异常，无法连接到验证服务器。(第 ${attempt}/${CHECK_AUTH_NETWORK_MAX_ATTEMPTS} 次)`
      );
      if (attempt < CHECK_AUTH_NETWORK_MAX_ATTEMPTS) {
        const delayMs = 1e3 * attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      console.log(`
🌐 网络异常，已重试仍无法连接到验证服务器。`);
      return { status: -1, msg: "无法连接验证服务器，请检查网络" };
    }
  }
  return { status: -1, msg: "无法连接验证服务器，请检查网络" };
}
const recordTaskStatus = (dramaInfo, configData, status, message = "") => {
  const statusFile = path.join(rootDir, "task_execution_log.csv");
  const timestamp = (/* @__PURE__ */ new Date()).toLocaleString().replace(/,/g, "");
  if (!fs.existsSync(statusFile)) {
    const header = "\uFEFF时间,剧名,主体,策略包,邮箱,版权,状态,详细信息\n";
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
    message.replace(/[\r\n,]/g, " ")
  ].map((item) => `"${item}"`).join(",");
  fs.appendFileSync(statusFile, row + "\n", "utf-8");
};
function getDateRangeByType(type) {
  const now = /* @__PURE__ */ new Date();
  const format = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  let start = new Date(now);
  let end = new Date(now);
  if (type) {
    switch (type) {
      case "今天":
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
    }
  }
  return {
    startDay: format(start),
    endDay: format(end)
  };
}
let accountsCache = null;
const readRowsFromJsonPayload = (filePath) => {
  const content = fs.readFileSync(filePath, "utf-8");
  const parsed = JSON.parse(content);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.rows)) return parsed.rows;
  return [];
};
const getNormalizedSidecarPath = (filePath) => `${filePath}.normalized.json`;
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
function clearAccountsCache() {
  accountsCache = null;
}
const getTodayString = () => {
  const date = /* @__PURE__ */ new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEFAULT_DRAMA_MODULE_ID = 10003;
function pickDramaModuleId(modules) {
  const list = Array.isArray(modules) ? modules : [];
  const opened = list.filter((m) => m && m.isOpen !== false);
  const byName = opened.find((m) => String(m.moduleName || "").includes("短剧")) || list.find((m) => String(m.moduleName || "").includes("短剧"));
  if (byName?.moduleId != null) return Number(byName.moduleId);
  if (opened[0]?.moduleId != null) return Number(opened[0].moduleId);
  if (list[0]?.moduleId != null) return Number(list[0].moduleId);
  return DEFAULT_DRAMA_MODULE_ID;
}
async function selectModule(authClient, sessionId, moduleId) {
  const headers = {
    authorization: sessionId,
    cookie: `ocpx_session_id=${sessionId}`
  };
  const res = await authClient.post(
    "/merchant/auth/login2",
    { moduleId },
    { headers }
  );
  const code = res.data?.code;
  if (code !== 0 && code !== "0") {
    throw new Error(
      `选择模块失败(moduleId=${moduleId}): ${code ?? ""} ${res.data?.msg || "未知错误"}`
    );
  }
  return headers;
}
async function ensureAuth(account, password, currentSession = null, baseUrl = "https://api.iocpx.com") {
  let sessionId = "";
  const authClient = axios.create({
    baseURL: baseUrl,
    timeout: 15e3,
    headers: {
      "Content-Type": "application/json",
      Origin: "https://console.iocpx.com",
      Referer: "https://console.iocpx.com/"
    }
  });
  if (currentSession?.token && Date.now() - (currentSession.time || 0) < 6 * 24 * 60 * 60 * 1e3) {
    sessionId = currentSession.token;
    try {
      const testHeaders = {
        authorization: sessionId,
        cookie: `ocpx_session_id=${sessionId}`
      };
      let testAuthRes = await authClient.get("/merchant/auth/info", { headers: testHeaders });
      if (testAuthRes.data?.code == 1001000001) {
        console.log("🔄 [鉴权服务] 登录已过期, 准备重新登陆...");
        sessionId = "";
      } else {
        console.log("✅ [鉴权服务] 登录状态有效 (缓存复用)");
        const moduleId = currentSession.moduleId != null ? Number(currentSession.moduleId) : DEFAULT_DRAMA_MODULE_ID;
        const headers = await selectModule(authClient, sessionId, moduleId);
        return {
          success: true,
          session: { ...currentSession, moduleId },
          headers
        };
      }
    } catch (err) {
      sessionId = "";
    }
  }
  if (!sessionId) {
    console.log("🔐 [鉴权服务] 正在执行自动登录...");
    if (!account || !password) {
      return { success: false, msg: "未配置主账号或密码，请前往系统设置填写" };
    }
    try {
      const r1 = await authClient.post("/merchant/auth/login1", {
        email: account,
        password,
        rememberMe: true
      });
      if (r1.data?.code !== 0 && r1.data?.code !== "0") {
        throw new Error(r1.data?.msg || `login1 失败: ${r1.data?.code}`);
      }
      const setCookie = r1.headers["set-cookie"];
      if (!setCookie) throw new Error("未获取到 Cookie 信息");
      sessionId = setCookie.find((s) => s.startsWith("ocpx_session_id=")).split(";")[0].split("=")[1];
      const moduleId = pickDramaModuleId(r1.data?.data);
      const newHeaders = await selectModule(authClient, sessionId, moduleId);
      const newSession = { token: sessionId, time: Date.now(), moduleId };
      console.log(`✅ [鉴权服务] 账号密码自动登录成功！已选择模块 moduleId=${moduleId}`);
      return { success: true, session: newSession, headers: newHeaders };
    } catch (err) {
      console.error("❌ [鉴权服务] 登录失败:", err.message);
      return { success: false, msg: `登录失败: ${err.message}` };
    }
  }
}
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
    const basicMatch = String(row["邮箱"]).trim() === String(targetConfig.email).trim() && String(row["版权"]).trim() === String(targetConfig.copyright).trim();
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
  return shuffled.slice(0, countToTake).map((row) => String(row["账号"]).trim());
}
function findMaterialFolderByName(materialFileNameList, fileName) {
  if (!materialFileNameList || !Array.isArray(materialFileNameList) || materialFileNameList.length === 0 || !fileName) {
    return void 0;
  }
  return materialFileNameList.find(
    (item) => item.name === clearSpaces(fileName)
  );
}
typeof process.pkg !== "undefined";
let minTime = null;
let maxTime = null;
let uiSender = null;
let CONFIG$1 = null;
let uiSelectedExcelPath = null;
let isCancelled = false;
let requestThrottleMultiplier = 1;
const throttleMs = (ms) => {
  const n = Number(ms) || 0;
  return Math.max(0, Math.round(n * requestThrottleMultiplier));
};
const sleepWithThrottle = (ms) => new Promise((resolve) => setTimeout(resolve, throttleMs(ms)));
const randomSleepWithThrottle = (min, max, getCancelStatus) => {
  const scaledMin = throttleMs(min);
  const scaledMax = throttleMs(max);
  return randomSleep(
    Math.min(scaledMin, scaledMax),
    Math.max(scaledMin, scaledMax),
    getCancelStatus
  );
};
const c = console;
const logToTerminal = c.log.bind(c);
const errToTerminal = c.error.bind(c);
const warnToTerminal = c.warn.bind(c);
function taskUiLog(...args) {
  logToTerminal(...args);
  if (uiSender) {
    uiSender.send("log-update", util.format(...args));
  }
}
function taskUiError(...args) {
  errToTerminal(...args);
  if (uiSender) {
    const msg = util.format(...args);
    uiSender.send("log-update", `<span style="color:red;">❌ ${msg}</span>`);
  }
}
function taskUiWarn(...args) {
  warnToTerminal(...args);
  if (uiSender) {
    uiSender.send(
      "log-update",
      `<span style="color:#e6a23c;">⚠️ ${util.format(...args)}</span>`
    );
  }
}
const CONFIGData = {
  BASE_URL: "https://api.iocpx.com",
  SESSION_FILE: path.join(rootDir, "session.json"),
  BOOK_FILE: path.join(rootDir, "剧单.xlsx"),
  TEMPLATE_FILE: path.join(rootDir, "模板_付费.xlsx")
};
let globalSession = { token: "", time: 0 };
const client = axios.create({
  baseURL: CONFIGData.BASE_URL,
  timeout: 15e3,
  headers: {
    "Content-Type": "application/json",
    Origin: "https://console.iocpx.com",
    Referer: "https://console.iocpx.com/"
  }
});
client.interceptors.request.use((config) => {
  if (globalSession && globalSession.token) {
    config.headers["authorization"] = globalSession.token;
    config.headers["cookie"] = `ocpx_session_id=${globalSession.token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});
function getAvailableAccounts(targetConfig, x = CONFIG$1.SETTINGS.ACCOUNT_MATCH_COUNT) {
  const rows = getCachedAccounts(CONFIG$1.FILES.ACCOUNTS);
  return pickAccountsForPublish(
    rows,
    targetConfig,
    CONFIG$1.FILES.BUSINESS_TYPE,
    x
  );
}
const writeApiLog = (step, params, response) => {
  return;
};
const GLOBAL_CACHE = {
  dramaInfo: {},
  linkTemplate: {},
  strategy: {},
  titlePackage: {},
  accountsList: null,
  materials: {},
  // 🌟 新增：素材专属缓存池
  materialFolders: {}
  // 素材文件夹搜索（按 query 维度缓存）
};
async function getDataWithCache(type, key, fetchFn) {
  const shortKey = key.length > 20 ? key.substring(0, 20) + "..." : key;
  if (GLOBAL_CACHE[type] && GLOBAL_CACHE[type][key]) {
    taskUiLog(`   ⚡ [缓存命中] ${type}: ${shortKey}`);
    return GLOBAL_CACHE[type][key];
  }
  taskUiLog(`   🌐 [发起请求] ${type}: ${shortKey}`);
  const data = await fetchFn();
  if (data) {
    GLOBAL_CACHE[type][key] = data;
  }
  return data;
}
async function getMaterialFolderListCached(materialFileNameQuery) {
  const q = clearSpaces(materialFileNameQuery);
  if (!q) return [];
  return getDataWithCache("materialFolders", q, async () => {
    const res = await client.post("adv-asset-inside/folder/search", {
      pageNo: 1,
      pageSize: 150,
      query: q,
      projectId: null,
      libraryType: "public",
      showPrivateOnly: false,
      queryPolicy: "ft"
    });
    return res?.data?.data?.list || [];
  });
}
function materialNameMatchesSearch(adPlatformMaterialName, searchName) {
  const materialName = (adPlatformMaterialName || "").replace(/[\x00-\x1f\x7f\xa0]/g, "").trim();
  const targetName = (searchName || "").trim();
  if (!targetName) return true;
  if (materialName === targetName) return true;
  const materialParts = materialName.split(/[-—_]/).map((part) => part.trim()).filter(Boolean);
  if (materialParts.includes(targetName)) return true;
  const searchParts = targetName.split(/[-—_]/).map((part) => part.trim()).filter(Boolean);
  if (searchParts.length > 1) {
    return searchParts.every((part) => materialParts.includes(part));
  }
  return false;
}
async function generatePublishPayload(dramaInfo, proConfigData) {
  const productName = clearSpaces(dramaInfo.targetDramaName);
  const proConfig_strategyId = proConfigData.proConfig_strategyId;
  const proConfig_titlePackageId = proConfigData.proConfig_titlePackageId;
  const proConfig_subjectId = proConfigData.proConfig_subject;
  const testDramaName = clearSpaces(dramaInfo.testDramaTitle);
  const copyrightData = clearSpaces(dramaInfo.copyright);
  const materialFileNameData = dramaInfo.materialFileName;
  const pageSize = parseInt(dramaInfo.dramaCount) || parseInt(CONFIG$1.FILES.PAGE_NUM) || 20;
  const specifyMaterialsArr = smartSplit(dramaInfo.specifyMaterials);
  const materialDateRangeData = dramaInfo.materialDateRange || CONFIG$1.FILES.dateRange;
  let searchProductName = testDramaName ? testDramaName : productName;
  const target_bid = proConfigData.proConfig_bid || proConfigData.proConfig_subject;
  try {
    const dramaCacheKey = `${productName}_${CONFIG$1.FILES.BUSINESS_TYPE}_${copyrightData}`;
    const productDataList = await getDataWithCache(
      "dramaInfo",
      dramaCacheKey,
      async () => {
        let resbookParmas = {
          bookName: productName,
          key: productName,
          pageNo: 1,
          linkType: CONFIG$1.FILES.BUSINESS_TYPE === "端原生-付费短剧" ? "IAP" : "IAA",
          pageSize: CONFIG$1.FILES.BUSINESS_TYPE === "端原生-付费短剧" ? 50 : 20
        };
        const resBook = await client.post(
          "/adv-bookstore/bsShortDramaAlbumLinkFanqie/page",
          resbookParmas
        );
        let productData = resBook.data?.data?.list;
        if (copyrightData == "ZZ番茄" && Array.isArray(productData)) {
          productData = productData.filter(
            (item) => productName == clearSpaces(item.bookName) && item.source == "ZZFQ"
          );
        }
        if (copyrightData == "ZZ点众" && Array.isArray(productData)) {
          productData = productData.filter(
            (item) => productName == clearSpaces(item.bookName) && item.source == "DZ"
          );
        }
        if (copyrightData != "ZZ番茄" && copyrightData != "ZZ点众" && Array.isArray(productData)) {
          productData = productData.filter(
            (item) => productName == clearSpaces(item.bookName) && item.source != "DZ" && item.source != "ZZFQ"
          );
        }
        return productData;
      }
    );
    if (isCancelled) return null;
    if (!productDataList || productDataList.length === 0) {
      throw new Error(`未找到剧集信息或版权不匹配: ${productName}`);
    }
    let productInfo;
    if (CONFIG$1.FILES.BUSINESS_TYPE === "端原生-付费短剧") {
      productInfo = matchByInput(productDataList, target_bid);
    } else {
      productInfo = productDataList?.[0];
    }
    if (!productInfo)
      throw new Error(
        `未在列表中找到匹配主体(${proConfig_subjectId})的剧集: ${productName}`
      );
    const linkTemplate = await getDataWithCache(
      "linkTemplate",
      proConfigData.proConfig_promotionLinkTemplateId,
      async () => {
        const res = await client.get(
          `/adv-release-toutiao/configPromotionLinkTemplate/page?key=${proConfigData.proConfig_promotionLinkTemplateId}&pageNo=1&pageSize=1`
        );
        return res.data?.data?.list?.[0];
      }
    );
    if (!linkTemplate) throw new Error(`未获取到推广链接模板`);
    const titlePackage = await getDataWithCache(
      "titlePackage",
      proConfig_titlePackageId,
      async () => {
        const res = await client.get(
          `/adv-release-toutiao/configTitlePackage/page?key=${proConfig_titlePackageId}&pageNo=1&pageSize=20`
        );
        return res.data?.data?.list?.[0];
      }
    );
    if (!titlePackage) throw new Error(`未获取标题包`);
    const strategy = await getDataWithCache(
      "strategy",
      proConfig_strategyId,
      async () => {
        const res = await client.get(
          `/adv-release-toutiao/configPromotionStrategy/page?key=${proConfig_strategyId}&pageNo=1&pageSize=1`
        );
        return res.data?.data?.list?.[0];
      }
    );
    if (!strategy) throw new Error(`未找到匹配的策略包`);
    const accountIds = getAvailableAccounts({
      email: proConfigData.proConfig_email,
      copyright: proConfigData.proConfig_copyright,
      subject: proConfigData.proConfig_subject,
      bid: proConfigData.proConfig_bid
    });
    if (Array.isArray(accountIds) && accountIds.length == 0)
      throw new Error(`未获取到可用账号`);
    const getAccount = await client.post(
      "/adv-vlsc-toutiao/account/queryByAdvertiserIds",
      accountIds
    );
    const accountData = getAccount.data?.data;
    if (!Array.isArray(accountData) || accountData.length === 0) {
      throw new Error(
        `账号库匹配到的账号无效或已失效，请检查账号文件中的「账号」列是否为可用 advertiserId。匹配结果: ${accountIds.join(",")}`
      );
    }
    let accountListName = accountData.map((item) => String(item?.advertiserName || "").trim()).filter(Boolean);
    let idsList = accountData.map((item) => item?.advertiserId).filter((id) => id !== void 0 && id !== null && String(id).trim() !== "").map((id) => String(id).trim());
    if (idsList.length === 0) {
      throw new Error(
        `未获取到有效账户ID，请检查账号文件中的「账号」列数据。匹配结果: ${accountIds.join(",")}`
      );
    }
    const accListData = accountData.map((ele) => ({
      id: ele.advertiserId,
      name: ele.advertiserName,
      uniqueId: ele.advertiserId,
      company: ele.company
    }));
    await randomSleepWithThrottle(minTime, maxTime, () => isCancelled);
    if (isCancelled) return null;
    const rankingType = CONFIG$1.SETTINGS.RANKING_TYPE || "material";
    const isLibraryMode = rankingType === "library";
    const isCompanyRanking = rankingType === "company";
    let isSpecify = Array.isArray(specifyMaterialsArr) && specifyMaterialsArr.length > 0;
    let rangeDataObj = getDateRangeByType(materialDateRangeData);
    let tarMaterItem;
    if (isLibraryMode && materialFileNameData) {
      const folderList = await getMaterialFolderListCached(materialFileNameData);
      tarMaterItem = findMaterialFolderByName(folderList, materialFileNameData);
    }
    let rankingListOrLibrarySign = "";
    const specifyKeyStr = isSpecify ? specifyMaterialsArr.join("-") : "none";
    const folderIdStr = isLibraryMode ? tarMaterItem?.id || "nofolder" : "nofolder";
    const materialCacheKey = `mat_${rankingType}_${searchProductName}_${rangeDataObj.startDay}_${rangeDataObj.endDay}_${specifyKeyStr}_${folderIdStr}_${copyrightData}`;
    taskUiLog(`   🔍 准备获取素材 (Key: ${searchProductName})...`);
    let materials = await getDataWithCache(
      "materials",
      materialCacheKey,
      async () => {
        let fetchMaterials = [];
        let resAsset;
        if (isLibraryMode) {
          if (isSpecify) {
            let _materialPar = {
              queryPolicy: "em",
              query: "",
              showPrivateOnly: false,
              sortingFields: [{ field: "updateTime", order: "desc" }],
              includeFolder: false,
              fullNames: specifyMaterialsArr,
              libraryType: "public",
              pageNo: 1,
              pageSize: 20
            };
            if (tarMaterItem?.id) _materialPar.folderId = tarMaterItem.id;
            resAsset = await client.post("/adv-asset-inside/search", _materialPar);
            const rawMaterials = resAsset.data?.data?.materials || [];
            fetchMaterials = rawMaterials.filter((item) => item.url && item.coverUrl);
          } else {
            let _Materialpar2 = {
              queryPolicy: "em",
              query: searchProductName,
              showPrivateOnly: false,
              partOfFullName: true,
              libraryType: "public",
              pageNo: 1,
              pageSize,
              sortingFields: [{ field: "updateTime", order: "desc" }]
            };
            if (tarMaterItem?.id) _Materialpar2.folderId = tarMaterItem.id;
            resAsset = await client.post("/adv-asset-inside/search", _Materialpar2);
            const rawMaterials = resAsset.data?.data?.materials || [];
            fetchMaterials = rawMaterials.filter((item) => item.url && item.coverUrl);
          }
        } else {
          if (isCompanyRanking) {
            resAsset = await client.post(
              "/adv-report-query/materialDay/getTenantCumSumBefore",
              {
                materialInfo: searchProductName,
                sortingFields: [{ field: "statCost", order: "desc" }],
                pageNo: 1,
                pageSize
              }
            );
          } else {
            resAsset = await client.post(
              "/adv-report-query/materialDay/getLatestCostByDayRangeV2",
              {
                materialInfo: searchProductName,
                startDay: rangeDataObj.startDay,
                endDay: rangeDataObj.endDay,
                sortingFields: [{ field: "statCost", order: "desc" }],
                pageNo: 1,
                pageSize
              }
            );
          }
          let rawList = resAsset.data?.data?.list || [];
          fetchMaterials = rawList.filter((item) => item.videoUrl && item.poster);
          fetchMaterials = fetchMaterials.filter(
            (materItem) => materialNameMatchesSearch(
              materItem.adPlatformMaterialName,
              searchProductName
            )
          );
          if (isSpecify) {
            const specifySet = new Set(
              specifyMaterialsArr.map(
                (name) => name.replace(/[\x00-\x1f\x7f\xa0]/g, "").trim()
              )
            );
            fetchMaterials = fetchMaterials.filter((item) => {
              const name = (item.adPlatformMaterialName || "").replace(/[\x00-\x1f\x7f\xa0]/g, "").trim();
              return specifySet.has(name);
            });
          }
          if (fetchMaterials.length > 0) {
            let materialscheckArr = fetchMaterials.map((item) => item.materialId);
            let checkRes = await client.post("/adv-asset-inside/material/findId", {
              oceanengineMaterialIds: materialscheckArr
            });
            let mappingTable = checkRes.data?.data || {};
            fetchMaterials = fetchMaterials.map((ele) => ({
              ...ele,
              mappingId: mappingTable[ele.materialId] || null
            }));
          }
        }
        return fetchMaterials;
      }
    );
    if (isCancelled) return null;
    if (isLibraryMode) {
      rankingListOrLibrarySign = "素材库";
    } else if (isCompanyRanking) {
      rankingListOrLibrarySign = "公司榜单";
    } else {
      rankingListOrLibrarySign = "素材榜单";
    }
    if (!materials || materials.length === 0)
      throw new Error(`素材查询结果为空`);
    taskUiLog(
      `   🎬 素材获取成功: ${materials.length} 条 (${rankingListOrLibrarySign})`
    );
    const ydData = ("0" + ((/* @__PURE__ */ new Date()).getMonth() + 1)).slice(-2) + ("0" + (/* @__PURE__ */ new Date()).getDate()).slice(-2);
    const finalPublishName = `${productInfo.bookName}_${ydData}`;
    let materialInfoData = null;
    if (rankingListOrLibrarySign !== "素材库") {
      materialInfoData = JSON.stringify(
        materials.map((item) => ({
          id: `${item.materialId}-${item.platform}`,
          name: item.adPlatformMaterialName,
          coverUrl: item.poster,
          url: item.videoUrl,
          origin: "asset_inside",
          materialMigrateId: item.mappingId
        }))
      );
    } else {
      materialInfoData = JSON.stringify(
        materials.map((item) => ({
          id: item.id,
          name: item.name,
          coverUrl: item.coverUrl,
          url: item.url,
          ratio: item.ratio,
          origin: "asset_inside",
          materialMigrateId: item.materialMigrateId,
          size: item.size
        }))
      );
    }
    let pro_num = Math.max(
      1,
      parseInt(dramaInfo.proNumNew || CONFIG$1.FILES.PROJECT_NUM) || 1
    );
    let ads_num = Math.max(
      1,
      parseInt(dramaInfo.adsNumNew || CONFIG$1.FILES.ADS_NUM) || 1
    );
    let materialsSize = Math.min(materials.length, 30);
    let isBeta = CONFIG$1.SETTINGS.ACTION == "publishBeta";
    const typeVal = isBeta ? "4" : "0";
    const payload1 = {
      type: typeVal,
      // type: "4",//beta版本
      // type: 0,
      bookName: productInfo.bookName,
      bookId: productInfo.bookId,
      source: productInfo.source,
      thumbUrl: productInfo.thumbUrl,
      playletSeriesUrl: productInfo.link,
      appType: linkTemplate.appType,
      promotionLinkTemplateId: linkTemplate.id,
      promotionLinkTemplateName: linkTemplate.name,
      industry: linkTemplate.industry,
      platform: linkTemplate.platform,
      promotionStrategyId: strategy.id,
      promotionStrategyName: strategy.name,
      bidType: strategy.bidType,
      landingType: strategy.landingType,
      strategyType: 3,
      //3为项目内平铺 2为账户内平铺
      titleNum: 10,
      titlePackageIds: `[${titlePackage.id}]`,
      titleTextList: "[]",
      folderIdPaths: "[]",
      commentMaterialList: "[]",
      projectNum: pro_num,
      advertNum: 0,
      //当为项目内平铺时，这个为0
      // advertNum: ads_num,
      note: "",
      actionTrackUrl: "",
      projectName: "",
      advertName: "",
      projectParam: "",
      status: 0,
      audit: false,
      workflowId: "",
      folderId: "",
      transcodePolicy: "",
      index: null,
      price: null,
      startChapter: null,
      adEpisode: null,
      materialNum: materialsSize,
      materialInfo: materialInfoData,
      advertiserIds: JSON.stringify(idsList),
      advertiserNames: JSON.stringify(accountListName),
      publishName: finalPublishName,
      accountList: JSON.stringify(accListData),
      deliveryStrategyType: false,
      folderIdPaths: "[]",
      materialMode: 0,
      awemeId: "",
      deliveryStrategyInfo: "{}"
    };
    return {
      payload1,
      meta: {
        finalPublishName,
        idsList,
        dramaInfo,
        proConfigData
      }
    };
  } catch (err) {
    taskUiError(`❌ [${productName}] 数据组装失败: ${err.message}`);
    recordTaskStatus(dramaInfo, proConfigData, "ERROR", err.message);
    return null;
  }
}
async function submitBatchTasks(taskList) {
  if (!taskList || taskList.length === 0) return;
  const isPublish = CONFIG$1.SETTINGS.ACTION?.includes("publish");
  taskUiLog(
    `
🚀 [${isPublish ? "正式发布" : "测试模式"}] 开始处理 ${taskList.length} 个任务...`
  );
  try {
    const payload1List = taskList.map((t) => t.payload1);
    taskUiLog(`⏳ 正在请求创建模板 (insert)...`);
    const resInsert = await client.post(
      "/adv-release-toutiao/publishTemplate/insert",
      payload1List
    );
    writeApiLog(
      "/adv-release-toutiao/publishTemplate/insert",
      payload1List,
      resInsert
    );
    const resultList = resInsert.data?.data;
    if (!resultList || !Array.isArray(resultList)) {
      throw new Error(
        `批量创建模板失败: ${resInsert.data?.msg || "返回数据为空"}`
      );
    }
    taskUiLog(`✅ 模板创建成功，获取到 ${resultList.length} 个 ID`);
    const payload2List = [];
    const successTasks = [];
    for (let i = 0; i < resultList.length; i++) {
      const templateData = resultList[i];
      const originalTask = taskList[i];
      if (templateData && templateData.id) {
        payload2List.push({
          ownerDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
          publishTemplateId: templateData.id,
          publishTemplateName: originalTask.meta.finalPublishName,
          promotionStrategyName: templateData.promotionStrategyName,
          promotionStrategyId: templateData.promotionStrategyId,
          bookId: templateData.bookId,
          bookName: templateData.bookName,
          thumbUrl: templateData.thumbUrl,
          type: 1,
          status: 0
        });
        successTasks.push({
          task: originalTask,
          templateId: templateData.id
        });
      }
    }
    if (payload2List.length === 0) {
      taskUiWarn("⚠️ 本批次无有效模板，跳过后续步骤");
      return;
    }
    taskUiLog(`⏳ 模板已就绪，正在缓冲等待，准备最终提交...`);
    await randomSleepWithThrottle(1e3, 2e3);
    taskUiLog(
      "\n-------------------------------------------------------------"
    );
    taskUiLog(`📋 准备提交的数据 (${payload2List.length} 条):`);
    payload2List.forEach((p, idx) => {
      taskUiLog(
        `   ${idx + 1}. 模板ID: ${p.publishTemplateId} | 剧名: ${p.bookName} | 策略: ${p.promotionStrategyName}`
      );
    });
    taskUiLog(
      "-------------------------------------------------------------\n"
    );
    if (!isPublish) {
      taskUiLog("🛑 [测试阻断] 已暂停最终提交 (publishInstance/batchInsert)");
      taskUiLog("✅ 测试流程结束，数据已生成，未消耗真实配额。\n");
      return;
    }
    const resInstance = await client.post(
      "/adv-release-toutiao/publishInstance/batchInsert",
      payload2List
    );
    writeApiLog(
      "/adv-release-toutiao/publishInstance/batchInsert",
      payload2List,
      resInstance
    );
    if (resInstance.data.code === 0) {
      taskUiLog(`✨ [批量执行] ${payload2List.length} 个任务全部提交成功！`);
      for (const successItem of successTasks) {
        const { task, templateId } = successItem;
        recordTaskStatus(
          task.meta.dramaInfo,
          task.meta.proConfigData,
          "SUCCESS",
          `发布模板ID: ${templateId}`
        );
      }
    } else {
      const errorMsg = resInstance.data.msg || "接口错误";
      taskUiError(`❌ [批量执行] Instance 提交失败: ${errorMsg}`);
      successTasks.forEach((item) => {
        recordTaskStatus(
          item.task.meta.dramaInfo,
          item.task.meta.proConfigData,
          "FAILED",
          `批量提交失败: ${errorMsg}`
        );
      });
    }
  } catch (err) {
    taskUiError(`❌ [测试阶段] 发生异常: ${err.message}`);
    taskList.forEach((t) => {
      recordTaskStatus(
        t.meta.dramaInfo,
        t.meta.proConfigData,
        "ERROR",
        `测试异常: ${err.message}`
      );
    });
  }
}
async function getDramaCount() {
  return readTabularRows(CONFIG$1.FILES.DRAMA_LIST).length;
}
async function loadDramaData(index) {
  const filePath = uiSelectedExcelPath || CONFIG$1.FILES.DRAMA_LIST;
  const data = readTabularRows(filePath);
  if (!data[index]) return null;
  const row = data[index];
  let DRAMA_FIELD_NAMES = CONFIG$1.DRAMA_FIELD_NAMES;
  let acMaterialFieldName = DRAMA_FIELD_NAMES.materialFileName || "素材文件名称";
  return {
    targetDramaName: String(
      row[DRAMA_FIELD_NAMES.targetDramaName] || ""
    ).trim(),
    copyright: String(row[DRAMA_FIELD_NAMES.copyright] || "").trim(),
    testDramaTitle: String(row[DRAMA_FIELD_NAMES.testDramaTitle] || "").trim(),
    dramaCount: String(row[DRAMA_FIELD_NAMES.dramaCount] || "").trim(),
    specifyMaterials: String(
      row[DRAMA_FIELD_NAMES.specifyMaterials] || ""
    ).trim(),
    proNumNew: parseInt(row[DRAMA_FIELD_NAMES.proNumNew]),
    adsNumNew: parseInt(row[DRAMA_FIELD_NAMES.adsNumNew]),
    materialFileName: String(row[acMaterialFieldName]).trim(),
    materialDateRange: (row[DRAMA_FIELD_NAMES.materialDateRange] || "").toString().trim()
  };
}
async function runAutoTask(sender, uiConfig) {
  uiSender = sender;
  try {
    CONFIG$1 = uiConfig;
    uiSelectedExcelPath = CONFIG$1.FILES.DRAMA_LIST;
    clearAccountsCache();
    GLOBAL_CACHE.dramaInfo = {};
    GLOBAL_CACHE.linkTemplate = {};
    GLOBAL_CACHE.strategy = {};
    GLOBAL_CACHE.titlePackage = {};
    GLOBAL_CACHE.materials = {};
    if (CONFIG$1.SETTINGS && CONFIG$1.SETTINGS.BASE_URL) {
      client.defaults.baseURL = CONFIG$1.SETTINGS.BASE_URL;
    }
    const authResult = await checkAuth(
      CONFIG$1.KEY_CONFIG.userKey,
      CONFIG$1.WORKING_CONFIG.account,
      CONFIG$1.WORKING_CONFIG.password
    );
    if (authResult.status !== 1) throw new Error(authResult.msg);
    minTime = Number(authResult.minTime);
    maxTime = Number(authResult.maxTime);
    globalSession = CONFIG$1.session || { token: "", time: 0 };
    const authRes = await ensureAuth(
      CONFIG$1.WORKING_CONFIG.account,
      CONFIG$1.WORKING_CONFIG.password,
      globalSession
    );
    if (!authRes.success) {
      throw new Error(authRes.msg);
    }
    globalSession = authRes.session;
    try {
      const dramaCount = await getDramaCount();
      taskUiLog(
        `
===========================================================`
      );
      taskUiLog(
        `🚀 任务启动：共选中 ${CONFIG$1.SELECTED_PROFILES.length} 个方案，总剧集 ${dramaCount} 部`
      );
      taskUiLog(`===========================================================`);
      isCancelled = false;
      let globalTaskPool = [];
      const BATCH_THRESHOLD = parseInt(CONFIG$1.SETTINGS.BATCH_THRESHOLD, 10) || 50;
      requestThrottleMultiplier = Number(CONFIG$1.SETTINGS.REQUEST_THROTTLE_MULTIPLIER) || 1;
      if (requestThrottleMultiplier < 1) requestThrottleMultiplier = 1;
      taskUiLog(
        `⚙️ 运行节流系数: x${requestThrottleMultiplier.toFixed(2)} | 批次阈值: ${BATCH_THRESHOLD}`
      );
      const defaultAccountMatchCount = parseInt(CONFIG$1.SETTINGS.ACCOUNT_MATCH_COUNT, 10) || 2;
      for (let pIndex = 0; pIndex < CONFIG$1.SELECTED_PROFILES.length; pIndex++) {
        if (isCancelled) return;
        const profile = CONFIG$1.SELECTED_PROFILES[pIndex];
        taskUiLog(`

🔶 [方案切换] 开始方案: 【${profile.name}】`);
        CONFIG$1.FILES.TEMPLATE = profile.TEMPLATE;
        CONFIG$1.FILES.ACCOUNTS = profile.ACCOUNTS;
        CONFIG$1.FILES.BUSINESS_TYPE = profile.businessType;
        const profileMatchCount = parseInt(profile.accountMatchCount, 10);
        const shouldUseProfileCount = profile.enableCustomAccountMatchCount === true && Number.isFinite(profileMatchCount) && profileMatchCount > 0;
        CONFIG$1.SETTINGS.ACCOUNT_MATCH_COUNT = shouldUseProfileCount ? profileMatchCount : defaultAccountMatchCount;
        clearAccountsCache();
        if (!fs.existsSync(CONFIG$1.FILES.TEMPLATE) || !fs.existsSync(CONFIG$1.FILES.ACCOUNTS)) {
          taskUiError(`❌ [方案跳过] 【${profile.name}】文件不完整`);
          continue;
        }
        const allTemplates = readTabularRows(CONFIG$1.FILES.TEMPLATE);
        const templateRowCount = allTemplates.length;
        for (let j = 0; j < dramaCount; j++) {
          if (isCancelled) return;
          const dramaInfo = await loadDramaData(j);
          if (!dramaInfo) continue;
          taskUiLog(
            `
🎬 [${profile.name}] 处理剧集 ${j + 1}/${dramaCount}: ${dramaInfo.targetDramaName}`
          );
          for (let i = 0; i < templateRowCount; i++) {
            if (isCancelled) return;
            const row = allTemplates[i];
            const templateCopyright = String(row["版权"] || "").trim();
            if (templateCopyright !== dramaInfo.copyright) continue;
            const proConfigData = {
              proConfig_email: String(row["邮箱"]).trim(),
              proConfig_promotionLinkTemplateId: String(
                row["推广链接模板ID"]
              ).trim(),
              proConfig_copyright: templateCopyright,
              // proConfig_strategyId: String(row["策略包ID"]).trim(),
              // proConfig_titlePackageId: String(row["标题组ID"]).trim(),
              proConfig_strategyId: String(row["策略包ID"] || "").trim(),
              proConfig_titlePackageId: String(row["标题组ID"] || "").trim(),
              proConfig_subject: String(row["主体"] || "").trim(),
              proConfig_bid: row["出价"] ? String(row["出价"]).trim() : ""
            };
            const taskData = await generatePublishPayload(
              dramaInfo,
              proConfigData
            );
            if (isCancelled) return;
            if (taskData) {
              globalTaskPool.push(taskData);
              if (globalTaskPool.length >= BATCH_THRESHOLD) {
                taskUiLog(
                  `
📦 [蓄水池满] 已积攒 ${BATCH_THRESHOLD} 条，发起批量提交...`
                );
                await submitBatchTasks(globalTaskPool);
                globalTaskPool = [];
                const coolDown = 5e3 + Math.random() * 3e3;
                taskUiLog(
                  `❄️ [频率保护] 提交完毕，进入 ${Math.round(coolDown / 1e3)} 秒深度冷却...`
                );
                await sleepWithThrottle(coolDown);
                if (isCancelled) return;
              }
            }
          }
          await sleepWithThrottle(500);
          if (isCancelled) return;
          const authDataResult = await checkAuth(
            CONFIG$1.KEY_CONFIG.userKey,
            CONFIG$1.WORKING_CONFIG.account,
            CONFIG$1.WORKING_CONFIG.password
          );
          if (authDataResult.status !== 1) throw new Error(authDataResult.msg);
        }
        taskUiLog(`✅ 方案【${profile.name}】预处理完毕！`);
        if (pIndex < CONFIG$1.SELECTED_PROFILES.length - 1) {
          const profileCoolDown = 1500 + Math.random() * 3e3;
          taskUiLog(`
⏸️ [方案切换缓冲] 休息 ${Math.round(profileCoolDown / 1e3)} 秒，准备载入下一个方案...`);
          await sleepWithThrottle(profileCoolDown);
          if (isCancelled) return;
        }
      }
      if (isCancelled) {
        taskUiLog("\n🚫 任务已被手动取消！");
        return;
      }
      if (globalTaskPool.length > 0) {
        taskUiLog(
          `
📦 [收尾提交] 处理最后剩余的 ${globalTaskPool.length} 条任务...`
        );
        await submitBatchTasks(globalTaskPool);
      }
      taskUiLog("\n🎉 所有选中的方案队列已全部执行结束");
    } catch (e) {
      taskUiError("❌ 程序核心逻辑运行异常:", e.message);
    }
  } catch (e) {
    taskUiError("❌ [程序异常]", e.message);
    throw e;
  } finally {
    uiSender = null;
    requestThrottleMultiplier = 1;
  }
}
function stopAutoTask() {
  isCancelled = true;
  if (uiSender) {
    uiSender.send("log-update", "⚠️ 正在取消任务，请稍候...");
  }
}
const CONFIG = {
  KEY_CONFIG: { userKey: "" },
  // 内部可以留空作为默认值
  WORKING_CONFIG: { account: "", password: "" },
  // 🌟 核心修改 1：acount 必须改为 account
  FILES: {
    // 🌟 核心修改 2：去掉 path.join(root, ...)，改为留空。
    // 因为现在的架构是：用户在界面选文件 -> 存入对应方案的文件夹 -> 运行时动态拼接路径
    DRAMA_LIST: "",
    TEMPLATE: "",
    ACCOUNTS: "",
    BUSINESS_TYPE: "端原生-付费短剧",
    PAGE_NUM: 20,
    PROJECT_NUM: 1,
    ADS_NUM: 1,
    isAccountFlat: false,
    dateRange: ""
  },
  DRAMA_FIELD_NAMES: {
    targetDramaName: "产品名称",
    copyright: "版权",
    testDramaTitle: "素材名称",
    dramaCount: "素材个数",
    specifyMaterials: "指定素材",
    proNumNew: "新建项目数",
    adsNumNew: "新建广告数",
    materialFileName: "素材文件名称",
    materialDateRange: "素材榜单时间"
  },
  SETTINGS: {
    ACCOUNT_MATCH_COUNT: 2,
    ACTION: "cancel"
  },
  /** 运行页「方案集」：{ id, name, profiles: string[] }[] */
  profileSets: []
};
const getAppRootDir = () => {
  return electron.app.getPath("userData");
};
const getAppInstanceId = () => {
  const argv = process.argv || [];
  const rawArg = argv.find((arg) => typeof arg === "string" && arg.startsWith("--instance=")) || (argv.includes("--instance") ? argv[argv.indexOf("--instance") + 1] : "");
  const value = String(rawArg || "").replace("--instance=", "").trim().toLowerCase();
  if (!value || value === "default" || value === "main" || value === "a") return "";
  return value.replace(/[^a-z0-9_-]/g, "").slice(0, 32);
};
const APP_INSTANCE_ID = getAppInstanceId();
const STORAGE_BASE_DIR = path$1.join(getAppRootDir(), "ZS_Assistant_Storage");
const DATA_ROOT = APP_INSTANCE_ID ? path$1.join(STORAGE_BASE_DIR, `instance_${APP_INSTANCE_ID}`) : STORAGE_BASE_DIR;
const PROFILES_DIR = path$1.join(DATA_ROOT, "profiles_records");
const USER_DATA_PATH = path$1.join(DATA_ROOT, "zs_user_config.json");
if (!fs$1.existsSync(DATA_ROOT)) fs$1.mkdirSync(DATA_ROOT, { recursive: true });
if (!fs$1.existsSync(PROFILES_DIR)) fs$1.mkdirSync(PROFILES_DIR, { recursive: true });
const ALLOWED_INSTANCE_IDS = /* @__PURE__ */ new Set(["", "b"]);
const INSTANCE_SLOT_NAME = APP_INSTANCE_ID || "default";
const INSTANCE_LOCK_FILE = path$1.join(STORAGE_BASE_DIR, `.instance-${INSTANCE_SLOT_NAME}.lock`);
let instanceLockFd = null;
const isPidAlive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
};
const tryAcquireInstanceLock = () => {
  if (!fs$1.existsSync(STORAGE_BASE_DIR)) {
    fs$1.mkdirSync(STORAGE_BASE_DIR, { recursive: true });
  }
  if (fs$1.existsSync(INSTANCE_LOCK_FILE)) {
    try {
      const oldPid = parseInt(fs$1.readFileSync(INSTANCE_LOCK_FILE, "utf-8").trim(), 10);
      if (isPidAlive(oldPid)) return false;
      fs$1.unlinkSync(INSTANCE_LOCK_FILE);
    } catch (_error) {
      try {
        fs$1.unlinkSync(INSTANCE_LOCK_FILE);
      } catch (_innerError) {
      }
    }
  }
  try {
    instanceLockFd = fs$1.openSync(INSTANCE_LOCK_FILE, "wx");
    fs$1.writeFileSync(INSTANCE_LOCK_FILE, String(process.pid), "utf-8");
    return true;
  } catch (_error) {
    return false;
  }
};
const releaseInstanceLock = () => {
  try {
    if (instanceLockFd !== null) {
      fs$1.closeSync(instanceLockFd);
      instanceLockFd = null;
    }
  } catch (_error) {
  }
  try {
    if (fs$1.existsSync(INSTANCE_LOCK_FILE)) {
      fs$1.unlinkSync(INSTANCE_LOCK_FILE);
    }
  } catch (_error) {
  }
};
electron.app.on("before-quit", () => {
  releaseInstanceLock();
});
let userData = {};
let globalUiSender = null;
let autoFetchTimer = null;
const tryCreateNormalizedTableSidecar = (targetPath) => {
  try {
    const ext = path$1.extname(targetPath).toLowerCase();
    if (![".xlsx", ".xls", ".csv", ".json"].includes(ext)) return;
    const sidecarPath = `${targetPath}.normalized.json`;
    let rows = [];
    let headers = [];
    if (ext === ".json") {
      const raw = fs$1.readFileSync(targetPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        rows = parsed;
      } else if (Array.isArray(parsed?.rows)) {
        rows = parsed.rows;
      } else {
        return;
      }
      headers = Array.isArray(parsed?.headers) ? parsed.headers : rows[0] ? Object.keys(rows[0]) : [];
    } else {
      const workbook = xlsx.readFile(targetPath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      headers = (xlsx.utils.sheet_to_json(sheet, { header: 1 })[0] || []).map((v) => String(v).trim());
      rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
    }
    const payload = {
      version: 1,
      sourceFile: path$1.basename(targetPath),
      generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      headers,
      rows
    };
    fs$1.writeFileSync(sidecarPath, JSON.stringify(payload, null, 2), "utf-8");
  } catch (error) {
    console.warn(`⚠️ 生成标准化侧车文件失败: ${error.message}`);
  }
};
const fetchGoodDramasLogic = async (params, sender = null) => {
  isFetchCancelled = false;
  try {
    const authRes = await ensureAuth(
      userData.WORKING_CONFIG?.account,
      userData.WORKING_CONFIG?.password,
      userData.session
    );
    if (!authRes.success) {
      return { success: false, msg: authRes.msg };
    }
    if (authRes.session.time !== userData.session?.time) {
      userData.session = authRes.session;
      saveUserData();
    }
    const authHeaders = authRes.headers;
    const today = getTodayString();
    const { roiThreshold = 0.7, exportConfig, selectedProfiles, interval, startDay, endDay, ...restParams } = params || {};
    const sDay = startDay || today;
    const eDay = endDay || today;
    let allDramas = [];
    let currentPage = 1;
    const MAX_PAGE_SIZE = 200;
    let totalItems = 0;
    const cleanParams = Object.fromEntries(
      Object.entries(restParams).filter(([_, v]) => v !== null && v !== void 0)
    );
    do {
      if (isFetchCancelled) {
        console.log("🛑 收到中止指令，停止翻页");
        return { success: false, msg: "CANCELLED" };
      }
      const queryObj = {
        bookInfo: "",
        promotionInfo: "",
        advertiserInfo: "",
        cdpProjectInfo: "",
        cdpPromotionInfo: "",
        bidType: "NO_BID",
        linkType: "IAP",
        copyrightType: "分销",
        carrier: "link",
        startDay: sDay,
        // 🌟 核心修改 3：使用传入的开始日期
        endDay: eDay,
        // 🌟 核心修改 4：使用传入的结束日期
        "sortingFields[0].field": "statCost",
        "sortingFields[0].order": "desc",
        pageNo: currentPage,
        pageSize: MAX_PAGE_SIZE,
        ...cleanParams
      };
      const searchParams = new URLSearchParams(queryObj).toString();
      const url = `https://api.iocpx.com/adv-report-query/promotionDay/getLatestCostByDay?${searchParams}`;
      console.log(`[抓取中] 日期:${sDay} 至 ${eDay} | 第 ${currentPage} 页...`);
      const response = await axios.get(url, {
        headers: authHeaders,
        timeout: 2e4
      });
      const list = response.data?.data?.list || [];
      totalItems = response.data?.data?.total || 0;
      allDramas.push(...list);
      if (sender) {
        sender.send("fetch-log-update", {
          type: "progress",
          dateRange: `${sDay} 至 ${eDay}`,
          count: allDramas.length,
          total: totalItems
        });
      }
      if (allDramas.length >= totalItems || list.length === 0) break;
      currentPage++;
      await sleep(1e3);
    } while (true);
    console.log(`✅ 抓取结束。总条数: ${allDramas.length}`);
    const currentTime = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const filteredGoodList = allDramas.filter((item) => item.attributionBillingGameInAppRoi1day > roiThreshold).map((item) => ({
      bookName: item.bookName,
      roi: item.attributionBillingGameInAppRoi1day,
      cost: item.statCost || 0,
      fetchTime: currentTime
    }));
    return { success: true, data: filteredGoodList, totalProcessed: allDramas.length };
  } catch (error) {
    console.error("抓取异常:", error.message);
    return { success: false, msg: error.message };
  }
};
function migrateWorkingConfigAccountKey() {
  const w = userData.WORKING_CONFIG;
  if (!w || typeof w !== "object") return false;
  let changed = false;
  const acc = String(w.account ?? "").trim();
  const legacy = String(w.acount ?? "").trim();
  if (!acc && legacy) {
    w.account = legacy;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(w, "acount")) {
    delete w.acount;
    changed = true;
  }
  return changed;
}
function loadUserData() {
  if (fs$1.existsSync(USER_DATA_PATH)) {
    try {
      const content = fs$1.readFileSync(USER_DATA_PATH, "utf-8");
      const parsedData = JSON.parse(content);
      userData = { ...CONFIG, ...parsedData };
    } catch (e) {
      console.error("❌ 读取配置文件失败:", e);
      userData = JSON.parse(JSON.stringify(CONFIG));
    }
  } else {
    userData = JSON.parse(JSON.stringify(CONFIG));
    saveUserData();
  }
  if (migrateWorkingConfigAccountKey()) {
    saveUserData();
  }
}
function saveUserData() {
  try {
    fs$1.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2));
    console.log("💾 配置已安全同步至 AppData");
  } catch (e) {
    console.error("❌ 配置文件保存失败:", e);
  }
}
function buildInitSettingsPayload(isUpdated = false) {
  return {
    ...userData,
    appVersion: electron.app.getVersion(),
    instanceId: APP_INSTANCE_ID,
    isUpdated
  };
}
function createWindow() {
  const instanceTag = APP_INSTANCE_ID ? ` [${APP_INSTANCE_ID}]` : "";
  const mainWindow = new electron.BrowserWindow({
    width: 1050,
    height: 750,
    show: false,
    title: `漫剧神器${instanceTag} v${electron.app.getVersion()}`,
    autoHideMenuBar: true,
    ...process.platform === "linux" ? { icon: path$1.join(__dirname, "../../build/icon.png") } : {},
    webPreferences: {
      preload: path$1.join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true
    }
  });
  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
    const currentVersion = electron.app.getVersion();
    let isFirstRunAfterUpdate = false;
    if (userData.lastAppVersion !== currentVersion) {
      isFirstRunAfterUpdate = true;
      userData.lastAppVersion = currentVersion;
      saveUserData();
    }
    mainWindow.webContents.send("init-settings", {
      ...buildInitSettingsPayload(isFirstRunAfterUpdate)
    });
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  if (utils.is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(path$1.join(__dirname, "../renderer/index.html"));
  }
}
electron.app.whenReady().then(() => {
  if (!ALLOWED_INSTANCE_IDS.has(APP_INSTANCE_ID)) {
    electron.dialog.showErrorBox(
      "实例启动受限",
      "当前版本仅允许双开：默认实例和 b 实例。\n请使用默认启动，或使用参数 --instance=b。"
    );
    electron.app.quit();
    return;
  }
  if (!tryAcquireInstanceLock()) {
    electron.dialog.showErrorBox(
      "实例已在运行",
      `实例 [${INSTANCE_SLOT_NAME}] 已经启动，当前版本最多只能双开（default + b）。`
    );
    electron.app.quit();
    return;
  }
  loadUserData();
  utils.electronApp.setAppUserModelId(APP_INSTANCE_ID ? `com.electron.${APP_INSTANCE_ID}` : "com.electron");
  electron.app.on("browser-window-created", (_, window) => {
    utils.optimizer.watchWindowShortcuts(window);
  });
  createWindow();
  electronUpdater.autoUpdater.setFeedURL("http://129.204.86.63:3535/updates");
  electronUpdater.autoUpdater.autoDownload = false;
  const sendUpdateMessage = (payload) => {
    if (globalUiSender) {
      globalUiSender.send("update-message", payload);
    } else {
      const windows = electron.BrowserWindow.getAllWindows();
      if (windows.length > 0) windows[0].webContents.send("update-message", payload);
    }
  };
  electronUpdater.autoUpdater.on("checking-for-update", () => console.log("🔄 正在检查更新..."));
  electronUpdater.autoUpdater.on("update-available", (info) => {
    sendUpdateMessage({ type: "available", version: info.version, msg: `发现新版本 v${info.version}` });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    sendUpdateMessage({ type: "latest", msg: "当前已经是最新版本！" });
  });
  electronUpdater.autoUpdater.on("download-progress", (progressObj) => {
    sendUpdateMessage({ type: "downloading", percent: Math.round(progressObj.percent) });
  });
  electronUpdater.autoUpdater.on("update-downloaded", () => {
    sendUpdateMessage({ type: "downloaded", msg: "🚀 新版本下载完成" });
  });
  electronUpdater.autoUpdater.on("error", () => {
    sendUpdateMessage({ type: "error", msg: `更新失败` });
  });
  electron.ipcMain.on("check-for-updates", (event) => {
    globalUiSender = event.sender;
    electronUpdater.autoUpdater.checkForUpdates();
  });
  electron.ipcMain.on("confirm-download", () => electronUpdater.autoUpdater.downloadUpdate());
  electron.ipcMain.on("confirm-install", () => electronUpdater.autoUpdater.quitAndInstall());
  electron.ipcMain.handle("fetch-good-dramas", async (event, params) => {
    return await fetchGoodDramasLogic(params, event.sender);
  });
  electron.ipcMain.on("start-auto-fetch", async (event, config) => {
    globalUiSender = event.sender;
    if (autoFetchTimer) clearInterval(autoFetchTimer);
    const intervalMs = config.interval * 60 * 1e3;
    const todayStr = getTodayString();
    const userKey = userData.KEY_CONFIG?.userKey || "";
    let initialCloudList = [];
    if (userKey) {
      try {
        const getUrl = `${BASE_SERVER_URL}/api/daily-record/get?license_key=${userKey.trim()}&date=${todayStr}`;
        const cloudRes = await axios.get(getUrl, { timeout: 4e3 });
        if (cloudRes.data?.status === "ok" && cloudRes.data?.data?.list) {
          initialCloudList = cloudRes.data.data.list;
        }
      } catch (e) {
        console.log("启动时拉取云端记录超时，使用本地缓存");
      }
    }
    if (!userData.dailyPublished || userData.dailyPublished.date !== todayStr || !Array.isArray(userData.dailyPublished.list)) {
      userData.dailyPublished = { date: todayStr, list: [] };
    }
    const initialMergedSet = /* @__PURE__ */ new Set([...userData.dailyPublished.list, ...initialCloudList]);
    const initialMergedArray = Array.from(initialMergedSet);
    if (initialMergedArray.length > 0) {
      event.sender.send("fetch-log-update", {
        type: "success",
        msg: `📝 [防重记录] 今日全网已发剧集 (${initialMergedArray.length}部): ${initialMergedArray.join("、")}`
      });
    } else {
      event.sender.send("fetch-log-update", {
        type: "success",
        msg: `📝 [防重记录] 经核对，今日全网暂无上剧记录，配额充足！`
      });
    }
    const executeRoutine = async () => {
      try {
        event.sender.send("fetch-log-update", { type: "success", msg: `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] 正在按条件执行后台自动巡航...` });
        const res = await fetchGoodDramasLogic(config);
        if (res.success && res.data.length > 0) {
          let cloudList = [];
          if (userKey) {
            try {
              const getUrl = `${BASE_SERVER_URL}/api/daily-record/get?license_key=${userKey.trim()}&date=${todayStr}`;
              const cloudRes = await axios.get(getUrl, { timeout: 4e3 });
              if (cloudRes.data?.status === "ok" && cloudRes.data?.data?.list) {
                cloudList = cloudRes.data.data.list;
              }
            } catch (e) {
              console.log("⚠️ 云端拉取超时，降级为本地校验...", e.message);
            }
          }
          if (!userData.dailyPublished || userData.dailyPublished.date !== todayStr || !Array.isArray(userData.dailyPublished.list)) {
            userData.dailyPublished = { date: todayStr, list: [] };
          }
          const localList = userData.dailyPublished.list;
          const mergedPublishedSet = /* @__PURE__ */ new Set([...localList, ...cloudList]);
          const newDramas = res.data.filter((item) => !mergedPublishedSet.has(item.bookName));
          if (newDramas.length === 0) {
            event.sender.send("fetch-log-update", {
              type: "success",
              msg: `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] 发现 ${res.data.length} 个爆款，经云端核对今日均已分发，防重机制触发，跳过上剧。`
            });
            return;
          }
          newDramas.forEach((item) => userData.dailyPublished.list.push(item.bookName));
          saveUserData();
          if (userKey) {
            try {
              const fullListToUpload = Array.from(/* @__PURE__ */ new Set([...userData.dailyPublished.list]));
              await axios.post(`${BASE_SERVER_URL}/api/daily-record/save`, {
                license_key: userKey.trim(),
                date: todayStr,
                list: fullListToUpload
              }, { timeout: 4e3 });
            } catch (e) {
              console.log("⚠️ 上传云端失败，但本地已保存。", e.message);
            }
          }
          event.sender.send("fetch-log-update", { type: "data", list: newDramas });
          const globalAssetsDir = path$1.join(PROFILES_DIR, "global_assets");
          if (!fs$1.existsSync(globalAssetsDir)) fs$1.mkdirSync(globalAssetsDir, { recursive: true });
          const excelName = `Auto_Dramas_${Date.now()}.xlsx`;
          const excelPath = path$1.join(globalAssetsDir, excelName);
          const exportConf = config.exportConfig || { copyright: "ZZ番茄", materialCount: 30 };
          const headers = ["版权", "产品ID", "产品名称", "素材名称", "素材个数", "指定素材", "新建项目数", "新建广告数", "素材文件名称"];
          const rows = [headers];
          newDramas.forEach((item) => {
            rows.push([
              exportConf.copyright,
              "",
              item.bookName,
              "",
              exportConf.materialCount,
              "",
              1,
              1,
              ""
            ]);
          });
          const ws = xlsx.utils.aoa_to_sheet(rows);
          ws["!cols"] = [
            { wch: 12 },
            { wch: 12 },
            { wch: 35 },
            { wch: 15 },
            { wch: 10 },
            { wch: 15 },
            { wch: 12 },
            { wch: 12 },
            { wch: 20 }
          ];
          const wb = xlsx.utils.book_new();
          xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
          xlsx.writeFile(wb, excelPath);
          event.sender.send("fetch-log-update", { type: "success", msg: `剔除今日已上剧集后，将为您自动分发 ${newDramas.length} 部新爆款...` });
          const RUNTIME_CONFIG = JSON.parse(JSON.stringify(CONFIG));
          RUNTIME_CONFIG.KEY_CONFIG.userKey = userData.KEY_CONFIG?.userKey || "";
          RUNTIME_CONFIG.WORKING_CONFIG = userData.WORKING_CONFIG || {};
          RUNTIME_CONFIG.FILES.DRAMA_LIST = excelPath;
          RUNTIME_CONFIG.session = userData.session;
          const chosenProfiles = config.selectedProfiles || [];
          RUNTIME_CONFIG.SELECTED_PROFILES = Object.keys(userData.profiles || {}).filter((profileName) => chosenProfiles.includes(profileName)).map((profileName) => {
            const profileFolder = path$1.join(PROFILES_DIR, profileName);
            const pData = userData.profiles[profileName];
            return {
              name: profileName,
              businessType: pData.businessType,
              TEMPLATE: path$1.join(profileFolder, pData.files.TEMPLATE),
              ACCOUNTS: path$1.join(profileFolder, pData.files.ACCOUNTS)
            };
          });
          RUNTIME_CONFIG.SETTINGS.ACTION = "publish";
          event.sender.send("task-status-change", true);
          await runAutoTask(event.sender, RUNTIME_CONFIG);
          event.sender.send("fetch-log-update", { type: "success", msg: `🎉 本轮爆款跟进任务执行完毕！` });
        } else if (res.success && res.data.length === 0) {
          event.sender.send("fetch-log-update", { type: "success", msg: `[${(/* @__PURE__ */ new Date()).toLocaleTimeString()}] 本次巡航未发现 ROI > ${config.roiThreshold || 0.7} 的爆款` });
        } else if (res.msg !== "CANCELLED") {
          event.sender.send("fetch-log-update", { type: "error", msg: "后台巡航抓取失败: " + res.msg });
        }
      } catch (fatalError) {
        console.error("❌ 巡航逻辑发生致命崩溃:", fatalError);
        event.sender.send("fetch-log-update", { type: "error", msg: `引擎崩溃: ${fatalError.message}` });
        event.sender.send("task-status-change", false);
      }
    };
    executeRoutine();
    autoFetchTimer = setInterval(executeRoutine, intervalMs);
    event.sender.send("fetch-log-update", { type: "status", isRunning: true });
  });
  electron.ipcMain.on("stop-auto-fetch", (event) => {
    if (autoFetchTimer) {
      clearInterval(autoFetchTimer);
      autoFetchTimer = null;
    }
    stopAutoTask();
    isFetchCancelled = true;
    event.sender.send("fetch-log-update", { type: "status", isRunning: false });
    event.sender.send("fetch-log-update", {
      type: "success",
      msg: "🛑 已向后台发送停止指令，所有抓取和上剧任务将被中止！"
    });
  });
  electron.ipcMain.handle("dialog:openFile", async () => {
    const { canceled, filePaths } = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        { name: "表格或配置文件", extensions: ["xlsx", "xls", "csv", "json"] },
        { name: "Excel Files", extensions: ["xlsx", "xls"] },
        { name: "CSV Files", extensions: ["csv"] },
        { name: "JSON Files", extensions: ["json"] }
      ]
    });
    return canceled ? null : filePaths[0];
  });
  electron.ipcMain.handle("dialog:openExcelFile", async () => {
    const { canceled, filePaths } = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Excel", extensions: ["xlsx", "xls"] }]
    });
    return canceled ? null : filePaths[0];
  });
  electron.ipcMain.handle("batch-remove-accounts-from-profiles", async (_event, { accounts }) => {
    try {
      const targetSet = new Set(
        (accounts || []).map((a) => String(a).trim()).filter(Boolean)
      );
      if (!targetSet.size) return { success: false, msg: "账号列表为空" };
      const results = [];
      for (const [profileName, pData] of Object.entries(userData.profiles || {})) {
        const accountsFile = pData?.files?.ACCOUNTS;
        if (!accountsFile) {
          results.push({ profileName, deletedCount: 0, skipped: "未配置账号列表" });
          continue;
        }
        const filePath = path$1.join(PROFILES_DIR, profileName, accountsFile);
        if (!fs$1.existsSync(filePath)) {
          results.push({ profileName, deletedCount: 0, skipped: "文件不存在" });
          continue;
        }
        const workbook = xlsx.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const headerRow = xlsx.utils.sheet_to_json(sheet, { header: 1 })[0] || [];
        const headers = headerRow.map((v) => String(v).trim());
        const rows = xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
        const before = rows.length;
        const kept = rows.filter(
          (row) => !targetSet.has(String(row["账号"] || "").trim())
        );
        const deletedCount = before - kept.length;
        if (deletedCount > 0) {
          const newSheet = xlsx.utils.json_to_sheet(
            kept,
            headers.length ? { header: headers } : void 0
          );
          workbook.Sheets[sheetName] = newSheet;
          xlsx.writeFile(workbook, filePath);
          tryCreateNormalizedTableSidecar(filePath);
        }
        results.push({ profileName, deletedCount });
      }
      clearAccountsCache();
      return { success: true, results };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });
  electron.ipcMain.handle("import-profile-file", async (event, { profileName, sourcePath }) => {
    try {
      if (!profileName) throw new Error("请先输入或选择方案名称");
      const targetFolder = path$1.join(PROFILES_DIR, profileName);
      if (!fs$1.existsSync(targetFolder)) fs$1.mkdirSync(targetFolder, { recursive: true });
      const fileName = path$1.basename(sourcePath);
      const targetPath = path$1.join(targetFolder, fileName);
      fs$1.copyFileSync(sourcePath, targetPath);
      tryCreateNormalizedTableSidecar(targetPath);
      return { success: true, fileName };
    } catch (err) {
      return { success: false, msg: err.message };
    }
  });
  electron.ipcMain.on("open-profile-folder", (event, profileName) => {
    const folderPath = profileName ? path$1.join(PROFILES_DIR, profileName) : PROFILES_DIR;
    electron.shell.openPath(fs$1.existsSync(folderPath) ? folderPath : PROFILES_DIR);
  });
  electron.ipcMain.handle("delete-profile-folder", async (event, profileName) => {
    try {
      if (!profileName) return { success: false, msg: "方案名为空" };
      const targetDir = path$1.join(PROFILES_DIR, profileName);
      if (fs$1.existsSync(targetDir)) {
        await fs$1.promises.rm(targetDir, { recursive: true, force: true });
      }
      return { success: true };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });
  electron.ipcMain.handle("rename-profile-folder", async (_event, payload) => {
    try {
      const oldName = typeof payload?.oldName === "string" ? payload.oldName.trim() : "";
      const newName = typeof payload?.newName === "string" ? payload.newName.trim() : "";
      if (!oldName || !newName) return { success: false, msg: "方案名不能为空" };
      if (oldName === newName) return { success: true };
      const oldDir = path$1.join(PROFILES_DIR, oldName);
      const newDir = path$1.join(PROFILES_DIR, newName);
      if (fs$1.existsSync(newDir)) {
        return { success: false, msg: `目标方案目录已存在: ${newName}` };
      }
      if (!fs$1.existsSync(oldDir)) {
        return { success: true };
      }
      await fs$1.promises.rename(oldDir, newDir);
      return { success: true };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });
  electron.ipcMain.handle("open-file-external", async (event, payload) => {
    try {
      let targetPath = payload;
      if (typeof payload === "object" && payload !== null) {
        targetPath = path$1.join(PROFILES_DIR, payload.profileName, payload.fileName);
      }
      const errorMessage = await electron.shell.openPath(targetPath);
      if (errorMessage) return { success: false, msg: errorMessage };
      return { success: true };
    } catch (err) {
      return { success: false, msg: err.message };
    }
  });
  electron.ipcMain.on("update-profiles", (event, payload) => {
    if (payload && typeof payload === "object" && payload.profiles) {
      userData.profiles = payload.profiles;
      userData.profileOrder = Array.isArray(payload.profileOrder) ? payload.profileOrder : Object.keys(payload.profiles || {});
    } else {
      userData.profiles = payload || {};
      userData.profileOrder = Object.keys(userData.profiles || {});
    }
    saveUserData();
  });
  electron.ipcMain.on("save-settings-only", (event, flatData) => {
    userData.KEY_CONFIG.userKey = flatData.userKey;
    userData.WORKING_CONFIG = {
      account: flatData.workingAccount,
      password: flatData.workingPassword
    };
    userData.FILES = {
      ...userData.FILES,
      globalDramaList: flatData.globalDramaList,
      PAGE_NUM: flatData.pageNum,
      PROJECT_NUM: flatData.projectNum,
      ADS_NUM: flatData.adsNum,
      isAccountFlat: flatData.isAccountFlat,
      dateRange: flatData.dateRange
    };
    if (!userData.SETTINGS) userData.SETTINGS = {};
    userData.SETTINGS.ACCOUNT_MATCH_COUNT = flatData.accountMatchCount;
    if (Array.isArray(flatData.profileSets)) {
      userData.profileSets = flatData.profileSets;
    }
    saveUserData();
  });
  electron.ipcMain.on("save-session-persistent", (event, sessionData) => {
    userData.session = sessionData;
    saveUserData();
  });
  electron.ipcMain.on("stop-task", () => {
    stopAutoTask();
  });
  electron.ipcMain.on("run-task", async (event, uiConfig) => {
    globalUiSender = event.sender;
    const rawSelected = Array.isArray(uiConfig.selectedProfiles) ? uiConfig.selectedProfiles : [];
    const validProfileNames = rawSelected.filter((n) => userData.profiles?.[n]);
    if (validProfileNames.length === 0) {
      if (rawSelected.length > 0) {
        event.sender.send(
          "log-update",
          `<span style="color:red;">❌ 所选方案已不存在或已删除，请重新选择后启动。</span>`
        );
      }
      return;
    }
    const uiConfigSafe = { ...uiConfig, selectedProfiles: validProfileNames };
    userData.lastConfig = uiConfigSafe;
    saveUserData();
    const RUNTIME_CONFIG = JSON.parse(JSON.stringify(CONFIG));
    RUNTIME_CONFIG.KEY_CONFIG.userKey = uiConfig.userKey;
    RUNTIME_CONFIG.WORKING_CONFIG = {
      account: uiConfig.workingAccount,
      password: uiConfig.workingPassword
    };
    RUNTIME_CONFIG.FILES.DRAMA_LIST = path$1.join(PROFILES_DIR, "global_assets", uiConfig.globalDramaList);
    RUNTIME_CONFIG.SELECTED_PROFILES = validProfileNames.map((profileName) => {
      const profileFolder = path$1.join(PROFILES_DIR, profileName);
      const pData = userData.profiles[profileName];
      return {
        name: profileName,
        businessType: pData.businessType,
        enableCustomAccountMatchCount: pData.enableCustomAccountMatchCount === true,
        accountMatchCount: pData.accountMatchCount ?? null,
        TEMPLATE: path$1.join(profileFolder, pData.files.TEMPLATE),
        ACCOUNTS: path$1.join(profileFolder, pData.files.ACCOUNTS)
      };
    });
    RUNTIME_CONFIG.FILES.PAGE_NUM = uiConfig.pageNum ?? 1;
    RUNTIME_CONFIG.FILES.PROJECT_NUM = uiConfig.projectNum ?? 1;
    RUNTIME_CONFIG.FILES.ADS_NUM = uiConfig.adsNum ?? 1;
    RUNTIME_CONFIG.FILES.isAccountFlat = uiConfig.isAccountFlat ?? false;
    RUNTIME_CONFIG.FILES.dateRange = uiConfig.dateRange || "";
    RUNTIME_CONFIG.SETTINGS.ACTION = uiConfig.action;
    RUNTIME_CONFIG.SETTINGS.RANKING_TYPE = uiConfig.rankingType || "material";
    if (!RUNTIME_CONFIG.SETTINGS) RUNTIME_CONFIG.SETTINGS = {};
    RUNTIME_CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT = uiConfig.accountMatchCount ?? 2;
    RUNTIME_CONFIG.SETTINGS.REQUEST_THROTTLE_MULTIPLIER = APP_INSTANCE_ID === "b" ? 3 : 1;
    RUNTIME_CONFIG.SETTINGS.BATCH_THRESHOLD = 50;
    RUNTIME_CONFIG.session = userData.session;
    try {
      event.sender.send("task-status-change", true);
      await runAutoTask(event.sender, RUNTIME_CONFIG);
    } catch (err) {
      console.error("[run-task]", err);
    } finally {
      event.sender.send("task-status-change", false);
    }
  });
  electron.ipcMain.handle(
    "cloud:save-profiles",
    async (event, { userKey, profiles, profileSets }) => {
      try {
        const setsForZip = Array.isArray(profileSets) ? profileSets : Array.isArray(userData.profileSets) ? userData.profileSets : [];
        if (Array.isArray(profileSets)) {
          userData.profileSets = profileSets;
          saveUserData();
        }
        const zip = new AdmZip();
        if (fs$1.existsSync(PROFILES_DIR)) zip.addLocalFolder(PROFILES_DIR, "profiles_records");
        zip.addFile("profiles_config.json", Buffer.from(JSON.stringify(profiles), "utf8"));
        zip.addFile("profile_sets.json", Buffer.from(JSON.stringify(setsForZip), "utf8"));
        const zipBuffer = zip.toBuffer();
        const form = new FormData();
        form.append("license_key", userKey);
        form.append("backup_file", zipBuffer, { filename: `backup_${userKey}.zip`, contentType: "application/zip" });
        const headers = form.getHeaders();
        headers["Content-Length"] = form.getLengthSync();
        const response = await axios.post("http://129.204.86.63:3535/api/profiles/save", form, {
          headers,
          timeout: 6e4,
          maxBodyLength: Infinity,
          maxContentLength: Infinity
        });
        return response.data;
      } catch (error) {
        const serverDetail = error.response?.data?.msg || error.message;
        return { status: "error", msg: "备份失败: " + serverDetail };
      }
    }
  );
  electron.ipcMain.handle("cloud:get-profiles", async (event, userKey) => {
    try {
      const response = await axios.get(`http://129.204.86.63:3535/api/profiles/get?license_key=${userKey}`, {
        responseType: "arraybuffer",
        timeout: 6e4
      });
      const contentType = response.headers["content-type"];
      if (contentType && contentType.includes("application/json")) {
        return JSON.parse(Buffer.from(response.data).toString("utf8"));
      }
      const zip = new AdmZip(Buffer.from(response.data));
      zip.extractAllTo(DATA_ROOT, true);
      const oldDirPath = path$1.join(DATA_ROOT, "profiles_data");
      if (fs$1.existsSync(oldDirPath) && oldDirPath !== PROFILES_DIR) {
        if (fs$1.existsSync(PROFILES_DIR)) fs$1.rmSync(PROFILES_DIR, { recursive: true, force: true });
        fs$1.renameSync(oldDirPath, PROFILES_DIR);
      }
      const configPath = path$1.join(DATA_ROOT, "profiles_config.json");
      let profilesData = {};
      if (fs$1.existsSync(configPath)) {
        profilesData = JSON.parse(fs$1.readFileSync(configPath, "utf-8"));
        userData.profiles = profilesData;
        saveUserData();
        fs$1.unlinkSync(configPath);
      }
      const profileSetsPath = path$1.join(DATA_ROOT, "profile_sets.json");
      let restoredProfileSets = null;
      if (fs$1.existsSync(profileSetsPath)) {
        try {
          const parsedSets = JSON.parse(fs$1.readFileSync(profileSetsPath, "utf-8"));
          if (Array.isArray(parsedSets)) {
            userData.profileSets = parsedSets;
            restoredProfileSets = parsedSets;
            saveUserData();
          }
        } catch (_) {
        }
        try {
          fs$1.unlinkSync(profileSetsPath);
        } catch (_) {
        }
      }
      return {
        status: "ok",
        data: profilesData,
        profileSetsUpdatedFromBackup: restoredProfileSets !== null,
        profileSets: Array.isArray(userData.profileSets) ? userData.profileSets : []
      };
    } catch (error) {
      return { status: "error", msg: "下载失败: " + error.message };
    }
  });
  const normalizeRemoteProfileSets = (body) => {
    if (body == null) return null;
    if (Array.isArray(body)) return body;
    if (typeof body !== "object") return null;
    if (Array.isArray(body.profileSets)) return body.profileSets;
    if (Array.isArray(body.data)) return body.data;
    if (body.data && typeof body.data === "object" && Array.isArray(body.data.profileSets)) {
      return body.data.profileSets;
    }
    return null;
  };
  electron.ipcMain.handle("profile-sets:save-remote", async (_event, { account, profileSets }) => {
    const acc = typeof account === "string" ? account.trim() : "";
    if (!acc) return { status: "error", msg: "账号为空" };
    if (!Array.isArray(profileSets)) return { status: "error", msg: "方案集数据无效" };
    try {
      const response = await axios.post(
        "http://129.204.86.63:3535/api/profile-sets/save",
        { account: acc, profileSets },
        { headers: { "Content-Type": "application/json" }, timeout: 3e4 }
      );
      const data = response.data;
      if (data && typeof data === "object" && data.status === "error") {
        return { status: "error", msg: data.msg || data.message || "保存失败" };
      }
      return { status: "ok", ...typeof data === "object" && data ? data : {} };
    } catch (error) {
      const detail = error.response?.data?.msg || error.response?.data?.message || error.message;
      return { status: "error", msg: "保存失败: " + detail };
    }
  });
  electron.ipcMain.handle("profile-sets:get-remote", async (_event, account) => {
    const acc = typeof account === "string" ? account.trim() : "";
    if (!acc) return { status: "error", msg: "账号为空" };
    try {
      const response = await axios.get("http://129.204.86.63:3535/api/profile-sets/get", {
        params: { account: acc },
        timeout: 3e4
      });
      const body = response.data;
      if (body && typeof body === "object" && body.status === "error") {
        return { status: "error", msg: body.msg || body.message || "获取失败" };
      }
      const list = normalizeRemoteProfileSets(body);
      if (!Array.isArray(list)) {
        return { status: "error", msg: "服务器返回的方案集格式无法识别" };
      }
      return { status: "ok", profileSets: list };
    } catch (error) {
      const detail = error.response?.data?.msg || error.response?.data?.message || error.message;
      return { status: "error", msg: "获取失败: " + detail };
    }
  });
  electron.ipcMain.handle("dialog:showMessage", async (event, options) => {
    const result = await electron.dialog.showMessageBox(electron.BrowserWindow.fromWebContents(event.sender), options);
    return result.response;
  });
  electron.ipcMain.handle("settings:reload-current-instance", async () => {
    loadUserData();
    return buildInitSettingsPayload(false);
  });
  electron.ipcMain.handle("download-drama-template", async (event) => {
    try {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      const desktopPath = electron.app.getPath("desktop");
      const defaultPath = path$1.join(desktopPath, "全局剧单_标准模板.xlsx");
      const { canceled, filePath } = await electron.dialog.showSaveDialog(win, {
        title: "保存全局剧单模板",
        defaultPath,
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }]
      });
      if (canceled || !filePath) return { success: false, msg: "取消下载" };
      const headers = ["版权", "产品ID", "产品名称", "素材名称", "素材个数", "指定素材", "新建项目数", "新建广告数", "素材文件名称"];
      const worksheet = xlsx.utils.aoa_to_sheet([headers]);
      worksheet["!cols"] = [
        { wch: 10 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 10 },
        { wch: 25 },
        { wch: 12 },
        { wch: 12 },
        { wch: 25 }
      ];
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      xlsx.writeFile(workbook, filePath);
      return { success: true, filePath };
    } catch (error) {
      return { success: false, msg: error.message };
    }
  });
  electron.ipcMain.on("open-storage-dir", () => {
    electron.shell.openPath(DATA_ROOT);
  });
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  electron.ipcMain.handle("export-dramas-excel", async (event, { dramas, config }) => {
    try {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      const defaultPath = path$1.join(electron.app.getPath("desktop"), `爆款剧单_${getTodayString()}.xlsx`);
      const { canceled, filePath } = await electron.dialog.showSaveDialog(win, {
        title: "导出爆款剧单",
        defaultPath,
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }]
      });
      if (canceled || !filePath) return { success: false, msg: "取消下载" };
      const headers = ["版权", "产品ID", "产品名称", "素材名称", "素材个数", "指定素材", "新建项目数", "新建广告数", "素材文件名称"];
      const rows = [headers];
      dramas.forEach((item) => {
        rows.push([
          config.copyright || "",
          // 填入预设的版权
          "",
          item.bookName,
          "",
          config.materialCount || 30,
          // 填入素材个数
          "",
          "",
          // 填入项目数
          "",
          // 填入广告数
          ""
        ]);
      });
      const ws = xlsx.utils.aoa_to_sheet(rows);
      ws["!cols"] = [
        { wch: 12 },
        // [0] 版权
        { wch: 12 },
        // [1] 产品ID
        { wch: 35 },
        // [2] 产品名称 (⭐加宽)
        { wch: 15 },
        // [3] 素材名称
        { wch: 10 },
        // [4] 素材个数
        { wch: 15 },
        // [5] 指定素材
        { wch: 12 },
        // [6] 新建项目数
        { wch: 12 },
        // [7] 新建广告数
        { wch: 20 }
        // [8] 素材文件名称
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
electron.ipcMain.on("cancel-fetch-dramas", () => {
  isFetchCancelled = true;
});
const BASE_SERVER_URL = "http://129.204.86.63:3535";
electron.ipcMain.handle("save-fetch-settings", async (event, data) => {
  try {
    userData.fetchSettings = data;
    saveUserData();
    const userKey = userData.KEY_CONFIG?.userKey;
    if (userKey && userKey.trim() !== "") {
      const saveUrl = `${BASE_SERVER_URL}/api/fetch-settings/save`;
      await axios.post(saveUrl, {
        license_key: userKey.trim(),
        settings: data
      }, { timeout: 5e3 });
      console.log("✅ 雷达配置已成功同步至云端");
    }
    return { success: true };
  } catch (error) {
    console.error("❌ 保存配置时发生异常:", error.message);
    return { success: false, msg: "本地已保存，但同步云端失败: " + error.message };
  }
});
electron.ipcMain.handle("get-fetch-settings", async () => {
  try {
    const userKey = userData.KEY_CONFIG?.userKey;
    if (userKey && userKey.trim() !== "") {
      const getUrl = `${BASE_SERVER_URL}/api/fetch-settings/get?license_key=${userKey.trim()}`;
      const response = await axios.get(getUrl, { timeout: 5e3 });
      if (response.data.status === "ok" && response.data.data) {
        userData.fetchSettings = response.data.data;
        saveUserData();
        return { success: true, data: response.data.data };
      }
    }
    return { success: true, data: userData.fetchSettings || null };
  } catch (error) {
    console.log("⚠️ 读取云端配置失败，使用本地缓存:", error.message);
    return { success: true, data: userData.fetchSettings || null };
  }
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
