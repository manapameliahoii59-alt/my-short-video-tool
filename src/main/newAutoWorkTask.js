/* eslint-disable */
import axios from "axios";
import xlsx from "xlsx";
import fs from "fs";
import path from "path";
import util from "util";
import crypto from "crypto";

const isPkg = typeof process.pkg !== "undefined";

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
  ensureAuth,
  pickAccountsForPublish,
  findMaterialFolderByName,
  validateAutomationWorkbookLayout,
  ensureDirectories,
} from "./utils";

let uiSender = null;
let CONFIG = null;
let uiSelectedExcelPath = null;
// 🌟 新增：中断开关
let isCancelled = false;

// 保留终端输出用的原始 console 方法（避免劫持主进程全局 console）
const c = console;
const logToTerminal = c.log.bind(c);
const errToTerminal = c.error.bind(c);
const warnToTerminal = c.warn.bind(c);

/** 仅本模块自动化任务：同步到 RunTab，不影响其他主进程代码的 console */
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
      `<span style="color:#e6a23c;">⚠️ ${util.format(...args)}</span>`,
    );
  }
}

/**
 * 1. 配置中心
 */

const CONFIGData = {
  BASE_URL: "https://api.iocpx.com",
  EMAIL: "",
  PASSWORD: "",
  SESSION_FILE: path.join(rootDir, "session.json"),
  BOOK_FILE: path.join(rootDir, "剧单.xlsx"),
  TEMPLATE_FILE: path.join(rootDir, "模板_付费.xlsx"),
};
let globalSession = { token: "", time: 0 };
const client = axios.create({
  baseURL: CONFIGData.BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Origin: "https://console.iocpx.com",
    Referer: "https://console.iocpx.com/",
  },
});

// 👇 🌟 新增：注入拦截器！这能保证哪怕代码写出花来，请求头也绝对带上 Token
client.interceptors.request.use((config) => {
  if (globalSession && globalSession.token) {
    // 强制转换为小写，兼容巨量后端的 Header 校验
    config.headers["authorization"] = globalSession.token;
    config.headers["cookie"] = `ocpx_session_id=${globalSession.token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

function getAvailableAccounts(
  targetConfig,
  x = CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT,
) {
  const rows = getCachedAccounts(CONFIG.FILES.ACCOUNTS);
  return pickAccountsForPublish(
    rows,
    targetConfig,
    CONFIG.FILES.BUSINESS_TYPE,
    x,
  );
}



const writeApiLog = (step, params, response) => {
  return;
};


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
    queryPolicy: "ft",
  });
  materialFileNameList = materialFileNameRaw?.data?.data?.list;
}

function getTargetMaterialFileId(fileName) {
  return findMaterialFolderByName(materialFileNameList, fileName);
}

/**
 * 全局缓存容器
 */
const GLOBAL_CACHE = {
  dramaInfo: {},
  linkTemplate: {},
  strategy: {},
  titlePackage: {},
  accountsList: null,
  materials: {}, // 🌟 新增：素材专属缓存池
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

/**
 * 3. 数据组装函数
 */
async function generatePublishPayload(dramaInfo, proConfigData) {
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
    // --- 1. 获取剧集信息 ---
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
        return productData;
      },
    );

    if (isCancelled) return null; // 🌟 拦截点
    if (!productDataList || productDataList.length === 0) {
      throw new Error(`未找到剧集信息或版权不匹配: ${productName}`);
    }

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

    // --- 2. 获取链接模板、标题包、策略包 ---
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

    // --- 3. 获取账户信息 ---
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
    if (!Array.isArray(accountData) || accountData.length === 0) {
      throw new Error(
        `账号库匹配到的账号无效或已失效，请检查账号文件中的「账号」列是否为可用 advertiserId。匹配结果: ${accountIds.join(",")}`,
      );
    }
    let accountList = accountData
      .map((item) => String(item?.advertiserName || "").trim())
      .filter(Boolean);
    let idsList = accountData
      .map((item) => item?.advertiserId)
      .filter((id) => id !== undefined && id !== null && String(id).trim() !== "")
      .map((id) => String(id).trim());
    if (idsList.length === 0) {
      throw new Error(
        `未获取到有效账户ID，请检查账号文件中的「账号」列数据。匹配结果: ${accountIds.join(",")}`,
      );
    }

    // 🌟 深度拦截睡眠：支持秒取消
    await randomSleep(minTime, maxTime, () => isCancelled);
    if (isCancelled) return null;

    // --- 4. 🌟 核心优化：获取素材并加入缓存池 ---
    let tarMaterItem;
    if (materialFileNameData) {
      tarMaterItem = getTargetMaterialFileId(materialFileNameData);
    }

    let rankingListOrLibrarySign = "";
    let isSpecify = Array.isArray(specifyMaterialsArr) && specifyMaterialsArr.length > 0;
    let rangeDataObj = getDateRangeByType(materialDateRangeData);

    // 拼装精准的素材缓存 Key
    const specifyKeyStr = isSpecify ? specifyMaterialsArr.join('-') : 'none';
    const folderIdStr = tarMaterItem?.id || 'nofolder';
    const materialCacheKey = `mat_${searchProductName}_${rangeDataObj.startDay}_${rangeDataObj.endDay}_${specifyKeyStr}_${folderIdStr}_${copyrightData}`;
    
    taskUiLog(`   🔍 准备获取素材 (Key: ${searchProductName})...`);
    // 使用 getDataWithCache 包裹整个搜索逻辑
    let materials = await getDataWithCache(
      "materials",
      materialCacheKey,
      async () => {
        let fetchMaterials = [];
        let resAsset;
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
            pageSize: 20,
          };
          if (tarMaterItem?.id) _materialPar.folderId = tarMaterItem?.id;

          resAsset = await client.post("/adv-asset-inside/search", _materialPar);
          const rawMaterials = resAsset.data?.data?.materials || [];
          fetchMaterials = rawMaterials.filter((item) => item.url && item.coverUrl);

        } else if (!testDramaName) {
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
          // 1. 基础过滤：必须有视频和封面
          fetchMaterials = rawList.filter((item) => item.videoUrl && item.poster);

          // 2. 精确过滤素材名称前缀
          fetchMaterials = fetchMaterials.filter((materItem) => {
            const materialName = materItem.adPlatformMaterialName || "";
            
            // 仅考虑 -、—、_ 三种分隔符
            const parts = materialName.split(/[-—_]/);
            const namePrefix = parts[0].trim();
            
            // 确保 productName 也去掉了首尾空格，防止因录入问题导致的匹配失败
            const targetName = productName.trim();

            // 只有当前缀完全等于目标剧名时才保留
            return namePrefix === targetName;
          });

          if (fetchMaterials.length > 0) {
            let materialscheckArr = fetchMaterials.map((item) => item.materialId);
            let checkRes = await client.post("/adv-asset-inside/material/findId", {
              oceanengineMaterialIds: materialscheckArr,
            });
            let mappingTable = checkRes.data?.data || {};
            fetchMaterials = fetchMaterials.map((ele) => ({
              ...ele,
              mappingId: mappingTable[ele.materialId] || null,
            }));
          }
        } else {
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
          fetchMaterials = rawMaterials.filter((item) => item.url && item.coverUrl);
        }

        return fetchMaterials; // 将查到的结果返回给缓存系统
      }
    );
    if (isCancelled) return null; // 🌟 获取素材回来后再次检查拦截

    // 恢复打印状态标识
    if (isSpecify || testDramaName) {
      rankingListOrLibrarySign = "素材库";
    } else {
      rankingListOrLibrarySign = "素材榜单";
    }

    if (!materials || materials.length === 0)
      throw new Error(`素材查询结果为空`);

    taskUiLog(
      `   🎬 素材获取成功: ${materials.length} 条 (${rankingListOrLibrarySign})`,
    );

    // --- 5. 数据组装 ---
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
    taskUiError(`❌ [${productName}] 数据组装失败: ${err.message}`);
    recordTaskStatus(dramaInfo, proConfigData, "ERROR", err.message);
    return null;
  }
}

/**
 * 4. 批量提交任务
 */
async function submitBatchTasks(taskList) {
  if (!taskList || taskList.length === 0) return;

  const isPublish = CONFIG.SETTINGS.ACTION === "publish";

  taskUiLog(
    `\n🚀 [${isPublish ? "正式发布" : "测试模式"}] 开始处理 ${taskList.length} 个任务...`,
  );

  try {
    const payload1List = taskList.map((t) => t.payload1);
    taskUiLog(`⏳ 正在请求创建模板 (insert)...`);

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
    taskUiLog(`✅ 模板创建成功，获取到 ${resultList.length} 个 ID`);

    const payload2List = [];
    const successTasks = [];

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
          thumbUrl: templateData.thumbUrl,
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
      taskUiWarn("⚠️ 本批次无有效模板，跳过后续步骤");
      return;
    }

    taskUiLog(`⏳ 模板已就绪，正在缓冲等待，准备最终提交...`);
    // await randomSleep(minTime, maxTime);
    await randomSleep(1000, 2000);

    taskUiLog(
      "\n-------------------------------------------------------------",
    );
    taskUiLog(`📋 准备提交的数据 (${payload2List.length} 条):`);
    payload2List.forEach((p, idx) => {
      taskUiLog(
        `   ${idx + 1}. 模板ID: ${p.publishTemplateId} | 剧名: ${p.bookName} | 策略: ${p.promotionStrategyName}`,
      );
    });
    taskUiLog(
      "-------------------------------------------------------------\n",
    );

    if (!isPublish) {
      taskUiLog("🛑 [测试阻断] 已暂停最终提交 (publishInstance/batchInsert)");
      taskUiLog("✅ 测试流程结束，数据已生成，未消耗真实配额。\n");
      return;
    }

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
      taskUiLog(`✨ [批量执行] ${payload2List.length} 个任务全部提交成功！`);
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
      taskUiError(`❌ [批量执行] Instance 提交失败: ${errorMsg}`);
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
    taskUiError(`❌ [测试阶段] 发生异常: ${err.message}`);
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
  const filePath = uiSelectedExcelPath || CONFIG.FILES.DRAMA_LIST;
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

function checkEnvironment() {
  taskUiLog("🔍 正在进行环境与文件结构前置检测...");

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

  ensureDirectories([
    path.dirname(logPath),
    path.join(process.cwd(), "browser"),
  ]);

  const { ok, errors } = validateAutomationWorkbookLayout(requiredStructures);
  if (!ok) {
    taskUiError("\n\x1b[31m!!! 检测到环境配置错误 !!!\x1b[0m");
    errors.forEach((err) => taskUiError(err));
    taskUiError("\x1b[31m请修正以上错误后再启动程序。\x1b[0m\n");
    return false;
  }
  taskUiLog("✅ 环境检测通过，所有必要文件及表头校验正常。\n");
  return true;
}



async function runAutoTask(sender, uiConfig) {
  uiSender = sender;
  try {
  CONFIG = uiConfig;
  uiSelectedExcelPath = CONFIG.FILES.DRAMA_LIST;
  clearAccountsCache();
  // 重置缓存
  GLOBAL_CACHE.dramaInfo = {};
  GLOBAL_CACHE.linkTemplate = {};
  GLOBAL_CACHE.strategy = {};
  GLOBAL_CACHE.titlePackage = {};
  GLOBAL_CACHE.materials = {}; // 🌟 新增：每次启动清空素材缓存
  if (CONFIG.SETTINGS && CONFIG.SETTINGS.BASE_URL) {
    client.defaults.baseURL = CONFIG.SETTINGS.BASE_URL;
  }

  // 1. 鉴权
  const authResult = await checkAuth(
    CONFIG.KEY_CONFIG.userKey,
    CONFIG.WORKING_CONFIG.account,
    CONFIG.WORKING_CONFIG.password,
  );
  if (authResult.status !== 1) throw new Error(authResult.msg);

  minTime = Number(authResult.minTime);
  maxTime = Number(authResult.maxTime);

// 🌟 核心修复 1：继承主进程的 Session (如果有的话)，避免重复登录被踢下线
  globalSession = CONFIG.session || { token: "", time: 0 };

  // 🌟 核心修复 2：调用公共鉴权服务
  const authRes = await ensureAuth(
    CONFIG.WORKING_CONFIG.account,
    CONFIG.WORKING_CONFIG.password,
    globalSession,
  );
  
  if (!authRes.success) {
    throw new Error(authRes.msg);
  }

  // 🌟 核心修复 3：更新全局 session。此后拦截器会自动读取它发请求，绝不会再出现没带 Token 的情况！
  globalSession = authRes.session;

  try {
    const dramaCount = await getDramaCount();
    taskUiLog(
      `\n===========================================================`,
    );
    taskUiLog(
      `🚀 任务启动：共选中 ${CONFIG.SELECTED_PROFILES.length} 个方案，总剧集 ${dramaCount} 部`,
    );
    taskUiLog(`===========================================================`);

    await getMaterialFileName();

    isCancelled = false; // 每次启动任务前，重置开关
    let globalTaskPool = []; // 🌟 核心：蓄水池
    const BATCH_THRESHOLD = 50; // 🌟 30条阈值
    const defaultAccountMatchCount =
      parseInt(CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT, 10) || 2;

    // --- 方案循环 ---
    // for (const profile of CONFIG.SELECTED_PROFILES) {
      for (let pIndex = 0; pIndex < CONFIG.SELECTED_PROFILES.length; pIndex++) {
        if (isCancelled) return; // 🛑 拦截点 1
        const profile = CONFIG.SELECTED_PROFILES[pIndex];
      taskUiLog(`\n\n🔶 [方案切换] 开始方案: 【${profile.name}】`);

      CONFIG.FILES.TEMPLATE = profile.TEMPLATE;
      CONFIG.FILES.ACCOUNTS = profile.ACCOUNTS;
      CONFIG.FILES.BUSINESS_TYPE = profile.businessType;
      const profileMatchCount = parseInt(profile.accountMatchCount, 10);
      const shouldUseProfileCount =
        profile.enableCustomAccountMatchCount === true &&
        Number.isFinite(profileMatchCount) &&
        profileMatchCount > 0;
      CONFIG.SETTINGS.ACCOUNT_MATCH_COUNT =
        shouldUseProfileCount
          ? profileMatchCount
          : defaultAccountMatchCount;
      clearAccountsCache();

      if (
        !fs.existsSync(CONFIG.FILES.TEMPLATE) ||
        !fs.existsSync(CONFIG.FILES.ACCOUNTS)
      ) {
        taskUiError(`❌ [方案跳过] 【${profile.name}】文件不完整`);
        continue;
      }

      const workbookTemplate = xlsx.readFile(CONFIG.FILES.TEMPLATE);
      const allTemplates = xlsx.utils.sheet_to_json(
        workbookTemplate.Sheets[workbookTemplate.SheetNames[0]],
      );
      const templateRowCount = allTemplates.length;

      // --- 剧集循环 ---
      for (let j = 0; j < dramaCount; j++) {
        if (isCancelled) return; // 🛑 拦截点 2
        const dramaInfo = await loadDramaData(j);
        if (!dramaInfo) continue;

        taskUiLog(
          `\n🎬 [${profile.name}] 处理剧集 ${j + 1}/${dramaCount}: ${dramaInfo.targetDramaName}`,
        );

        // --- 模板循环 ---
        for (let i = 0; i < templateRowCount; i++) {
          if (isCancelled) return; // 🛑 拦截点 3
          const row = allTemplates[i];
          const templateCopyright = String(row["版权"] || "").trim();

          if (templateCopyright !== dramaInfo.copyright) continue;

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

          const taskData = await generatePublishPayload(
            dramaInfo,
            proConfigData,
          );
          if (isCancelled) return; // 🌟 生成 Payload 后检查
          if (taskData) {
            globalTaskPool.push(taskData);

            // 🌟 核心：达到30条触发一次大提交
            if (globalTaskPool.length >= BATCH_THRESHOLD) {
              taskUiLog(
                `\n📦 [蓄水池满] 已积攒 ${BATCH_THRESHOLD} 条，发起批量提交...`,
              );
              await submitBatchTasks(globalTaskPool);
              globalTaskPool = [];

              // const coolDown = 2000 + Math.random() * 3000;
              const coolDown = 5000 + Math.random() * 3000;
              taskUiLog(
                `❄️ [频率保护] 提交完毕，进入 ${Math.round(coolDown / 1000)} 秒深度冷却...`,
              );
              await new Promise((res) => setTimeout(res, coolDown));
              if (isCancelled) return; // 🌟 睡醒后立刻检查，如果是取消状态则直接退出函数
            }
          }
        }

        // 🌟 剧集间隙：虽然现在是蓄水池模式，但每处理完一部剧的逻辑计算，
        // 我们依然可以稍微停顿一下，防止本地读取压力过大。
        await new Promise((res) => setTimeout(res, 500));
        if (isCancelled) return;
        // 🌟 每部剧跑完校验一次授权，防止跑到一半卡密过期或点数不足
        const authDataResult = await checkAuth(
          CONFIG.KEY_CONFIG.userKey,
          CONFIG.WORKING_CONFIG.account,
          CONFIG.WORKING_CONFIG.password,
        );
        if (authDataResult.status !== 1) throw new Error(authDataResult.msg);
      }
      taskUiLog(`✅ 方案【${profile.name}】预处理完毕！`);
      if (pIndex < CONFIG.SELECTED_PROFILES.length - 1) {

        const profileCoolDown = 1500 + Math.random() * 3000; 
        taskUiLog(`\n⏸️ [方案切换缓冲] 休息 ${Math.round(profileCoolDown / 1000)} 秒，准备载入下一个方案...`);
        await new Promise((res) => setTimeout(res, profileCoolDown));
        if (isCancelled) return; // 🌟 方案切换睡眠后拦截
      }
    }

    if (isCancelled) {
      taskUiLog("\n🚫 任务已被手动取消！"); // 👈 修改文案
      return; // 直接退出，不再执行最后的收尾提交
    }
    // --- 🏁 收尾：处理蓄水池里剩下的（不满50条的） ---
    if (globalTaskPool.length > 0) {
      taskUiLog(
        `\n📦 [收尾提交] 处理最后剩余的 ${globalTaskPool.length} 条任务...`,
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
  }
}



// 🌟 新增：暴露给主进程的停止函数
function stopAutoTask() {
  isCancelled = true;
  if (uiSender) {
    uiSender.send("log-update", "⚠️ 正在取消任务，请稍候...");
  }
}

// 🟢 改为 ES Module 导出
export { runAutoTask, stopAutoTask };
