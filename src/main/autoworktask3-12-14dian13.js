/* eslint-disable */
import axios from "axios";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import util from "util";
import crypto from "crypto";

const isPkg = typeof process.pkg !== "undefined";

// let minTime = 200;
// let maxTime = 2000;

let minTime = null;
let maxTime = null;

// 🟢 改为 import 引入 utils
import {
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
} from "./utils";

// 👇 新增：用来存储发送日志到网页的通道
let uiSender = null;
// 👇 【新增这一行】
let CONFIG = null;
// 👇 【新增这一行】
let uiSelectedExcelPath = null;

// 👇 新增：重写 console.log，让它既在后台打印，又发送到前台网页
const originalLog = console.log;
console.log = function (...args) {
  originalLog.apply(console, args); // 保持后台有输出
  if (uiSender) {
    // 将多个参数格式化成字符串发给界面
    const msg = util.format(...args);
    uiSender.send("log-update", msg);
  }
};

const originalError = console.error;
console.error = function (...args) {
  originalError.apply(console, args);
  if (uiSender) {
    const msg = util.format(...args);
    uiSender.send("log-update", `<span style="color:red;">❌ ${msg}</span>`);
  }
};

/**
 * 1. 配置中心
 */

const CONFIGData = {
  BASE_URL: "https://api.iocpx.com",
  EMAIL: "",
  PASSWORD: "",
  // ✅ 修正：不要用 __dirname，用 rootDir 以便在 EXE 同级目录生成文件
  SESSION_FILE: path.join(rootDir, "session.json"),
  // ✅ 修正：显式拼接绝对路径，防止双击运行时找不到文件
  BOOK_FILE: path.join(rootDir, "剧单.xlsx"),
  TEMPLATE_FILE: path.join(rootDir, "模板_付费.xlsx"),
  // ADVERTISER_ID: "1849397141562504",
};

const client = axios.create({
  baseURL: CONFIGData.BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Origin: "https://console.iocpx.com",
    Referer: "https://console.iocpx.com/",
  },
});

function getAvailableAccounts(
  targetConfig,
  x = CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT,
) {
  // 🌟 核心优化：直接调用 utils 的缓存读取函数，获取全量账号数据（瞬间完成）
  const rows = getCachedAccounts(CONFIG.FILES.ACCOUNTS);

  const availableRows = rows.filter((row) => {
    // 🌟 修复 1：首先确保该行真的有“账号”数据，如果是空值则直接淘汰
    const accountStr = String(row["账号"] || "").trim();
    if (!accountStr || accountStr === "undefined") {
      return false;
    }

    // 🌟 修复 2（防御性编程）：防止 targetConfig 传入空值导致匹配到空白行
    if (!targetConfig.email || !targetConfig.copyright) {
      return false;
    }

    // 基础匹配：邮箱和版权必须完全一致
    const basicMatch =
      String(row["邮箱"]).trim() === String(targetConfig.email).trim() &&
      String(row["版权"]).trim() === String(targetConfig.copyright).trim();

    if (!basicMatch) return false;

    let subjectMatch = false;
    const rowSubject = String(row["主体"]).trim();
    const targetSubject = String(targetConfig.subject).trim();

    // 逻辑：端原生-付费短剧，进行取整匹配 (例如 2.1 匹配 2.9)
    if (CONFIG.FILES.BUSINESS_TYPE === "端原生-付费短剧") {
      const rowVal = Math.floor(parseFloat(rowSubject));
      const targetVal = Math.floor(parseFloat(targetSubject));

      if (!isNaN(rowVal) && !isNaN(targetVal)) {
        subjectMatch = rowVal === targetVal;
      } else {
        subjectMatch = rowSubject === targetSubject;
      }
    } else {
      // 其他业务类型：完全匹配
      subjectMatch = rowSubject === targetSubject;
    }

    return subjectMatch;
  });

  // --- 核心修改：不再强制要求满足 x 个，有多少要多少 ---
  // 1. 随机打乱搜索到的所有可用行
  const shuffled = availableRows.sort(() => 0.5 - Math.random());

  // 2. 取 “实际可用数” 和 “需求数 x” 之间的最小值
  const countToTake = Math.min(shuffled.length, x);

  // 3. 返回最终选中的账号数组
  return shuffled
    .slice(0, countToTake)
    .map((row) => String(row["账号"]).trim());
}

function filterInvalidMaterials(data) {
  // 确保传入的是数组，防止报错
  if (!Array.isArray(data)) return [];

  return data.filter((item) => {
    // 只有当 poster 和 videoUrl 都有值（非空字符串、非 null、非 undefined）时才保留
    return item.poster && item.videoUrl;
  });
}

/**
 * 接口日志记录器
 * @param {string} step 步骤名称
 * @param {object} params 请求参数
 * @param {object} response 返回数据
 */
const writeApiLog = (step, params, response) => {
  return;
  const logFile = path.join(rootDir, "api_debug.log");
  const timestamp = new Date().toLocaleString();

  // 提取响应中的核心数据，避免日志文件过大
  const cleanResponse = response?.data ? response.data : response;

  const logContent = `
[${timestamp}] >>> 步骤: ${step}
【请求参数】: 
${JSON.stringify(params, null, 2)}
【返回内容】: 
${JSON.stringify(cleanResponse, null, 2)}
--------------------------------------------------------------------------------
`;
  // 使用同步追加写入，确保顺序且简单
  fs.appendFileSync(logFile, logContent, "utf-8");
};

// 🌟 1. 在函数外部定义独立的 session 缓存，防止被 CONFIG 覆盖
let globalSession = { token: "", time: 0 };

/**
 * 2. 身份认证 (独立内存管理防冲突版)
 */
async function ensureAuth() {
  let sessionId = "";

  // 1. 尝试从独立的全局变量中提取
  if (
    globalSession.token &&
    Date.now() - globalSession.time < 6 * 24 * 60 * 60 * 1000
  ) {
    sessionId = globalSession.token;
  }

  // 2. 验证 Token 有效性
  if (sessionId) {
    try {
      const testHeaders = {
        authorization: sessionId,
        cookie: `ocpx_session_id=${sessionId}`,
      };
      let testAuthRes = await client.get("/merchant/auth/info", {
        headers: testHeaders,
      });

      if (testAuthRes.data?.code == 1001000001) {
        console.log("🔄 登录已过期, 准备重新登陆...");
        sessionId = "";
        globalSession = { token: "", time: 0 }; // 清理内存
      } else {
        console.log("✅ 登录状态有效 (内存复用)");

        // 🌟 防御性修复：即使 Session 有效，也强行重申一次模块身份
        // 防止服务器在多次请求后悄悄把我们的模块状态丢掉
        await client.post(
          "/merchant/auth/login2",
          { moduleId: 3 },
          { headers: testHeaders },
        );

        client.defaults.headers.common["authorization"] = sessionId;
        client.defaults.headers.common["cookie"] =
          `ocpx_session_id=${sessionId}`;
        return true;
      }
    } catch (err) {
      sessionId = "";
      globalSession = { token: "", time: 0 };
    }
  }

  // 3. 执行自动登录
  if (!sessionId) {
    console.log("🔐 正在执行自动登录...");

    // 🌟 核心修复：清空底层的旧 Headers 缓存！
    // 防止带着旧 Cookie 去重新登录，导致服务端串线并丢失 moduleId
    delete client.defaults.headers.common["authorization"];
    delete client.defaults.headers.common["cookie"];

    const { account, password } = CONFIG.WORKING_CONFIG;

    if (!account || !password) {
      console.error("❌ 无法登录：未获取到主账号或密码");
      return false;
    }

    try {
      const r1 = await client.post("/merchant/auth/login1", {
        email: account,
        password: password,
        rememberMe: true,
      });

      const setCookie = r1.headers["set-cookie"];
      sessionId = setCookie
        .find((s) => s.startsWith("ocpx_session_id="))
        .split(";")[0]
        .split("=")[1];

      // 激活指定模块
      await client.post(
        "/merchant/auth/login2",
        { moduleId: 3 },
        { headers: { cookie: `ocpx_session_id=${sessionId}` } },
      );

      // 🌟 保存到专属的全局独立变量中
      globalSession = {
        token: sessionId,
        time: Date.now(),
      };

      // 依然可以通知界面持久化，以防彻底重启软件
      if (uiSender) {
        uiSender.send("save-session-persistent", globalSession);
      }

      console.log("✅ 登录成功");
    } catch (err) {
      console.error("❌ 登录失败:", err.message);
      return false;
    }
  }

  // 4. 重新挂载全局请求头
  client.defaults.headers.common["authorization"] = sessionId;
  client.defaults.headers.common["cookie"] = `ocpx_session_id=${sessionId}`;
  return true;
}

let materialFileNameList = null;

async function getMaterialFileName() {
  //如果有素材文件名称，那么就调用素材文件相关接口查询。
  //素材文件夹名称只跟素材库走，不跟素材榜单走
  let materialFileNameRaw = null;
  // let materialFileNameList = null;
  materialFileNameRaw = await client.post("adv-asset-inside/folder/search", {
    pageNo: 1,
    pageSize: 150,
    query: null,
    projectId: null,
    libraryType: "public",
    showPrivateOnly: false,
    queryPolicy: "ft",
  });
  materialFileNameList = materialFileNameRaw?.data?.data?.list;
}

function getTargetMaterialFileId(fileName) {
  if (
    materialFileNameList &&
    Array.isArray(materialFileNameList) &&
    materialFileNameList.length > 0 &&
    fileName
  ) {
    return materialFileNameList.find((item) => {
      return item.name === clearSpaces(fileName);
    });
  }
}

/**
 * 全局缓存容器 (只缓存静态配置，不缓存账号和素材)
 */
const GLOBAL_CACHE = {
  dramaInfo: {}, // 剧集搜索结果 (静态)
  linkTemplate: {}, // 链接模板详情 (静态)
  strategy: {}, // 策略包详情 (静态)
  titlePackage: {}, // 标题包详情 (静态)
  accountsList: null, // 🌟 新增：用于缓存账号 Excel 表的数据
};

/**
 * 通用缓存读取器 (带详细日志)
 */
async function getDataWithCache(type, key, fetchFn) {
  // 简化的 Key 显示，避免日志太长
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

/**
 * 3. [日志优化版] 数据组装函数
 */
async function generatePublishPayload(dramaInfo, proConfigData) {
  // --- 基础参数提取 ---
  const productName = clearSpaces(dramaInfo.targetDramaName);
  const proConfig_strategyId = proConfigData.proConfig_strategyId;
  const proConfig_titlePackageId = proConfigData.proConfig_titlePackageId;
  const proConfig_subjectId = proConfigData.proConfig_subject;
  const testDramaName = clearSpaces(dramaInfo.testDramaTitle);
  const copyrightData = clearSpaces(dramaInfo.copyright);
  const materialFileNameData = dramaInfo.materialFileName;
  const pageSize =
    parseInt(dramaInfo.dramaCount) || parseInt(CONFIG.FILES.PAGE_NUM) || 20;
  const specifyMaterialsArr = smartSplit(dramaInfo.specifyMaterials);
  const materialDateRangeData =
    dramaInfo.materialDateRange || CONFIG.FILES.dateRange;
  let searchProductName = testDramaName ? testDramaName : productName;

  try {
    // console.log(`   🛠️  正在组装数据...`); // 这一行可以注释掉，主循环已有提示
    // =================================================================
    // 步骤 1: 获取产品信息列表 (✅ 缓存完整的数组，而不是单个结果)
    // =================================================================
    // 💡 建议在缓存 Key 里加上版权，防止不同版权的同名剧串车
    const dramaCacheKey = `${productName}_${CONFIG.FILES.BUSINESS_TYPE}_${copyrightData}`;

    const productDataList = await getDataWithCache(
      "dramaInfo",
      dramaCacheKey,
      async () => {
        let resbookParmas = {
          key: productName,
          pageNo: 1,
          linkType:
            CONFIG.FILES.BUSINESS_TYPE === "端原生-付费短剧" ? "IAP" : "IAA",
          pageSize: CONFIG.FILES.BUSINESS_TYPE === "端原生-付费短剧" ? 50 : 20,
        };
        const resBook = await client.post(
          "/adv-bookstore/bsShortDramaAlbumLinkFanqie/page",
          resbookParmas,
        );
        let productData = resBook.data?.data?.list;

        // 版权过滤
        if (copyrightData == "ZZ番茄" && Array.isArray(productData)) {
          productData = productData.filter(
            (item) =>
              productName == clearSpaces(item.bookName) &&
              item.source == "ZZFQ",
          );
        }
        if (copyrightData == "ZZ点众" && Array.isArray(productData)) {
          productData = productData.filter(
            (item) =>
              productName == clearSpaces(item.bookName) && item.source == "DZ",
          );
        }
        if (
          copyrightData != "ZZ番茄" &&
          copyrightData != "ZZ点众" &&
          Array.isArray(productData)
        ) {
          productData = productData.filter(
            (item) =>
              productName == clearSpaces(item.bookName) &&
              item.source != "DZ" &&
              item.source != "ZZFQ",
          );
        }

        // 返回完整的数组，交给外部去匹配
        return productData;
      },
    );

    if (!productDataList || productDataList.length === 0) {
      throw new Error(`未找到剧集信息或版权不匹配: ${productName}`);
    }

    // =================================================================
    // 步骤 1.5: 根据当前模板的主体，从列表中动态提取单条数据 (❌ 实时匹配，不进缓存)
    // =================================================================
    let productInfo;
    if (CONFIG.FILES.BUSINESS_TYPE === "端原生-付费短剧") {
      productInfo = matchByInput(productDataList, proConfig_subjectId);
    } else {
      productInfo = productDataList?.[0];
    }

    if (!productInfo)
      throw new Error(
        `未在列表中找到匹配主体(${proConfig_subjectId})的剧集: ${productName}`,
      );

    // =================================================================
    // 步骤 1.5: 基础配置获取 (✅ 缓存)
    // =================================================================

    // 1. 链接模板
    const linkTemplate = await getDataWithCache(
      "linkTemplate",
      proConfigData.proConfig_promotionLinkTemplateId,
      async () => {
        const res = await client.get(
          `/adv-release-toutiao/configPromotionLinkTemplate/page?key=${proConfigData.proConfig_promotionLinkTemplateId}&pageNo=1&pageSize=1`,
        );
        return res.data?.data?.list?.[0];
      },
    );
    if (!linkTemplate) throw new Error(`未获取到推广链接模板`);

    // 2. 标题组
    const titlePackage = await getDataWithCache(
      "titlePackage",
      proConfig_titlePackageId,
      async () => {
        const res = await client.get(
          `/adv-release-toutiao/configTitlePackage/page?key=${proConfig_titlePackageId}&pageNo=1&pageSize=20`,
        );
        return res.data?.data?.list?.[0];
      },
    );
    if (!titlePackage) throw new Error(`未获取标题包`);

    // 3. 策略包
    const strategy = await getDataWithCache(
      "strategy",
      proConfig_strategyId,
      async () => {
        const res = await client.get(
          `/adv-release-toutiao/configPromotionStrategy/page?key=${proConfig_strategyId}&pageNo=1&pageSize=1`,
        );
        return res.data?.data?.list?.[0];
      },
    );
    if (!strategy) throw new Error(`未找到匹配的策略包`);

    // =================================================================
    // 步骤 2: 账号匹配 (❌ 实时)
    // =================================================================
    const accountIds = getAvailableAccounts({
      email: proConfigData.proConfig_email,
      copyright: proConfigData.proConfig_copyright,
      subject: proConfigData.proConfig_subject,
    });
    if (Array.isArray(accountIds) && accountIds.length == 0)
      throw new Error(`未获取到可用账号`);

    const getAccount = await client.post(
      "/adv-vlsc-toutiao/account/queryByAdvertiserIds",
      accountIds,
    );
    const accountData = getAccount.data?.data;
    if (!accountData) throw new Error(`未获取账户信息,${accountIds}`);
    let accountList = accountData.map((item) => item.advertiserName);
    let idsList = accountData.map((item) => item.advertiserId);

    // =================================================================
    // 步骤 3: 获取素材数据 (❌ 实时)
    // =================================================================
    await randomSleep(minTime, maxTime); // 这里的等待会有日志

    let tarMaterItem;
    if (materialFileNameData) {
      tarMaterItem = getTargetMaterialFileId(materialFileNameData);
    }

    let resAsset;
    let materials = [];
    let rankingListOrLibrarySign = "";
    let isSpecify =
      Array.isArray(specifyMaterialsArr) && specifyMaterialsArr.length > 0;

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
        pageSize: 20,
      };
      if (tarMaterItem?.id) _materialPar.folderId = tarMaterItem?.id;

      resAsset = await client.post("/adv-asset-inside/search", _materialPar);
      const rawMaterials = resAsset.data?.data?.materials || [];
      materials = rawMaterials.filter((item) => item.url && item.coverUrl);
    } else if (!testDramaName) {
      rankingListOrLibrarySign = "素材榜单";
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      resAsset = await client.post(
        "/adv-report-query/materialDay/getLatestCostByDayRangeV2",
        {
          materialInfo: searchProductName,
          startDay: rangeDataObj.startDay,
          endDay: rangeDataObj.endDay,
          sortingFields: [{ field: "statCost", order: "desc" }],
          pageNo: 1,
          pageSize: pageSize,
        },
      );

      let rawList = resAsset.data?.data?.list || [];
      materials = rawList.filter((item) => item.videoUrl && item.poster);

      if (copyrightData == "ZZ番茄" && materials.length > 0) {
        materials = materials.filter(
          (materItem) => clearSpaces(materItem.bookName) == productName,
        );
      }

      // Mapping ID
      if (materials.length > 0) {
        let materialscheckArr = materials.map((item) => item.materialId);
        let checkRes = await client.post("/adv-asset-inside/material/findId", {
          oceanengineMaterialIds: materialscheckArr,
        });
        let mappingTable = checkRes.data?.data || {};
        materials = materials.map((ele) => ({
          ...ele,
          mappingId: mappingTable[ele.materialId] || null,
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
        pageSize: pageSize,
        sortingFields: [{ field: "updateTime", order: "desc" }],
      };
      if (tarMaterItem?.id) _Materialpar2.folderId = tarMaterItem?.id;

      resAsset = await client.post("/adv-asset-inside/search", _Materialpar2);
      const rawMaterials = resAsset.data?.data?.materials || [];
      materials = rawMaterials.filter((item) => item.url && item.coverUrl);
    }

    if (!materials || materials.length === 0)
      throw new Error(`素材查询结果为空`);

    // 打印素材结果
    console.log(
      `   🎬 素材获取成功: ${materials.length} 条 (${rankingListOrLibrarySign})`,
    );

    // =================================================================
    // 步骤 4: 数据构建
    // =================================================================
    const ydData =
      ("0" + (new Date().getMonth() + 1)).slice(-2) +
      ("0" + new Date().getDate()).slice(-2);
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
          materialMigrateId: item.mappingId,
        })),
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
          size: item.size,
        })),
      );
    }

    let pro_num = Math.max(
      1,
      parseInt(dramaInfo.proNumNew || CONFIG.FILES.PROJECT_NUM) || 1,
    );
    let ads_num = Math.max(
      1,
      parseInt(dramaInfo.adsNumNew || CONFIG.FILES.ADS_NUM) || 1,
    );
    let materialsSize = Math.min(materials.length, 30);

    const payload1 = {
      type: 0,
      bookName: productInfo.bookName,
      bookId: productInfo.bookId,
      source: productInfo.source,
      playletSeriesUrl: productInfo.link,
      appType: productInfo.appType,
      promotionLinkTemplateId: linkTemplate.id,
      promotionLinkTemplateName: linkTemplate.name,
      industry: linkTemplate.industry,
      platform: linkTemplate.platform,
      promotionStrategyId: strategy.id,
      promotionStrategyName: strategy.name,
      bidType: strategy.bidType,
      landingType: strategy.landingType,
      strategyType: 1, //1是随机分配、2是账户内平铺。如果选了2，那么projectNum和advertNum都是0的
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
      publishName: finalPublishName,
    };

    if (CONFIG.FILES.isAccountFlat) {
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
        proConfigData,
      },
    };
  } catch (err) {
    console.error(`❌ [${productName}] 数据组装失败: ${err.message}`);
    recordTaskStatus(dramaInfo, proConfigData, "ERROR", err.message);
    return null;
  }
}

/**
 * 4. [测试版] 批量提交任务 (只创建模板，不执行最终发布)
 */
async function submitBatchTasks(taskList) {
  if (!taskList || taskList.length === 0) return;

  // 🌟 关键：在这里定义 isPublish，直接读取全局配置
  const isPublish = CONFIG.SETTINGS.ACTION === "publish";

  // 根据模式打印不同的日志头部
  console.log(
    `\n🚀 [${isPublish ? "正式发布" : "测试模式"}] 开始处理 ${taskList.length} 个任务...`,
  );

  try {
    // =================================================================
    // 步骤 1: 真正执行模板插入 (这一步需要执行，否则拿不到ID)
    // =================================================================
    const payload1List = taskList.map((t) => t.payload1);
    console.log(`⏳ 正在请求创建模板 (insert)...`);

    const resInsert = await client.post(
      "/adv-release-toutiao/publishTemplate/insert",
      payload1List,
    );
    writeApiLog(
      "/adv-release-toutiao/publishTemplate/insert",
      payload1List,
      resInsert,
    );

    const resultList = resInsert.data?.data;
    if (!resultList || !Array.isArray(resultList)) {
      throw new Error(
        `批量创建模板失败: ${resInsert.data?.msg || "返回数据为空"}`,
      );
    }
    console.log(`✅ 模板创建成功，获取到 ${resultList.length} 个 ID`);
    //   saveData('付费-素材榜单-指针番茄.json',payload1List);
    // =================================================================
    // 步骤 2: 组装 Instance 数据 (准备最终发布的数据)
    // =================================================================
    const payload2List = [];
    const successTasks = [];

    // for (let i = 0; i < 1; i++) {
    for (let i = 0; i < resultList.length; i++) {
      const templateData = resultList[i];
      const originalTask = taskList[i];

      if (templateData && templateData.id) {
        payload2List.push({
          ownerDate: new Date().toISOString().split("T")[0],
          publishTemplateId: templateData.id,
          publishTemplateName: originalTask.meta.finalPublishName,
          promotionStrategyName: templateData.promotionStrategyName,
          promotionStrategyId: templateData.promotionStrategyId,
          bookId: templateData.bookId,
          bookName: templateData.bookName,
          thumbUrl: null,
          type: 1,
          status: 0,
        });
        successTasks.push({
          task: originalTask,
          templateId: templateData.id,
        });
      }
    }

    if (payload2List.length === 0) {
      console.warn("⚠️ 本批次无有效模板，跳过后续步骤");
      return;
    }

    console.log(
      "\n-------------------------------------------------------------",
    );
    console.log(`📋 准备提交的数据 (${payload2List.length} 条):`);
    payload2List.forEach((p, idx) => {
      console.log(
        `   ${idx + 1}. 模板ID: ${p.publishTemplateId} | 剧名: ${p.bookName} | 策略: ${p.promotionStrategyName}`,
      );
    });
    console.log(
      "-------------------------------------------------------------\n",
    );

    if (!isPublish) {
      // 🛑 [测试模式] 阻断点
      console.log("🛑 [测试阻断] 已暂停最终提交 (publishInstance/batchInsert)");
      console.log("✅ 测试流程结束，数据已生成，未消耗真实配额。\n");
      return;
    }

    // =================================================================
    // 下面是原有的正式发布代码 (已被上面的 return 拦截)
    // =================================================================

    const resInstance = await client.post(
      "/adv-release-toutiao/publishInstance/batchInsert",
      payload2List,
    );
    writeApiLog(
      "/adv-release-toutiao/publishInstance/batchInsert",
      payload2List,
      resInstance,
    );

    if (resInstance.data.code === 0) {
      console.log(`✨ [批量执行] ${payload2List.length} 个任务全部提交成功！`);
      for (const successItem of successTasks) {
        const { task, templateId } = successItem;
        recordTaskStatus(
          task.meta.dramaInfo,
          task.meta.proConfigData,
          "SUCCESS",
          `发布模板ID: ${templateId}`,
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
          `批量提交失败: ${errorMsg}`,
        );
      });
    }
  } catch (err) {
    console.error(`❌ [测试阶段] 发生异常: ${err.message}`);
    // 即使是测试，如果报错了最好也记录一下
    taskList.forEach((t) => {
      recordTaskStatus(
        t.meta.dramaInfo,
        t.meta.proConfigData,
        "ERROR",
        `测试异常: ${err.message}`,
      );
    });
  }
}
async function getDramaCount() {
  const workbook = xlsx.readFile(CONFIG.FILES.DRAMA_LIST);
  return xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]])
    .length;
}

async function loadDramaData(index) {
  // 👇 修改：如果界面传了路径就用界面的，没传就用默认配置的
  const filePath = uiSelectedExcelPath || CONFIG.FILES.DRAMA_LIST;
  //   const workbook = xlsx.readFile(CONFIG.FILES.DRAMA_LIST);
  const workbook = xlsx.readFile(filePath);
  const data = xlsx.utils.sheet_to_json(
    workbook.Sheets[workbook.SheetNames[0]],
  );
  if (!data[index]) return null;
  const row = data[index];
  let DRAMA_FIELD_NAMES = CONFIG.DRAMA_FIELD_NAMES;
  let acMaterialFieldName =
    DRAMA_FIELD_NAMES.materialFileName || "素材文件名称";
  return {
    targetDramaName: String(
      row[DRAMA_FIELD_NAMES.targetDramaName] || "",
    ).trim(),
    copyright: String(row[DRAMA_FIELD_NAMES.copyright] || "").trim(),
    testDramaTitle: String(row[DRAMA_FIELD_NAMES.testDramaTitle] || "").trim(),
    dramaCount: String(row[DRAMA_FIELD_NAMES.dramaCount] || "").trim(),
    specifyMaterials: String(
      row[DRAMA_FIELD_NAMES.specifyMaterials] || "",
    ).trim(),
    proNumNew: parseInt(row[DRAMA_FIELD_NAMES.proNumNew]),
    adsNumNew: parseInt(row[DRAMA_FIELD_NAMES.adsNumNew]),
    materialFileName: String(row[acMaterialFieldName]).trim(),
    materialDateRange: (row[DRAMA_FIELD_NAMES.materialDateRange] || "")
      .toString()
      .trim(),
  };
}

/**
 * 前置环境与文件结构检测
 */
function checkEnvironment() {
  console.log("🔍 正在进行环境与文件结构前置检测...");

  // ✅ 核心修复：防止 CONFIG.STATE 为 undefined 导致报错
  // 如果 CONFIG.STATE.LOG 存在则使用它，否则使用默认的 "execution.log"
  const logPath =
    CONFIG.STATE && CONFIG.STATE.LOG
      ? CONFIG.STATE.LOG
      : path.join(rootDir, "execution.log");

  const requiredStructures = [
    {
      name: "剧集列表 (DRAMA_LIST)",
      path: CONFIG.FILES.DRAMA_LIST,
      headers: ["产品名称", "版权"],
    },
    {
      name: "基建模板 (TEMPLATE)",
      path: CONFIG.FILES.TEMPLATE,
      headers: [
        "邮箱",
        "推广链接模板ID",
        "版权",
        "策略包ID",
        "标题组ID",
        "主体",
      ],
    },
    {
      name: "账号库 (ACCOUNTS)",
      path: CONFIG.FILES.ACCOUNTS,
      headers: ["账号", "邮箱", "版权", "主体"],
    },
  ];
  const errors = [];
  for (const file of requiredStructures) {
    if (!fs.existsSync(file.path)) {
      errors.push(`❌ 文件丢失: ${file.name} (路径: ${file.path})`);
      continue;
    }
    try {
      const workbook = xlsx.readFile(file.path);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      const actualHeaders = jsonData[0] || [];
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

  // ✅ 修复：使用上面定义好的安全 logPath
  const dirs = [path.dirname(logPath), path.join(process.cwd(), "browser")];

  dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (e) {}
    }
  });
  if (errors.length > 0) {
    console.error("\n\x1b[31m!!! 检测到环境配置错误 !!!\x1b[0m");
    errors.forEach((err) => console.error(err));
    console.error("\x1b[31m请修正以上错误后再启动程序。\x1b[0m\n");
    return false;
  }
  console.log("✅ 环境检测通过，所有必要文件及表头校验正常。\n");
  return true;
}

/**
 * 4. 主程序入口 (多方案队列 + 全局剧单优化版)
 */
let frequencyNum = 0;

async function runAutoTask(sender, uiConfig) {
  uiSender = sender;
  // 将前端传来的配置赋给全局 CONFIG
  CONFIG = uiConfig;
  // 🌟 统一使用主进程拼接好的全局剧单绝对路径
  uiSelectedExcelPath = CONFIG.FILES.DRAMA_LIST;

  // 初始化清空静态缓存，确保每次启动读到最新数据
  clearAccountsCache();
  GLOBAL_CACHE.dramaInfo = {};
  GLOBAL_CACHE.linkTemplate = {};
  GLOBAL_CACHE.strategy = {};
  GLOBAL_CACHE.titlePackage = {};

  // 更新 axios 配置 (可选)
  if (CONFIG.SETTINGS && CONFIG.SETTINGS.BASE_URL) {
    client.defaults.baseURL = CONFIG.SETTINGS.BASE_URL;
  }

  // 1. 鉴权与登录 (整个多方案队列共用一次验证和 Session，提升效率)
  const authResult = await checkAuth(
    CONFIG.KEY_CONFIG.userKey,
    CONFIG.WORKING_CONFIG.account,
    CONFIG.WORKING_CONFIG.password,
  );
  if (authResult.status !== 1) {
    console.error("Validation Failed: 授权失败");
    return;
  }
  minTime = Number(authResult.minTime);
  maxTime = Number(authResult.maxTime);
  if (isNaN(minTime) || isNaN(maxTime)) {
    console.error("Validation Failed: 时间格式错误");
    return;
  }
  if (!(await ensureAuth())) return;

  try {
    const dramaCount = await getDramaCount();
    console.log(
      `\n===========================================================`,
    );
    console.log(
      `🚀 开始批量任务队列！共选中 ${CONFIG.SELECTED_PROFILES.length} 个方案，全局剧单共需处理 ${dramaCount} 部剧集`,
    );
    console.log(`===========================================================`);

    await getMaterialFileName();

    // 🌟🌟🌟 最外层循环：遍历用户选中的多个方案 (Profiles)
    for (const profile of CONFIG.SELECTED_PROFILES) {
      console.log(`\n\n🔶 [方案切换] 开始执行方案: 【${profile.name}】`);

      // 核心：为当前循环临时覆盖 CONFIG 的专属文件路径和业务类型
      CONFIG.FILES.TEMPLATE = profile.TEMPLATE;
      CONFIG.FILES.ACCOUNTS = profile.ACCOUNTS;
      CONFIG.FILES.BUSINESS_TYPE = profile.businessType;

      // 🚨 方案切换了，账号表也变了，必须清空上一轮的账号内存缓存！
      clearAccountsCache();

      // 检测当前方案的环境（只检测 Template 和 Accounts，剧单是全局的）
      if (
        !fs.existsSync(CONFIG.FILES.TEMPLATE) ||
        !fs.existsSync(CONFIG.FILES.ACCOUNTS)
      ) {
        console.error(
          `❌ [方案跳过] 【${profile.name}】的文件不完整 (缺失模板或账号表)，已跳过`,
        );
        continue;
      }

      // 读取当前方案的模板数据
      const workbookTemplate = xlsx.readFile(CONFIG.FILES.TEMPLATE);
      const allTemplates = xlsx.utils.sheet_to_json(
        workbookTemplate.Sheets[workbookTemplate.SheetNames[0]],
      );
      const templateRowCount = allTemplates.length;

      // 🌟🌟 中层循环：遍历剧集
      for (let j = 0; j < dramaCount; j++) {
        const dramaInfo = await loadDramaData(j);
        if (!dramaInfo) continue;

        const { targetDramaName, copyright: dramaCopyright } = dramaInfo;
        console.log(
          `\n🎬 [${profile.name}] 正在处理剧集 ${j + 1}/${dramaCount}: ${targetDramaName}`,
        );

        let currentDramaBatch = [];

        // 🌟 内层循环：遍历当前方案的模板
        for (let i = 0; i < templateRowCount; i++) {
          frequencyNum++;
          // 定期检查授权状态，防止跑长线任务时被服务端踢下线
          if (frequencyNum % 20 === 0) {
            const authDataResult = await checkAuth(
              CONFIG.KEY_CONFIG.userKey,
              CONFIG.WORKING_CONFIG.account,
              CONFIG.WORKING_CONFIG.password,
            );
            if (authDataResult.status !== 1) return;
          }

          const row = allTemplates[i];
          const templateCopyright = String(row["版权"] || "").trim();

          // 版权不匹配，直接跳过
          if (templateCopyright !== dramaCopyright) continue;

          const proConfigData = {
            proConfig_email: String(row["邮箱"]).trim(),
            proConfig_promotionLinkTemplateId: String(
              row["推广链接模板ID"],
            ).trim(),
            proConfig_copyright: templateCopyright,
            proConfig_strategyId: String(row["策略包ID"]).trim(),
            proConfig_titlePackageId: String(row["标题组ID"]).trim(),
            proConfig_subject: String(row["主体"]).trim(),
          };

          console.log(
            ` 🔹 [模板 ${i + 1}/${templateRowCount}] 正在匹配: 主体[${proConfigData.proConfig_subject}]`,
          );

          // 组装最终提交的数据体
          const taskData = await generatePublishPayload(
            dramaInfo,
            proConfigData,
          );

          if (taskData) {
            currentDramaBatch.push(taskData);
          }
        }

        // === 剧集在当前方案下的模板匹配完毕，执行批量提交 ===
        console.log(
          `\n-----------------------------------------------------------`,
        );
        if (currentDramaBatch.length > 0) {
          console.log(
            `📦 [剧集完成] ${targetDramaName} 共准备提交 ${currentDramaBatch.length} 个任务`,
          );
          await submitBatchTasks(currentDramaBatch);

          console.log("⏳ 剧集间歇息...");
          await randomSleep(minTime, maxTime);
        } else {
          console.log(`⚠️ [剧集跳过] ${targetDramaName} 未生成任何有效任务`);
        }
      }
      console.log(`✅ 方案【${profile.name}】全部剧集执行完毕！`);
    }

    console.log("\n🎉 所有选中的方案队列已全部执行结束");
  } catch (e) {
    console.error("❌ 程序核心逻辑运行异常:", e.message);
  }
}

// 🟢 改为 ES Module 导出
export { runAutoTask };
/**
 * 4. 主程序入口 (多方案队列 + 全局剧单优化版)
 */
// async function runAutoTask(sender, uiConfig) {
//   uiSender = sender;
//   CONFIG = uiConfig;
//   uiSelectedExcelPath = CONFIG.FILES.DRAMA_LIST;
//   clearAccountsCache();
//   GLOBAL_CACHE.dramaInfo = {};
//   GLOBAL_CACHE.linkTemplate = {};
//   GLOBAL_CACHE.strategy = {};
//   GLOBAL_CACHE.titlePackage = {};

//   if (CONFIG.SETTINGS && CONFIG.SETTINGS.BASE_URL) {
//     client.defaults.baseURL = CONFIG.SETTINGS.BASE_URL;
//   }

//   // 1. 首次鉴权与登录
//   const authResult = await checkAuth(
//     CONFIG.KEY_CONFIG.userKey,
//     CONFIG.WORKING_CONFIG.account,
//     CONFIG.WORKING_CONFIG.password,
//   );
//   if (authResult.status !== 1) {
//     // console.error("Validation Failed: 授权失败");
//     throw new Error(authResult.msg);
//   }
//   minTime = Number(authResult.minTime);
//   maxTime = Number(authResult.maxTime);
//   if (isNaN(minTime) || isNaN(maxTime)) {
//     console.error("Validation Failed: 时间格式错误");
//     return;
//   }
//   if (!(await ensureAuth())) return;

//   try {
//     const dramaCount = await getDramaCount();
//     console.log(
//       `\n===========================================================`,
//     );
//     console.log(
//       `🚀 开始批量任务队列！共选中 ${CONFIG.SELECTED_PROFILES.length} 个方案，全局剧单共需处理 ${dramaCount} 部剧集`,
//     );
//     console.log(`===========================================================`);

//     await getMaterialFileName();

//     // 🌟🌟🌟 最外层循环：遍历用户选中的多个方案
//     for (const profile of CONFIG.SELECTED_PROFILES) {
//       console.log(`\n\n🔶 [方案切换] 开始执行方案: 【${profile.name}】`);

//       CONFIG.FILES.TEMPLATE = profile.TEMPLATE;
//       CONFIG.FILES.ACCOUNTS = profile.ACCOUNTS;
//       CONFIG.FILES.BUSINESS_TYPE = profile.businessType;

//       clearAccountsCache();

//       if (
//         !fs.existsSync(CONFIG.FILES.TEMPLATE) ||
//         !fs.existsSync(CONFIG.FILES.ACCOUNTS)
//       ) {
//         console.error(
//           `❌ [方案跳过] 【${profile.name}】的文件不完整 (缺失模板或账号表)，已跳过`,
//         );
//         continue;
//       }

//       const workbookTemplate = xlsx.readFile(CONFIG.FILES.TEMPLATE);
//       const allTemplates = xlsx.utils.sheet_to_json(
//         workbookTemplate.Sheets[workbookTemplate.SheetNames[0]],
//       );
//       const templateRowCount = allTemplates.length;

//       // 🌟🌟 中层循环：遍历剧集
//       for (let j = 0; j < dramaCount; j++) {
//         const dramaInfo = await loadDramaData(j);
//         if (!dramaInfo) continue;

//         const { targetDramaName, copyright: dramaCopyright } = dramaInfo;
//         console.log(
//           `\n🎬 [${profile.name}] 正在处理剧集 ${j + 1}/${dramaCount}: ${targetDramaName}`,
//         );

//         let currentDramaBatch = [];

//         // 🌟 内层循环：遍历当前方案的模板
//         for (let i = 0; i < templateRowCount; i++) {
//           const row = allTemplates[i];
//           const templateCopyright = String(row["版权"] || "").trim();

//           // 版权不匹配，直接跳过
//           if (templateCopyright !== dramaCopyright) continue;

//           const proConfigData = {
//             proConfig_email: String(row["邮箱"]).trim(),
//             proConfig_promotionLinkTemplateId: String(
//               row["推广链接模板ID"],
//             ).trim(),
//             proConfig_copyright: templateCopyright,
//             proConfig_strategyId: String(row["策略包ID"]).trim(),
//             proConfig_titlePackageId: String(row["标题组ID"]).trim(),
//             proConfig_subject: String(row["主体"]).trim(),
//           };

//           console.log(
//             ` 🔹 [模板 ${i + 1}/${templateRowCount}] 正在匹配: 主体[${proConfigData.proConfig_subject}]`,
//           );

//           // 组装最终提交的数据体
//           const taskData = await generatePublishPayload(
//             dramaInfo,
//             proConfigData,
//           );

//           if (taskData) {
//             currentDramaBatch.push(taskData);
//           }
//         }

//         // === 剧集在当前方案下的模板匹配完毕，执行批量提交 ===
//         console.log(
//           `\n-----------------------------------------------------------`,
//         );
//         if (currentDramaBatch.length > 0) {
//           console.log(
//             `📦 [剧集完成] ${targetDramaName} 共准备提交 ${currentDramaBatch.length} 个任务`,
//           );
//           await submitBatchTasks(currentDramaBatch);

//           console.log("⏳ 剧集间歇息...");
//           await randomSleep(minTime, maxTime);
//         } else {
//           console.log(`⚠️ [剧集跳过] ${targetDramaName} 未生成任何有效任务`);
//         }

//         // 🌟🌟🌟 新增：每跑完一部剧，执行一次鉴权扣除与检测
//         console.log(`\n🔐 [安全校验] 正在校验授权状态与剩余额度...`);
//         const authDataResult = await checkAuth(
//           CONFIG.KEY_CONFIG.userKey,
//           CONFIG.WORKING_CONFIG.account,
//           CONFIG.WORKING_CONFIG.password,
//         );
//         if (authDataResult.status !== 1) {
//           throw new Error(authResult.msg);
//         }
//       }
//       console.log(`✅ 方案【${profile.name}】全部剧集执行完毕！`);
//     }

//     console.log("\n🎉 所有选中的方案队列已全部执行结束");
//   } catch (e) {
//     console.error("❌ 程序核心逻辑运行异常:", e.message);
//   }
// }