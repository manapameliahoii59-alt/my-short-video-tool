<template>
  <div class="app-container">
    <nav>
      <div class="nav-header">
        <h2>漫剧神器 v{{ appVersion }}</h2>
        <el-button
          type="primary"
          link
          size="small"
          style="margin-top: 8px; color: #a0cfff; font-size: 12px; width: 120px; justify-content: center;"
          :disabled="isCheckingUpdate"
          @click="manualCheckUpdate"
        >
          <el-icon v-if="isCheckingUpdate" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
          <span>{{ isCheckingUpdate ? '正在检测...' : '[手动检查新版本]' }}</span>
        </el-button>
      </div>
      
      <div
        :class="['nav-item', { active: currentTab === 'run', 'is-locked': isCruiseRunning && currentTab !== 'run' }]"
        @click="handleTabSwitch('run')"
      >
        <el-icon><VideoPlay /></el-icon> 运行任务
      </div>
      
      <div
        :class="['nav-item', { active: currentTab === 'dataFetch' }]"
        @click="handleTabSwitch('dataFetch')"
      >
        <el-icon><DataLine /></el-icon> 巡航任务
      </div>

      <div
        :class="['nav-item', { active: currentTab === 'config', 'is-locked': isCruiseRunning && currentTab !== 'config' }]"
        @click="handleTabSwitch('config')"
      >
        <el-icon><Setting /></el-icon> 方案配置
      </div>
      
      <div
        :class="['nav-item', { active: currentTab === 'settings', 'is-locked': isCruiseRunning && currentTab !== 'settings' }]"
        @click="handleTabSwitch('settings')"
      >
        <el-icon><Tools /></el-icon> 系统设置
      </div>
    </nav>

    <!-- <main>
      <div class="tab-content">
        <RunTab
          v-if="currentTab === 'run'"
          :is-running="isRunning"
          :all-profiles="allProfiles"
          :profile-order="profileOrder"
          :logs="logs"
          :global-drama-list="settings.globalDramaList"
          :profile-sets="settings.profileSets || []"
          :working-account="settings.workingAccount"
          @update-global-drama="
            (val) => {
              settings.globalDramaList = val;
              handleSaveGlobalSettings(settings);
            }
          "
          @update-profile-sets="handleSaveProfileSets"
          @run-task="handleRunTask"
          @clear-logs="logs = []"
        />

        <DataFetchTab
          v-if="currentTab === 'dataFetch'"
          :all-profiles="allProfiles"
          :profile-order="profileOrder"
          @cruise-status-change="(status) => isCruiseRunning = status"
        />

        <ConfigTab
          v-if="currentTab === 'config'"
          :all-profiles="allProfiles"
          :profile-order="profileOrder"
          :user-key="settings.userKey"
          @update-profiles="updateProfiles"
          @update-profile-sets="handleSaveProfileSets"
        />

        <SettingsTab
          v-if="currentTab === 'settings'"
          :settings="settings"
          @update:settings="applySettingsFromChild"
          @save-settings="handleSaveGlobalSettings"
        />
      </div>
    </main> -->


    <main>
  <div class="tab-content">
    <keep-alive :include="['RunTab', 'DataFetchTab', 'ConfigTab']">
      
      <RunTab
        v-if="currentTab === 'run'"
        :is-running="isRunning"
        :all-profiles="allProfiles"
        :profile-order="profileOrder"
        :logs="logs"
        :global-drama-list="settings.globalDramaList"
        :profile-sets="settings.profileSets || []"
        :working-account="settings.workingAccount"
        @update-global-drama="handleUpdateGlobalDrama"
        @update-profile-sets="handleSaveProfileSets"
        @run-task="handleRunTask"
        @clear-logs="logs = []"
      />

      <DataFetchTab
        v-else-if="currentTab === 'dataFetch'"
        :all-profiles="allProfiles"
        :profile-order="profileOrder"
        @cruise-status-change="(status) => isCruiseRunning = status"
      />

      <ConfigTab
        v-else-if="currentTab === 'config'"
        :all-profiles="allProfiles"
        :profile-order="profileOrder"
        :user-key="settings.userKey"
        :global-account-match-count="settings.accountMatchCount"
        @update-profiles="updateProfiles"
        @update-profile-sets="handleSaveProfileSets"
      />

      <SettingsTab
        v-else-if="currentTab === 'settings'"
        :settings="settings"
        @update:settings="(val) => (settings = val)"
        @save-settings="handleSaveGlobalSettings"
      />
      
    </keep-alive>
  </div>
</main>
    <div v-if="isDownloading" class="download-overlay">
      <div class="download-card">
        <h3>正在下载新版本...</h3>
        <el-progress
          :percentage="downloadPercent"
          :stroke-width="18"
          status="success"
          striped
          striped-flow
        />
        <p>下载过程中请勿关闭软件，完成后将自动提示安装</p>
      </div>
    </div>

    <el-dialog
      v-model="showUpdateLog"
      title="🎉 更新公告"
      width="550px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <div style="line-height: 1.8; font-size: 15px; padding: 0 10px">
        <h3 style="color: #409eff; margin-top: 0">版本 v{{ appVersion }}</h3>

        <div
          v-if="isLoadingLog"
          style="color: #999; text-align: center; padding: 30px 0"
        >
          <el-icon
            class="is-loading"
            style="font-size: 24px; vertical-align: middle; margin-right: 8px"
            ><Loading
          /></el-icon>
          <span style="vertical-align: middle">正在获取更新内容...</span>
        </div>

        <ul v-else style="padding-left: 20px; margin-bottom: 0">
          <li
            v-for="(item, index) in updateContent"
            :key="index"
            v-html="item"
          ></li>
        </ul>

        <p
          style="
            color: #888;
            margin-top: 25px;
            font-size: 13px;
            text-align: center;
          "
        >
          (此消息仅在更新后首次打开时提示)
        </p>
      </div>
      <template #footer>
        <span class="dialog-footer">
          <el-button
            type="primary"
            size="large"
            style="width: 100%"
            @click="showUpdateLog = false"
          >
            开启新体验
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { VideoPlay, Setting, Tools, Loading, DataLine } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";

// 引入子组件
import RunTab from "./components/RunTab.vue";
import ConfigTab from "./components/ConfigTab.vue";
import SettingsTab from "./components/SettingsTab.vue";
import DataFetchTab from "./components/DataFetchTab.vue"; 

// --- 全局状态管理 ---
const currentTab = ref("run");
const logs = ref([]);
const allProfiles = ref({});
const profileOrder = ref([]);
const settings = ref({
  userKey: "",
  workingAccount: "",
  workingPassword: "",
  pageNum: 20,
  projectNum: 1,
  adsNum: 1,
  isAccountFlat: false,
  dateRange: "",
  profileSets: [],
});
const lastConfig = ref({});
const appVersion = ref("1.0.0"); 
const isRunning = ref(false);

// 🌟 新增：记录巡航状态，用于锁定页面
const isCruiseRunning = ref(false); 

// --- 更新状态管理 ---
const isDownloading = ref(false); 
const downloadPercent = ref(0); 
const showUpdateLog = ref(false); 
const isLoadingLog = ref(false); 
const updateContent = ref([]); 
const isCheckingUpdate = ref(false); 
let updateTimeoutTimer = null;

// --- 拖拽防御逻辑 ---
const preventDefaultDrop = (e) => {
  e.preventDefault();
};

// 🌟 新增：统一处理 Tab 切换的拦截函数
const handleTabSwitch = (tabName) => {
  if (isCruiseRunning.value && tabName !== 'dataFetch') {
    ElMessage.warning("🛑 自动巡航及上剧引擎正在后台运行中，请先停止巡航后再切换页面！");
    return;
  }
  currentTab.value = tabName;
};

/**
 * 获取动态更新日志
 */
const fetchUpdateLog = async (version) => {
  isLoadingLog.value = true;
  try {
    const res = await fetch(
      `http://129.204.86.63:3535/api/changelog.json?t=${Date.now()}`,
    );


    if (res.ok) {
      const allLogs = await res.json();
      if (allLogs[version] && allLogs[version].length > 0) {
        updateContent.value = allLogs[version];
      } else {
        updateContent.value = [
          "✨ 优化了系统底层逻辑，提升了运行稳定性",
          "🛡️ 修复了部分影响体验的已知问题",
        ];
      }
    } else {
      throw new Error("网络请求状态异常");
    }
  } catch (error) {
    console.error("获取更新日志失败:", error);
    // updateContent.value = [
    //   "✨ 优化了系统核心机制，执行效率大幅提升",
    //   "🛡️ 强化了 API 请求的安全防护策略",
    // ];
  } finally {
    isLoadingLog.value = false;
  }
};

// 手动检查更新的方法
const manualCheckUpdate = () => {
  if (isCheckingUpdate.value) return; 
  
  isCheckingUpdate.value = true;
  
  // 开启 15 秒超时倒计时
  updateTimeoutTimer = setTimeout(() => {
    if (isCheckingUpdate.value) {
      isCheckingUpdate.value = false;
      ElMessage.warning("检测更新超时，请检查网络状态或稍后再试");
    }
  }, 15000);

  if (window.api && window.api.checkForUpdates) {
    window.api.checkForUpdates();
  } else {
    ElMessage.error("更新组件未初始化");
    isCheckingUpdate.value = false;
    clearTimeout(updateTimeoutTimer); 
  }
};

/** 从运行预设（profileSets）中剔除已不存在的方案名 */
function pruneProfileSetsAgainstProfiles(sets, existingKeySet) {
  const list = Array.isArray(sets) ? sets : [];
  let changed = false;
  const pruned = list.map((s) => {
    const arr = Array.isArray(s?.profiles) ? s.profiles : [];
    const next = arr.filter((name) => existingKeySet.has(name));
    if (next.length !== arr.length) changed = true;
    return { ...s, profiles: next };
  });
  return { pruned, changed };
}

// --- 生命周期：初始化数据接收 ---
onMounted(() => {
  // 1. 监听主进程发来的初始化数据
  window.api.onInitSettings((data) => {
    console.log("📖 收到初始化数据:", data);

    if (data.profiles) allProfiles.value = data.profiles;
    profileOrder.value = Array.isArray(data.profileOrder) ? data.profileOrder : Object.keys(data.profiles || {});
    if (data.lastConfig) lastConfig.value = data.lastConfig;

    const existingKeys = new Set(Object.keys(data.profiles || {}));
    let profileSets = Array.isArray(data.profileSets) ? data.profileSets : [];
    const profileSetsPrune = pruneProfileSetsAgainstProfiles(profileSets, existingKeys);
    if (profileSetsPrune.changed) profileSets = profileSetsPrune.pruned;

    settings.value = {
      userKey: data.KEY_CONFIG?.userKey || "",
      workingAccount:
        data.WORKING_CONFIG?.account || data.WORKING_CONFIG?.acount || "",
      workingPassword: data.WORKING_CONFIG?.password || "",

      globalDramaList: data.FILES?.globalDramaList || "",
      accountMatchCount: data.SETTINGS?.ACCOUNT_MATCH_COUNT || 2,
      pageNum: data.FILES?.PAGE_NUM || 20,
      projectNum: data.FILES?.PROJECT_NUM ?? 1,
      adsNum: data.FILES?.ADS_NUM ?? 1,
      isAccountFlat: data.FILES?.isAccountFlat || false,
      dateRange: data.FILES?.dateRange || "",
      profileSets,
    };
    if (profileSetsPrune.changed && window.api?.saveSettings) {
      window.api.saveSettings(JSON.parse(JSON.stringify(settings.value)));
    }
    if (data.appVersion) {
      appVersion.value = data.appVersion;
    }

    if (data.isUpdated) {
      showUpdateLog.value = true;
      fetchUpdateLog(data.appVersion);
    }
  });

  // 监听云端自动更新系统
  window.api.onUpdateMessage((data) => {
    // 只要有结果返回，就解除检查按钮的 loading 状态
    if (["available", "latest", "error"].includes(data.type)) {
      isCheckingUpdate.value = false;
      if (updateTimeoutTimer) {
        clearTimeout(updateTimeoutTimer);
        updateTimeoutTimer = null;
      }
    }

    if (data.type === "available") {
      ElMessageBox.confirm(
        `检测到新版本 v${data.version}，是否立即更新并重启软件？`,
        "🚀 发现新版本",
        {
          confirmButtonText: "开始更新",
          cancelButtonText: "以后再说",
          type: "info",
          closeOnClickModal: false,
        },
      )
        .then(() => {
          isDownloading.value = true;
          downloadPercent.value = 0;
          window.api.confirmDownload();
        })
        .catch(() => {});
    } else if (data.type === "downloading") {
      downloadPercent.value = data.percent;
    } else if (data.type === "downloaded") {
      isDownloading.value = false;
      ElMessageBox.confirm(
        "新版本已准备就绪，点击“立即安装”将重启并完成升级。",
        "🎉 下载成功",
        {
          confirmButtonText: "立即安装",
          showCancelButton: false,
          type: "success",
          closeOnClickModal: false,
          closeOnPressEscape: false,
        },
      )
        .then(() => {
          window.api.confirmInstall();
        })
        .catch(() => {});
    } else if (data.type === "latest") {
      ElMessage.success("恭喜，当前已经是最新版本！");
    } else if (data.type === "error") {
      isDownloading.value = false;
      ElMessage.error(`更新包下载失败: ${data.msg}`);
    }
  });

  // 软件启动时，延迟 3 秒悄悄检查一下更新
  setTimeout(() => {
    if (window.api.checkForUpdates) {
      window.api.checkForUpdates();
    }
  }, 3000);

  // 接收运行日志 (带节流缓冲机制)
  let logBuffer = [];
  let flushLogTimer = null;

  window.api.onLogUpdate((msg) => {
    logBuffer.push(msg);

    if (!flushLogTimer) {
      flushLogTimer = setTimeout(() => {
        const combinedLogs = [...logs.value, ...logBuffer];
        logs.value = combinedLogs.length > 500 ? combinedLogs.slice(-500) : combinedLogs;
        
        logBuffer = [];
        flushLogTimer = null;
      }, 100); 
    }
  });

  // 监听任务运行状态
  window.api.onTaskStatusChange((status) => {
    console.log("主进程发来的状态变了！现在是：", status);
    isRunning.value = status;
  });

  // 全局拖拽拦截
  document.addEventListener("dragover", preventDefaultDrop);
  document.addEventListener("drop", preventDefaultDrop);
});

onUnmounted(() => {
  document.removeEventListener("dragover", preventDefaultDrop);
  document.removeEventListener("drop", preventDefaultDrop);
});

/**
 * 同步运行页「运行预设」(profileSets) 到主进程本地配置
 */
const handleSaveProfileSets = (val) => {
  settings.value.profileSets = val;
  if (window.api && window.api.saveSettings) {
    window.api.saveSettings(JSON.parse(JSON.stringify(settings.value)));
  }
};

/** 运行页：全局剧单（清除 / 更换 / 拖拽导入）写回本地并同步主进程 */
const handleUpdateGlobalDrama = (val) => {
  settings.value.globalDramaList = val ?? "";
  if (window.api?.saveSettings) {
    window.api.saveSettings(JSON.parse(JSON.stringify(settings.value)));
  }
};

/** 系统设置子组件回写（显式写 ref，避免根级赋值在部分环境下未落到 settings.value） */
const applySettingsFromChild = (val) => {
  settings.value = val;
};

/**
 * 保存全局系统设置
 */
const handleSaveGlobalSettings = (data) => {
  settings.value = data;
  if (window.api && window.api.saveSettings) {
    window.api.saveSettings(JSON.parse(JSON.stringify(data)));
    ElMessage.success("系统设置已保存并同步至本地");
  }
};

/**
 * 更新方案列表
 */
const updateProfiles = (payload) => {
  const normalizedProfiles = payload?.profiles || payload || {};
  const normalizedOrder = Array.isArray(payload?.profileOrder)
    ? payload.profileOrder
    : Object.keys(normalizedProfiles);
  const existingKeys = new Set(Object.keys(normalizedProfiles));
  const { pruned, changed } = pruneProfileSetsAgainstProfiles(
    settings.value.profileSets,
    existingKeys,
  );
  if (changed) {
    settings.value.profileSets = pruned;
  }
  allProfiles.value = normalizedProfiles;
  profileOrder.value = normalizedOrder;
  window.api.updateProfiles(
    JSON.parse(
      JSON.stringify({
        profiles: normalizedProfiles,
        profileOrder: normalizedOrder,
      }),
    ),
  );
  if (changed && window.api?.saveSettings) {
    window.api.saveSettings(JSON.parse(JSON.stringify(settings.value)));
  }
};

/**
 * 运行任务
 */
const handleRunTask = (runConfig) => {
  if (!settings.value.userKey) {
    ElMessage.warning("请先在 [系统设置] 填写并验证授权卡密");
    currentTab.value = "settings";
    return;
  }

  logs.value = [];

  const finalConfig = {
    ...runConfig,
    userKey: settings.value.userKey,
    workingAccount: settings.value.workingAccount,
    workingPassword: settings.value.workingPassword,
    accountMatchCount: settings.value.accountMatchCount,
    pageNum: settings.value.pageNum,
    projectNum: settings.value.projectNum,
    adsNum: settings.value.adsNum,
    isAccountFlat: settings.value.isAccountFlat,
    dateRange: settings.value.dateRange,
  };

  window.api.runTask(JSON.parse(JSON.stringify(finalConfig)));
  ElMessage.success("自动化任务指令已发出，请观察日志");
};
</script>

<style>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  position: relative;
}

nav {
  width: 200px;
  background-color: #2c3e50;
  color: white;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.nav-header {
  padding: 20px;
  text-align: center;
  border-bottom: 1px solid #3e4e4e;
  margin-bottom: 10px;
}

.nav-header h2 {
  font-size: 16px;
  color: #ecf0f1;
  margin: 0;
}

.nav-item {
  padding: 15px 25px;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.nav-item:hover {
  background-color: #34495e;
}

.nav-item.active {
  background-color: #409eff;
  color: white;
}

/* 🌟 新增：锁定的菜单项样式 */
.nav-item.is-locked {
  opacity: 0.4;
  cursor: not-allowed;
  background-color: transparent !important;
}

main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  background-color: #f4f7f6;
}

.download-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.download-card {
  background: white;
  padding: 40px;
  border-radius: 16px;
  width: 450px;
  text-align: center;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.download-card h3 {
  margin: 0 0 20px 0;
  color: #333;
}

.download-card p {
  margin-top: 15px;
  color: #666;
  font-size: 13px;
}

.is-loading {
  animation: rotating 2s linear infinite;
}
@keyframes rotating {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>