<template>
  <div class="app-container">
    <nav>
      <div class="nav-header">
        <h2>漫剧神器 v{{ appVersion }}</h2>
      </div>
      <div
        :class="['nav-item', { active: currentTab === 'run' }]"
        @click="currentTab = 'run'"
      >
        <el-icon><VideoPlay /></el-icon> 运行任务
      </div>
      <div
        :class="['nav-item', { active: currentTab === 'config' }]"
        @click="currentTab = 'config'"
      >
        <el-icon><Setting /></el-icon> 方案配置
      </div>
      <div
        :class="['nav-item', { active: currentTab === 'settings' }]"
        @click="currentTab = 'settings'"
      >
        <el-icon><Tools /></el-icon> 系统设置
      </div>
    </nav>

    <main>
      <div class="tab-content">
        <RunTab
          v-if="currentTab === 'run'"
          :is-running="isRunning"
          :all-profiles="allProfiles"
          :logs="logs"
          :global-drama-list="settings.globalDramaList"
          @update-global-drama="
            (val) => {
              settings.globalDramaList = val;
              handleSaveGlobalSettings(settings);
            }
          "
          @run-task="handleRunTask"
          @clear-logs="logs = []"
        />

        <ConfigTab
          v-if="currentTab === 'config'"
          :all-profiles="allProfiles"
          :user-key="settings.userKey"
          @update-profiles="updateProfiles"
        />

        <SettingsTab
          v-if="currentTab === 'settings'"
          :settings="settings"
          @update:settings="(val) => (settings = val)"
          @save-settings="handleSaveGlobalSettings"
        />
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
import { VideoPlay, Setting, Tools, Loading } from "@element-plus/icons-vue"; // 🌟 新增引入 Loading 图标
import { ElMessage, ElMessageBox } from "element-plus";

// 引入子组件
import RunTab from "./components/RunTab.vue";
import ConfigTab from "./components/ConfigTab.vue";
import SettingsTab from "./components/SettingsTab.vue";

// --- 全局状态管理 ---
const currentTab = ref("run");
const logs = ref([]);
const allProfiles = ref({});
const settings = ref({
  userKey: "",
  workingAccount: "",
  workingPassword: "",
  pageNum: 20,
  projectNum: 1,
  adsNum: 1,
  isAccountFlat: false,
  dateRange: "",
});
const lastConfig = ref({});
const appVersion = ref("1.0.0"); // 默认值
// 增加 isRunning 状态
const isRunning = ref(false);

// --- 🌟 更新状态管理 ---
const isDownloading = ref(false); // 是否显示进度条遮罩
const downloadPercent = ref(0); // 下载进度百分比
const showUpdateLog = ref(false); // 控制更新公告弹窗显示
const isLoadingLog = ref(false); // 🌟 是否正在加载更新日志
const updateContent = ref([]); // 🌟 存放动态更新内容的数组

// --- 拖拽防御逻辑 ---
const preventDefaultDrop = (e) => {
  e.preventDefault();
};

/**
 * 🌟 获取动态更新日志
 */
const fetchUpdateLog = async (version) => {
  isLoadingLog.value = true;
  try {
    // 拉取服务器上的 changelog.json，带上时间戳防止浏览器缓存
    const res = await fetch(
      `http://129.204.86.63:3535/api/changelog.json?t=${Date.now()}`,
    );

    if (res.ok) {
      const allLogs = await res.json();

      // 根据当前版本号，去 JSON 里匹配对应的更新条目
      if (allLogs[version] && allLogs[version].length > 0) {
        updateContent.value = allLogs[version];
      } else {
        // 如果服务器上没写这个版本的日志，给个兜底文案
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
    // 网络错误时的兜底文案
    updateContent.value = [
      "✨ 优化了系统核心机制，执行效率大幅提升",
      "🛡️ 强化了 API 请求的安全防护策略",
    ];
  } finally {
    isLoadingLog.value = false;
  }
};

// --- 生命周期：初始化数据接收 ---
onMounted(() => {
  // 1. 监听主进程发来的初始化数据
  window.api.onInitSettings((data) => {
    console.log("📖 收到初始化数据:", data);

    if (data.profiles) allProfiles.value = data.profiles;
    if (data.lastConfig) lastConfig.value = data.lastConfig;

    settings.value = {
      userKey: data.KEY_CONFIG?.userKey || "",
      workingAccount: data.WORKING_CONFIG?.account || "",
      workingPassword: data.WORKING_CONFIG?.password || "",

      globalDramaList: data.FILES?.globalDramaList || "",
      accountMatchCount: data.SETTINGS?.ACCOUNT_MATCH_COUNT || 2,
      pageNum: data.FILES?.PAGE_NUM || 20,
      projectNum: data.FILES?.PROJECT_NUM ?? 1,
      adsNum: data.FILES?.ADS_NUM ?? 1,
      isAccountFlat: data.FILES?.isAccountFlat || false,
      dateRange: data.FILES?.dateRange || "",
    };
    if (data.appVersion) {
      appVersion.value = data.appVersion; // 自动更新 UI 上的版本号
    }

    // 🌟🌟🌟 核心：判断是否刚更新完软件 🌟🌟🌟
    if (data.isUpdated) {
      showUpdateLog.value = true; // 弹窗显示
      fetchUpdateLog(data.appVersion); // 触发网络请求拉取日志
    }
  });

  // 🌟 监听云端自动更新系统
  window.api.onUpdateMessage((data) => {
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
          // 用户同意后，开启全屏进度条锁定
          isDownloading.value = true;
          downloadPercent.value = 0;
          window.api.confirmDownload();
        })
        .catch(() => {});
    } else if (data.type === "downloading") {
      // 核心：更新实时下载进度
      downloadPercent.value = data.percent;
    } else if (data.type === "downloaded") {
      // 下载完成，解除进度条，弹出安装确认
      isDownloading.value = false;
      ElMessageBox.confirm(
        "新版本已准备就绪，点击“立即安装”将重启并完成升级。",
        "🎉 下载成功",
        {
          confirmButtonText: "立即安装",
          showCancelButton: false, // 强制更新建议不给取消
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
      // 如果需要，可以在这里提示“已经是最新版”
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

  // 2. 接收运行日志
  window.api.onLogUpdate((msg) => {
    logs.value.push(msg);
    if (logs.value.length > 500) {
      logs.value.shift();
    }
  });

  // 🌟 新增：监听任务运行状态
  window.api.onTaskStatusChange((status) => {
    console.log("主进程发来的状态变了！现在是：", status);
    // 加个强制弹窗看看有没有反应
    // ElMessage.info("状态切换为：" + status);
    isRunning.value = status;
  });

  // 3. 全局拖拽拦截
  document.addEventListener("dragover", preventDefaultDrop);
  document.addEventListener("drop", preventDefaultDrop);
});

onUnmounted(() => {
  document.removeEventListener("dragover", preventDefaultDrop);
  document.removeEventListener("drop", preventDefaultDrop);
});

/**
 * 🌟 核心方法 1：保存全局系统设置
 */
const handleSaveGlobalSettings = (data) => {
  settings.value = data;
  if (window.api && window.api.saveSettings) {
    window.api.saveSettings(JSON.parse(JSON.stringify(data)));
    ElMessage.success("系统设置已保存并同步至本地");
  }
};

/**
 * 🌟 核心方法 2：更新方案列表
 */
const updateProfiles = (newProfiles) => {
  allProfiles.value = newProfiles;
  window.api.updateProfiles(JSON.parse(JSON.stringify(newProfiles)));
};

/**
 * 🌟 核心方法 3：运行任务
 */
const handleRunTask = (runConfig) => {
  if (!settings.value.userKey) {
    ElMessage.warning("请先在 [系统设置] 填写并验证授权卡密");
    currentTab.value = "settings";
    return;
  }

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
  position: relative; /* 为遮罩层提供定位基准 */
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

/* 下载遮罩层样式 */
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

/* Loading 旋转动画 */
.is-loading {
  animation: rotating 2s linear infinite;
}
@keyframes rotating {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
