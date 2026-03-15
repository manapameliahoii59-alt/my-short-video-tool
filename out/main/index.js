"use strict";
const electron = require("electron");
const path$1 = require("node:path");
const utils = require("@electron-toolkit/utils");
const fs$1 = require("node:fs");
const axios = require("axios");
const AdmZip = require("adm-zip");
const FormData = require("form-data");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
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
  return String(str).split(/[\n,，]+/).map((item) => item.trim()).filter((item) => item.length > 0);
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
  try {
    const response = await axios.post(
      SERVER_URL,
      {
        license_key: userKey.trim(),
        machine_id: machineId,
        working_account: String(workingAccount).trim(),
        working_password: encryptedPassword
        // 🌟 发送加密后的密码
      },
      { timeout: 8e3 }
    );
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
    } else {
      console.log(`
🚫 授权被拦截: ${resData.msg}`);
      return { status: -1, msg: resData.msg };
    }
  } catch (error) {
    console.log(`
🌐 网络异常，无法连接到验证服务器。`);
    return { status: -1, msg: "无法连接验证服务器，请检查网络" };
  }
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
function getCachedAccounts(filePath) {
  if (accountsCache) {
    return accountsCache;
  }
  console.log("📂 [工具类] 正在读取账号库 Excel 到内存...");
  try {
    const workbook = xlsx.readFile(filePath);
    const rows = xlsx.utils.sheet_to_json(
      workbook.Sheets[workbook.SheetNames[0]],
      { defval: "", raw: false }
      // raw: false 防止长数字变为科学计数法
    );
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
typeof process.pkg !== "undefined";
let minTime = null;
let maxTime = null;
let uiSender = null;
let CONFIG$1 = null;
let uiSelectedExcelPath = null;
let isCancelled = false;
const originalLog = console.log;
console.log = function(...args) {
  originalLog.apply(console, args);
  if (uiSender) {
    const msg = util.format(...args);
    uiSender.send("log-update", msg);
  }
};
const originalError = console.error;
console.error = function(...args) {
  originalError.apply(console, args);
  if (uiSender) {
    const msg = util.format(...args);
    uiSender.send("log-update", `<span style="color:red;">❌ ${msg}</span>`);
  }
};
const CONFIGData = {
  BASE_URL: "https://api.iocpx.com",
  SESSION_FILE: path.join(rootDir, "session.json"),
  BOOK_FILE: path.join(rootDir, "剧单.xlsx"),
  TEMPLATE_FILE: path.join(rootDir, "模板_付费.xlsx")
};
const client = axios.create({
  baseURL: CONFIGData.BASE_URL,
  timeout: 15e3,
  headers: {
    "Content-Type": "application/json",
    Origin: "https://console.iocpx.com",
    Referer: "https://console.iocpx.com/"
  }
});
function getAvailableAccounts(targetConfig, x = CONFIG$1.SETTINGS.ACCOUNT_MATCH_COUNT) {
  const rows = getCachedAccounts(CONFIG$1.FILES.ACCOUNTS);
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
    if (CONFIG$1.FILES.BUSINESS_TYPE === "端原生-付费短剧") {
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
  const countToTake = Math.min(shuffled.length, x);
  return shuffled.slice(0, countToTake).map((row) => String(row["账号"]).trim());
}
const writeApiLog = (step, params, response) => {
  return;
};
let globalSession = { token: "", time: 0 };
async function ensureAuth() {
  let sessionId = "";
  if (globalSession.token && Date.now() - globalSession.time < 6 * 24 * 60 * 60 * 1e3) {
    sessionId = globalSession.token;
  }
  if (sessionId) {
    try {
      const testHeaders = {
        authorization: sessionId,
        cookie: `ocpx_session_id=${sessionId}`
      };
      let testAuthRes = await client.get("/merchant/auth/info", {
        headers: testHeaders
      });
      if (testAuthRes.data?.code == 1001000001) {
        console.log("🔄 登录已过期, 准备重新登陆...");
        sessionId = "";
        globalSession = { token: "", time: 0 };
      } else {
        console.log("✅ 登录状态有效 (内存复用)");
        await client.post(
          "/merchant/auth/login2",
          { moduleId: 3 },
          { headers: testHeaders }
        );
        client.defaults.headers.common["authorization"] = sessionId;
        client.defaults.headers.common["cookie"] = `ocpx_session_id=${sessionId}`;
        return true;
      }
    } catch (err) {
      sessionId = "";
      globalSession = { token: "", time: 0 };
    }
  }
  if (!sessionId) {
    console.log("🔐 正在执行自动登录...");
    delete client.defaults.headers.common["authorization"];
    delete client.defaults.headers.common["cookie"];
    const { account, password } = CONFIG$1.WORKING_CONFIG;
    if (!account || !password) {
      console.error("❌ 无法登录：未获取到主账号或密码");
      return false;
    }
    try {
      const r1 = await client.post("/merchant/auth/login1", {
        email: account,
        password,
        rememberMe: true
      });
      const setCookie = r1.headers["set-cookie"];
      sessionId = setCookie.find((s) => s.startsWith("ocpx_session_id=")).split(";")[0].split("=")[1];
      await client.post(
        "/merchant/auth/login2",
        { moduleId: 3 },
        { headers: { cookie: `ocpx_session_id=${sessionId}` } }
      );
      globalSession = {
        token: sessionId,
        time: Date.now()
      };
      if (uiSender) {
        uiSender.send("save-session-persistent", globalSession);
      }
      console.log("✅ 登录成功");
    } catch (err) {
      console.error("❌ 登录失败:", err.message);
      return false;
    }
  }
  client.defaults.headers.common["authorization"] = sessionId;
  client.defaults.headers.common["cookie"] = `ocpx_session_id=${sessionId}`;
  return true;
}
let materialFileNameList = null;
async function getMaterialFileName() {
  let materialFileNameRaw = null;
  materialFileNameRaw = await client.post("adv-asset-inside/folder/search", {
    pageNo: 1,
    pageSize: 150,
    query: null,
    projectId: null,
    libraryType: "public",
    showPrivateOnly: false,
    queryPolicy: "ft"
  });
  materialFileNameList = materialFileNameRaw?.data?.data?.list;
}
function getTargetMaterialFileId(fileName) {
  if (materialFileNameList && Array.isArray(materialFileNameList) && materialFileNameList.length > 0 && fileName) {
    return materialFileNameList.find((item) => {
      return item.name === clearSpaces(fileName);
    });
  }
}
const GLOBAL_CACHE = {
  dramaInfo: {},
  linkTemplate: {},
  strategy: {},
  titlePackage: {},
  accountsList: null
};
async function getDataWithCache(type, key, fetchFn) {
  const shortKey = key.length > 20 ? key.substring(0, 20) + "..." : key;
  if (GLOBAL_CACHE[type] && GLOBAL_CACHE[type][key]) {
    console.log(`   ⚡ [缓存命中] ${type}: ${shortKey}`);
    return GLOBAL_CACHE[type][key];
  }
  console.log(`   🌐 [发起请求] ${type}: ${shortKey}`);
  const data = await fetchFn();
  if (data) {
    GLOBAL_CACHE[type][key] = data;
  }
  return data;
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
  try {
    const dramaCacheKey = `${productName}_${CONFIG$1.FILES.BUSINESS_TYPE}_${copyrightData}`;
    const productDataList = await getDataWithCache(
      "dramaInfo",
      dramaCacheKey,
      async () => {
        let resbookParmas = {
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
    if (!productDataList || productDataList.length === 0) {
      throw new Error(`未找到剧集信息或版权不匹配: ${productName}`);
    }
    let productInfo;
    if (CONFIG$1.FILES.BUSINESS_TYPE === "端原生-付费短剧") {
      productInfo = matchByInput(productDataList, proConfig_subjectId);
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
      subject: proConfigData.proConfig_subject
    });
    if (Array.isArray(accountIds) && accountIds.length == 0)
      throw new Error(`未获取到可用账号`);
    const getAccount = await client.post(
      "/adv-vlsc-toutiao/account/queryByAdvertiserIds",
      accountIds
    );
    const accountData = getAccount.data?.data;
    if (!accountData) throw new Error(`未获取账户信息,${accountIds}`);
    let accountList = accountData.map((item) => item.advertiserName);
    let idsList = accountData.map((item) => item.advertiserId);
    await randomSleep(minTime, maxTime);
    let tarMaterItem;
    if (materialFileNameData) {
      tarMaterItem = getTargetMaterialFileId(materialFileNameData);
    }
    let resAsset;
    let materials = [];
    let rankingListOrLibrarySign = "";
    let isSpecify = Array.isArray(specifyMaterialsArr) && specifyMaterialsArr.length > 0;
    console.log(`   🔍 正在搜索素材 (Key: ${searchProductName})...`);
    let rangeDataObj = getDateRangeByType(materialDateRangeData);
    if (isSpecify) {
      rankingListOrLibrarySign = "素材库";
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
      if (tarMaterItem?.id) _materialPar.folderId = tarMaterItem?.id;
      resAsset = await client.post("/adv-asset-inside/search", _materialPar);
      const rawMaterials = resAsset.data?.data?.materials || [];
      materials = rawMaterials.filter((item) => item.url && item.coverUrl);
    } else if (!testDramaName) {
      rankingListOrLibrarySign = "素材榜单";
      const now = /* @__PURE__ */ new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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
      let rawList = resAsset.data?.data?.list || [];
      materials = rawList.filter((item) => item.videoUrl && item.poster);
      if (copyrightData == "ZZ番茄" && materials.length > 0) {
        materials = materials.filter(
          (materItem) => clearSpaces(materItem.bookName) == productName
        );
      }
      if (materials.length > 0) {
        let materialscheckArr = materials.map((item) => item.materialId);
        let checkRes = await client.post("/adv-asset-inside/material/findId", {
          oceanengineMaterialIds: materialscheckArr
        });
        let mappingTable = checkRes.data?.data || {};
        materials = materials.map((ele) => ({
          ...ele,
          mappingId: mappingTable[ele.materialId] || null
        }));
      }
    } else {
      rankingListOrLibrarySign = "素材库";
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
      if (tarMaterItem?.id) _Materialpar2.folderId = tarMaterItem?.id;
      resAsset = await client.post("/adv-asset-inside/search", _Materialpar2);
      const rawMaterials = resAsset.data?.data?.materials || [];
      materials = rawMaterials.filter((item) => item.url && item.coverUrl);
    }
    if (!materials || materials.length === 0)
      throw new Error(`素材查询结果为空`);
    console.log(
      `   🎬 素材获取成功: ${materials.length} 条 (${rankingListOrLibrarySign})`
    );
    const ydData = ("0" + ((/* @__PURE__ */ new Date()).getMonth() + 1)).slice(-2) + ("0" + (/* @__PURE__ */ new Date()).getDate()).slice(-2);
    const finalPublishName = `${productInfo.bookName}_${ydData}`;
    let materialInfoData = null;
    if (rankingListOrLibrarySign === "素材榜单") {
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
    const payload1 = {
      type: 0,
      bookName: productInfo.bookName,
      bookId: productInfo.bookId,
      source: productInfo.source,
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
      strategyType: 1,
      titleNum: 10,
      titlePackageIds: `[${titlePackage.id}]`,
      titleTextList: "[]",
      folderIdPaths: "[]",
      commentMaterialList: "[]",
      projectNum: pro_num,
      advertNum: ads_num,
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
      advertiserNames: JSON.stringify(accountList),
      publishName: finalPublishName
    };
    if (CONFIG$1.FILES.isAccountFlat) {
      payload1.strategyType = 2;
      payload1.advertNum = 0;
      payload1.projectNum = 0;
    }
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
    console.error(`❌ [${productName}] 数据组装失败: ${err.message}`);
    recordTaskStatus(dramaInfo, proConfigData, "ERROR", err.message);
    return null;
  }
}
async function submitBatchTasks(taskList) {
  if (!taskList || taskList.length === 0) return;
  const isPublish = CONFIG$1.SETTINGS.ACTION === "publish";
  console.log(
    `
🚀 [${isPublish ? "正式发布" : "测试模式"}] 开始处理 ${taskList.length} 个任务...`
  );
  try {
    const payload1List = taskList.map((t) => t.payload1);
    console.log(`⏳ 正在请求创建模板 (insert)...`);
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
    console.log(`✅ 模板创建成功，获取到 ${resultList.length} 个 ID`);
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
      console.warn("⚠️ 本批次无有效模板，跳过后续步骤");
      return;
    }
    console.log(`⏳ 模板已就绪，正在缓冲等待，准备最终提交...`);
    await randomSleep(1e3, 2e3);
    console.log(
      "\n-------------------------------------------------------------"
    );
    console.log(`📋 准备提交的数据 (${payload2List.length} 条):`);
    payload2List.forEach((p, idx) => {
      console.log(
        `   ${idx + 1}. 模板ID: ${p.publishTemplateId} | 剧名: ${p.bookName} | 策略: ${p.promotionStrategyName}`
      );
    });
    console.log(
      "-------------------------------------------------------------\n"
    );
    if (!isPublish) {
      console.log("🛑 [测试阻断] 已暂停最终提交 (publishInstance/batchInsert)");
      console.log("✅ 测试流程结束，数据已生成，未消耗真实配额。\n");
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
      console.log(`✨ [批量执行] ${payload2List.length} 个任务全部提交成功！`);
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
      console.error(`❌ [批量执行] Instance 提交失败: ${errorMsg}`);
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
    console.error(`❌ [测试阶段] 发生异常: ${err.message}`);
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
  const workbook = xlsx.readFile(CONFIG$1.FILES.DRAMA_LIST);
  return xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]).length;
}
async function loadDramaData(index) {
  const filePath = uiSelectedExcelPath || CONFIG$1.FILES.DRAMA_LIST;
  const workbook = xlsx.readFile(filePath);
  const data = xlsx.utils.sheet_to_json(
    workbook.Sheets[workbook.SheetNames[0]]
  );
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
  CONFIG$1 = uiConfig;
  uiSelectedExcelPath = CONFIG$1.FILES.DRAMA_LIST;
  clearAccountsCache();
  GLOBAL_CACHE.dramaInfo = {};
  GLOBAL_CACHE.linkTemplate = {};
  GLOBAL_CACHE.strategy = {};
  GLOBAL_CACHE.titlePackage = {};
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
  if (!await ensureAuth()) return;
  try {
    const dramaCount = await getDramaCount();
    console.log(
      `
===========================================================`
    );
    console.log(
      `🚀 任务启动：共选中 ${CONFIG$1.SELECTED_PROFILES.length} 个方案，总剧集 ${dramaCount} 部`
    );
    console.log(`===========================================================`);
    await getMaterialFileName();
    isCancelled = false;
    let globalTaskPool = [];
    const BATCH_THRESHOLD = 50;
    for (let pIndex = 0; pIndex < CONFIG$1.SELECTED_PROFILES.length; pIndex++) {
      if (isCancelled) return;
      const profile = CONFIG$1.SELECTED_PROFILES[pIndex];
      console.log(`

🔶 [方案切换] 开始方案: 【${profile.name}】`);
      CONFIG$1.FILES.TEMPLATE = profile.TEMPLATE;
      CONFIG$1.FILES.ACCOUNTS = profile.ACCOUNTS;
      CONFIG$1.FILES.BUSINESS_TYPE = profile.businessType;
      clearAccountsCache();
      if (!fs.existsSync(CONFIG$1.FILES.TEMPLATE) || !fs.existsSync(CONFIG$1.FILES.ACCOUNTS)) {
        console.error(`❌ [方案跳过] 【${profile.name}】文件不完整`);
        continue;
      }
      const workbookTemplate = xlsx.readFile(CONFIG$1.FILES.TEMPLATE);
      const allTemplates = xlsx.utils.sheet_to_json(
        workbookTemplate.Sheets[workbookTemplate.SheetNames[0]]
      );
      const templateRowCount = allTemplates.length;
      for (let j = 0; j < dramaCount; j++) {
        if (isCancelled) return;
        const dramaInfo = await loadDramaData(j);
        if (!dramaInfo) continue;
        console.log(
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
            proConfig_strategyId: String(row["策略包ID"]).trim(),
            proConfig_titlePackageId: String(row["标题组ID"]).trim(),
            proConfig_subject: String(row["主体"]).trim()
          };
          const taskData = await generatePublishPayload(
            dramaInfo,
            proConfigData
          );
          if (isCancelled) return;
          if (taskData) {
            globalTaskPool.push(taskData);
            if (globalTaskPool.length >= BATCH_THRESHOLD) {
              console.log(
                `
📦 [蓄水池满] 已积攒 ${BATCH_THRESHOLD} 条，发起批量提交...`
              );
              await submitBatchTasks(globalTaskPool);
              globalTaskPool = [];
              const coolDown = 5e3 + Math.random() * 3e3;
              console.log(
                `❄️ [频率保护] 提交完毕，进入 ${Math.round(coolDown / 1e3)} 秒深度冷却...`
              );
              await new Promise((res) => setTimeout(res, coolDown));
              if (isCancelled) return;
            }
          }
        }
        await new Promise((res) => setTimeout(res, 500));
        if (isCancelled) return;
        const authDataResult = await checkAuth(
          CONFIG$1.KEY_CONFIG.userKey,
          CONFIG$1.WORKING_CONFIG.account,
          CONFIG$1.WORKING_CONFIG.password
        );
        if (authDataResult.status !== 1) throw new Error(authDataResult.msg);
      }
      console.log(`✅ 方案【${profile.name}】预处理完毕！`);
      if (pIndex < CONFIG$1.SELECTED_PROFILES.length - 1) {
        const profileCoolDown = 3e3 + Math.random() * 3e3;
        console.log(`
⏸️ [方案切换缓冲] 休息 ${Math.round(profileCoolDown / 1e3)} 秒，准备载入下一个方案...`);
        await new Promise((res) => setTimeout(res, profileCoolDown));
        if (isCancelled) return;
      }
    }
    if (isCancelled) {
      console.log("\n🚫 任务已被手动取消！");
      return;
    }
    if (globalTaskPool.length > 0) {
      console.log(
        `
📦 [收尾提交] 处理最后剩余的 ${globalTaskPool.length} 条任务...`
      );
      await submitBatchTasks(globalTaskPool);
    }
    console.log("\n🎉 所有选中的方案队列已全部执行结束");
  } catch (e) {
    console.error("❌ 程序核心逻辑运行异常:", e.message);
  }
}
function stopAutoTask() {
  isCancelled = true;
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
  }
};
const getAppRootDir = () => {
  return electron.app.getPath("userData");
};
const DATA_ROOT = path$1.join(getAppRootDir(), "ZS_Assistant_Storage");
const PROFILES_DIR = path$1.join(DATA_ROOT, "profiles_records");
const USER_DATA_PATH = path$1.join(DATA_ROOT, "zs_user_config.json");
if (!fs$1.existsSync(DATA_ROOT)) fs$1.mkdirSync(DATA_ROOT, { recursive: true });
if (!fs$1.existsSync(PROFILES_DIR))
  fs$1.mkdirSync(PROFILES_DIR, { recursive: true });
let userData = {};
let globalUiSender = null;
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
}
function saveUserData() {
  try {
    fs$1.writeFileSync(USER_DATA_PATH, JSON.stringify(userData, null, 2));
    console.log("💾 配置已安全同步至 AppData");
  } catch (e) {
    console.error("❌ 配置文件保存失败:", e);
  }
}
function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1050,
    height: 750,
    show: false,
    title: `漫剧神器 v${electron.app.getVersion()}`,
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
      ...userData,
      appVersion: electron.app.getVersion(),
      isUpdated: isFirstRunAfterUpdate
      // 把“是否刚更新”的标记发给前端
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
  loadUserData();
  utils.electronApp.setAppUserModelId("com.electron");
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
      if (windows.length > 0)
        windows[0].webContents.send("update-message", payload);
    }
  };
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    console.log("🔄 正在检查更新...");
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    console.log(`✨ 发现新版本: v${info.version}`);
    sendUpdateMessage({
      type: "available",
      version: info.version,
      msg: `发现新版本 v${info.version}，是否立即在后台下载？`
    });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    sendUpdateMessage({ type: "latest", msg: "当前已经是最新版本！" });
  });
  electronUpdater.autoUpdater.on("download-progress", (progressObj) => {
    sendUpdateMessage({
      type: "downloading",
      percent: Math.round(progressObj.percent)
    });
  });
  electronUpdater.autoUpdater.on("update-downloaded", () => {
    sendUpdateMessage({
      type: "downloaded",
      msg: "🚀 新版本下载完成，是否立即重启以完成安装？"
    });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    sendUpdateMessage({ type: "error", msg: `更新失败` });
  });
  electron.ipcMain.on("check-for-updates", (event) => {
    globalUiSender = event.sender;
    electronUpdater.autoUpdater.checkForUpdates();
  });
  electron.ipcMain.on("confirm-download", () => {
    electronUpdater.autoUpdater.downloadUpdate();
  });
  electron.ipcMain.on("confirm-install", () => {
    electronUpdater.autoUpdater.quitAndInstall();
  });
  electron.ipcMain.handle("dialog:openFile", async () => {
    const { canceled, filePaths } = await electron.dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }]
    });
    return canceled ? null : filePaths[0];
  });
  electron.ipcMain.handle(
    "import-profile-file",
    async (event, { profileName, sourcePath }) => {
      try {
        if (!profileName) throw new Error("请先输入或选择方案名称");
        const targetFolder = path$1.join(PROFILES_DIR, profileName);
        if (!fs$1.existsSync(targetFolder))
          fs$1.mkdirSync(targetFolder, { recursive: true });
        const fileName = path$1.basename(sourcePath);
        const targetPath = path$1.join(targetFolder, fileName);
        fs$1.copyFileSync(sourcePath, targetPath);
        return { success: true, fileName };
      } catch (err) {
        return { success: false, msg: err.message };
      }
    }
  );
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
  electron.ipcMain.on("update-profiles", (event, profiles) => {
    userData.profiles = profiles;
    saveUserData();
  });
  electron.ipcMain.on("save-settings-only", (event, flatData) => {
    userData.KEY_CONFIG.userKey = flatData.userKey;
    userData.WORKING_CONFIG = {
      account: flatData.workingAccount,
      // 已修正拼写
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
    saveUserData();
  });
  electron.ipcMain.on("save-session-persistent", (event, sessionData) => {
    userData.session = sessionData;
    saveUserData();
  });
  electron.ipcMain.on("stop-task", (event) => {
    console.log("📥 主进程：接收到前端取消指令");
    stopAutoTask();
    if (globalUiSender) {
      globalUiSender.send("log-update", "⚠️ 正在取消任务，请稍候...");
    }
  });
  electron.ipcMain.on("run-task", async (event, uiConfig) => {
    globalUiSender = event.sender;
    userData.lastConfig = uiConfig;
    saveUserData();
    const RUNTIME_CONFIG = JSON.parse(JSON.stringify(CONFIG));
    RUNTIME_CONFIG.KEY_CONFIG.userKey = uiConfig.userKey;
    RUNTIME_CONFIG.WORKING_CONFIG = {
      account: uiConfig.workingAccount,
      password: uiConfig.workingPassword
    };
    RUNTIME_CONFIG.FILES.DRAMA_LIST = path$1.join(
      PROFILES_DIR,
      "global_assets",
      uiConfig.globalDramaList
    );
    RUNTIME_CONFIG.SELECTED_PROFILES = uiConfig.selectedProfiles.map(
      (profileName) => {
        const profileFolder = path$1.join(PROFILES_DIR, profileName);
        const pData = userData.profiles[profileName];
        return {
          name: profileName,
          businessType: pData.businessType,
          TEMPLATE: path$1.join(profileFolder, pData.files.TEMPLATE),
          ACCOUNTS: path$1.join(profileFolder, pData.files.ACCOUNTS)
        };
      }
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
      event.sender.send(
        "log-update",
        "🎉 [系统] 队列内所有方案自动化流程执行完毕。"
      );
    } catch (err) {
      event.sender.send("log-update", `❌ [程序异常] ${err.message}`);
    } finally {
      event.sender.send("task-status-change", false);
    }
  });
  electron.ipcMain.handle(
    "cloud:save-profiles",
    async (event, { userKey, profiles }) => {
      try {
        const zip = new AdmZip();
        if (fs$1.existsSync(PROFILES_DIR))
          zip.addLocalFolder(PROFILES_DIR, "profiles_records");
        zip.addFile(
          "profiles_config.json",
          Buffer.from(JSON.stringify(profiles), "utf8")
        );
        const zipBuffer = zip.toBuffer();
        const form = new FormData();
        form.append("license_key", userKey);
        form.append("backup_file", zipBuffer, {
          filename: `backup_${userKey}.zip`,
          contentType: "application/zip"
        });
        const headers = form.getHeaders();
        headers["Content-Length"] = form.getLengthSync();
        const response = await axios.post(
          "http://129.204.86.63:3535/api/profiles/save",
          form,
          {
            headers,
            timeout: 6e4,
            maxBodyLength: Infinity,
            maxContentLength: Infinity
          }
        );
        return response.data;
      } catch (error) {
        const serverDetail = error.response?.data?.msg || error.message;
        return { status: "error", msg: "备份失败: " + serverDetail };
      }
    }
  );
  electron.ipcMain.handle("cloud:get-profiles", async (event, userKey) => {
    try {
      const response = await axios.get(
        `http://129.204.86.63:3535/api/profiles/get?license_key=${userKey}`,
        {
          responseType: "arraybuffer",
          timeout: 6e4
        }
      );
      const contentType = response.headers["content-type"];
      if (contentType && contentType.includes("application/json")) {
        return JSON.parse(Buffer.from(response.data).toString("utf8"));
      }
      const zip = new AdmZip(Buffer.from(response.data));
      zip.extractAllTo(DATA_ROOT, true);
      const oldDirPath = path$1.join(DATA_ROOT, "profiles_data");
      if (fs$1.existsSync(oldDirPath) && oldDirPath !== PROFILES_DIR) {
        if (fs$1.existsSync(PROFILES_DIR)) {
          fs$1.rmSync(PROFILES_DIR, { recursive: true, force: true });
        }
        fs$1.renameSync(oldDirPath, PROFILES_DIR);
        console.log(
          "🚚 已自动将云端旧目录 profiles_data 更名为 profiles_records"
        );
      }
      const configPath = path$1.join(DATA_ROOT, "profiles_config.json");
      let profilesData = {};
      if (fs$1.existsSync(configPath)) {
        profilesData = JSON.parse(fs$1.readFileSync(configPath, "utf-8"));
        userData.profiles = profilesData;
        saveUserData();
        fs$1.unlinkSync(configPath);
      }
      return { status: "ok", data: profilesData };
    } catch (error) {
      console.error("云端恢复失败:", error);
      return { status: "error", msg: "下载失败: " + error.message };
    }
  });
  electron.ipcMain.handle("dialog:showMessage", async (event, options) => {
    const result = await electron.dialog.showMessageBox(
      electron.BrowserWindow.fromWebContents(event.sender),
      options
    );
    return result.response;
  });
  electron.ipcMain.handle("download-drama-template", async (event) => {
    try {
      const win = electron.BrowserWindow.fromWebContents(event.sender);
      const desktopPath = electron.app.getPath("desktop");
      const defaultPath = path$1.join(desktopPath, "全局剧单_标准模板.xlsx");
      const { canceled, filePath } = await electron.dialog.showSaveDialog(win, {
        title: "保存全局剧单模板",
        defaultPath,
        // 🌟 关键修改：默认位置设为桌面
        filters: [{ name: "Excel 表格", extensions: ["xlsx"] }]
      });
      if (canceled || !filePath) {
        return { success: false, msg: "取消下载" };
      }
      const headers = [
        "版权",
        "产品ID",
        "产品名称",
        "素材名称",
        "素材个数",
        "指定素材",
        "新建项目数",
        "新建广告数",
        "素材文件名称"
      ];
      const worksheet = xlsx.utils.aoa_to_sheet([headers]);
      worksheet["!cols"] = [
        { wch: 10 },
        // 版权
        { wch: 15 },
        // 产品ID
        { wch: 20 },
        // 产品名称
        { wch: 20 },
        // 素材名称
        { wch: 10 },
        // 素材个数
        { wch: 25 },
        // 指定素材
        { wch: 12 },
        // 新建项目数
        { wch: 12 },
        // 新建广告数
        { wch: 25 }
        // 素材文件名称
      ];
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");
      xlsx.writeFile(workbook, filePath);
      return { success: true, filePath };
    } catch (error) {
      console.error("❌ 生成模板失败:", error);
      return { success: false, msg: error.message };
    }
  });
  electron.ipcMain.on("open-storage-dir", () => {
    electron.shell.openPath(DATA_ROOT);
  });
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") electron.app.quit();
});
