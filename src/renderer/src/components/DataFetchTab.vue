<template>
  <div 
    class="fetch-container" 
    v-loading="isFetching" 
    :element-loading-text="loadingText"
  >
      <el-card shadow="never" class="data-card" style="height: 300px;display: flex; flex-direction: column;">
      <div class="group-desc" style="margin-bottom: 12px; font-size: 14px;">
        🤖 自动化上剧目标方案 <span class="desc-light">(勾选后，后台巡航抓取到漫剧时，将自动为您分发到以下选中方案)</span>
      </div>
      
      <div class="profile-select-section">
        <div class="row-flex">
          <span style="width: 90px; color: #606266; font-size: 14px; font-weight: bold; flex-shrink: 0">
            运行方案：
          </span>
          <el-select
            v-model="selectedProfiles"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            clearable
            placeholder="搜索或在分组中选择 (支持多选)"
            style="flex: 1"
          >
            <el-option-group
              v-for="group in groupedProfilesForSelect"
              :key="group.label"
              :label="group.label"
            >
              <el-option
                v-for="name in group.options"
                :key="name"
                :label="name"
                :value="name"
              >
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <span>{{ name }}</span>
                  <span style="color: #909399; font-size: 12px;">{{ allProfiles[name]?.businessType }}</span>
                </div>
              </el-option>
            </el-option-group>
          </el-select>

          <el-button type="primary" link @click="selectAllProfiles" style="margin-left: 10px;">
            [全选]
          </el-button>
          <el-button type="danger" link @click="selectedProfiles = []">
            [清空]
          </el-button>
        </div>

        <div v-if="selectedProfiles.length > 0" class="selected-tags-box">
          <el-tag
            v-for="name in selectedProfiles"
            :key="name"
            closable
            type="primary"
            effect="light"
            disable-transitions
            style="cursor: pointer"
            title="点击打开该方案的本地文件夹"
            @click="openProfileFolder(name)"
            @close="removeSelectedProfile(name)"
          >
            {{ name }}
          </el-tag>
        </div>
      </div>
    </el-card>
    <el-card shadow="never" class="control-card">
      <div class="settings-wrapper">
        <div class="setting-group">
          <div class="group-desc" style="display: flex; justify-content: space-between; align-items: center;">
            <span>⚙️ 抓取与生成参数 <span class="desc-light">(应用于检索过滤与自动上剧预设)--(默认条件-端原生-IAP-分销-最大转化)--(修改后请点击保存，以免丢失)</span></span>
            <el-button type="primary" text bg size="small" @click="handleSaveSettings" :disabled="isAutoRunning">
              💾 保存当前配置
            </el-button>
          </div>
          
<div class="settings-wrapper">
        <div class="setting-group">
          
          <div class="filter-container">
            <div class="setting-row">
              <span class="row-label">🔍 抓取过滤：</span>
              
              <el-date-picker
                v-model="fetchDateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="开始日期"
                end-placeholder="结束日期"
                value-format="YYYY-MM-DD"
                :disabled="isAutoRunning"
                :clearable="false"
              />

              <el-select 
                v-model="fetchParams.source" 
                placeholder="平台 (默认全选)" 
                class="filter-item-small" 
                filterable 
                clearable 
                :disabled="isAutoRunning"
              >
                <el-option label="指针番茄" value="ZZFQ" />
                <el-option label="点众(端)" value="DZ" />
                <el-option label="番茄(端)" value="FQ" />
              </el-select>

              <div class="custom-input-box">
                <span class="custom-label">ROI ></span>
                <el-input 
                  v-model="fetchParams.roiThreshold" 
                  placeholder="0.7"
                  class="custom-input" 
                  :disabled="isAutoRunning" 
                  @input="fetchParams.roiThreshold = fetchParams.roiThreshold.replace(/[^0-9.]/g, '')"
                  @blur="validateRoi"
                />
              </div>
            </div>

            <div class="setting-row" style="margin-top: 10px;">
              <span class="row-label">📝 生成剧单预设：</span>
              <el-input v-model="exportConfig.copyright" placeholder="如: ZZ番茄" class="filter-item-middle" :disabled="isAutoRunning">
                <template #prepend>默认版权</template>
              </el-input>
              
              <div class="custom-input-box">
                <span class="custom-label">素材数</span>
                <el-input 
                  v-model="exportConfig.materialCount" 
                  placeholder="30"
                  class="custom-input" 
                  :disabled="isAutoRunning" 
                  @input="exportConfig.materialCount = exportConfig.materialCount.replace(/[^0-9]/g, '')"
                  @blur="validateNumber('materialCount', 30)"
                />
                <span class="custom-suffix">个</span>
              </div>
            </div>
          </div>
        </div>
      </div>
        </div>
      </div>

      <el-divider style="margin: 12px 0;" />

      <div class="controls-container">
        <div class="manual-controls" :class="{ 'elevate-controls': isFetching }">
          <el-button 
            :type="isFetching ? 'danger' : 'primary'" 
            @click="isFetching ? cancelFetch() : handleManualFetch()"
          >
            {{ isFetching ? '⏹ 中止抓取' : '获取起量剧单' }}
          </el-button>

          <el-button 
            type="info" 
            plain 
            :disabled="goodDramas.length === 0" 
            @click="showTableDialog = true"
          >
            👀 查看结果 ({{ goodDramas.length }})
          </el-button>

          <el-button 
            type="warning" 
            plain 
            :disabled="goodDramas.length === 0" 
            @click="handleExportExcel"
          >
            导出剧单
          </el-button>

          <el-button 
            type="success" 
            plain 
            :disabled="goodDramas.length === 0" 
            @click="handleCopyText"
          >
          复制文本
          </el-button>
        </div>

        <div class="auto-controls">
          <div class="auto-box">
            <span style="margin-right: 8px; font-size: 13px; font-weight: bold;">自动巡航：</span>
            <el-select v-model="intervalMin" style="width: 150px; margin-right: 8px;">
              <el-option label="每 20 分钟" :value="20" />
              <el-option label="每 30 分钟" :value="30" />
              <el-option label="每 1 小时" :value="60" />
              <el-option label="每 2 小时" :value="120" />
            </el-select>
            <el-button type="success" @click="toggleAutoRun">
              🚀 开启自动巡航 + 自动上剧
            </el-button>
          </div>
        </div>
      </div>
    </el-card>



    <el-dialog v-model="showTableDialog" width="75%" top="8vh" destroy-on-close :show-close="false">
      <template #header="{ close }">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 16px; font-weight: bold;">👀 漫剧剧单抓取结果</span>
          <div>
            <el-button type="danger" size="small" plain @click="clearDramasResult" style="margin-right: 15px;">
              🗑️ 清空结果
            </el-button>
            <el-button type="info" text bg @click="close" style="padding: 5px 10px;">关闭</el-button>
          </div>
        </div>
      </template>

      <el-table :data="goodDramas" border stripe height="500px" size="small">
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="bookName" label="剧名" min-width="200" />
        <el-table-column prop="roi" label="今日 ROI (首日)" width="120" align="center">
          <template #default="scope">
            <el-tag type="danger" effect="dark" round size="small">{{ scope.row.roi }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="cost" label="消耗金额" width="100" align="center" />
        <el-table-column prop="fetchTime" label="检索时间" width="140" align="center" />
      </el-table>
    </el-dialog>

    <el-dialog v-model="showPublishedDialog" title="📅 今日全网防重已发剧单" top="4vh" width="500px" append-to-body destroy-on-close>
      <div v-if="todayPublishedList.length === 0" style="text-align: center; padding: 40px 0; color: #909399;">
        <el-icon size="40"><DocumentDelete /></el-icon>
        <div style="margin-top: 10px;">今日暂无上剧记录，配额充足</div>
      </div>
      
      <div v-else>
        <div style="margin-bottom: 10px; color: #666; font-size: 13px;">
          💡 记录当前卡密在所有设备上今日已成功分发的漫剧
        </div>
        <el-table 
          :data="todayPublishedList.map((name, index) => ({ id: index + 1, name }))" 
          border 
          stripe 
          max-height="450px" 
          size="small"
          :header-cell-style="{ background: '#f5f7fa', color: '#606266' }"
        >
          <el-table-column prop="id" label="序号" width="70" align="center" />
          <el-table-column prop="name" label="已发剧名" min-width="200" />
          <el-table-column label="状态" width="100" align="center">
            <template #default>
              <el-tag type="success" size="small" effect="plain">已拦截</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div style="margin-top: 15px; text-align: right; color: #999; font-size: 12px;">
          共计：{{ todayPublishedList.length }} 部
        </div>
      </div>

      <template #footer>
        <span class="dialog-footer">
          <el-button type="primary" @click="showPublishedDialog = false">关闭窗口</el-button>
        </span>
      </template>
    </el-dialog>

    <transition name="fade">
      <div v-if="isAutoRunning" class="cruise-overlay">
        <div class="cruise-panel">
          <div class="cp-header" style="justify-content: space-between; width: 100%;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div class="radar-spinner"></div>
              <h2 style="margin: 0; color: #303133; letter-spacing: 1px;">自动巡航及上剧引擎运行中</h2>
            </div>
            
            <el-button type="primary" plain round @click="showPublishedDialog = true">
              <el-icon style="margin-right: 4px;"><Tickets /></el-icon> 
              今日已发 ({{ todayPublishedList.length }})
            </el-button>
          </div>
          
          <div class="cp-time">
            <el-tag type="info" size="large" effect="plain">
              启动时间：<span style="font-weight: bold;">{{ startTimeStr }}</span>
            </el-tag>
            <el-tag type="success" size="large" effect="dark" style="margin-left: 15px; font-size: 14px;">
              持续运行：<span style="font-family: monospace; font-size: 16px; letter-spacing: 1px;">{{ cruiseDuration }}</span>
            </el-tag>
          </div>

          <div class="cp-steps">
            <div class="cp-step" :class="{ active: currentPhase === 'waiting' }">
              <el-icon v-if="currentPhase === 'waiting'" class="is-loading"><Loading /></el-icon>
              1. 循环倒计时
            </div>
            <el-icon class="step-arrow"><ArrowRight /></el-icon>
            <div class="cp-step" :class="{ active: currentPhase === 'fetching' }">
              <el-icon v-if="currentPhase === 'fetching'" class="is-loading"><Loading /></el-icon>
              2. 雷达检索cbo漫剧
            </div>
            <el-icon class="step-arrow"><ArrowRight /></el-icon>
            <div class="cp-step" :class="{ active: currentPhase === 'publishing' }">
              <el-icon v-if="currentPhase === 'publishing'" class="is-loading"><Loading /></el-icon>
              3. 分发多方案上剧
            </div>
          </div>

          <div class="cp-content">
            <div v-if="currentPhase === 'publishing' && currentBatch.length > 0" class="content-box publishing-box">
              <div style="font-weight: bold; margin-bottom: 10px; color: #e6a23c;">
                正在分发上剧 (共 {{ currentBatch.length }} 部)：
              </div>
              <div class="tags-wrapper">
                <el-tag v-for="d in currentBatch" :key="d.bookName" size="default" type="warning" effect="dark">
                  {{ d.bookName }}
                </el-tag>
              </div>
            </div>
            <div v-else-if="currentPhase === 'waiting'" class="content-box empty-box">
              <el-icon size="30" color="#c0c4cc"><Timer /></el-icon>
              <div style="margin-top: 10px;">当前任务已完成，等待下一轮巡航周期触发...</div>
            </div>
            <div v-else-if="currentPhase === 'fetching'" class="content-box empty-box fetching-box">
              <el-icon size="30" color="#409eff" class="is-loading"><Loading /></el-icon>
              <div style="margin-top: 10px; color: #409eff;">正在拉取平台大盘数据，请耐心等待...</div>
            </div>
          </div>

          <div class="cp-footer">
            <el-button type="danger" size="large" @click="toggleAutoRun" style="width: 200px; font-weight: bold;">
              ⏹ 停止自动巡航
            </el-button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from "vue";
import { ElMessage } from "element-plus";
// 🌟 引入 Tickets（清单图标）和 DocumentDelete
import { Loading, ArrowRight, Timer, Tickets, DocumentDelete } from "@element-plus/icons-vue";

const props = defineProps(["allProfiles"]);
const emit = defineEmits(["cruise-status-change"]); 

const isFetching = ref(false);
const isAutoRunning = ref(false);
const intervalMin = ref(30);
const goodDramas = ref([]);

const showTableDialog = ref(false);
const selectedProfiles = ref([]);

// 🌟 新增状态：控制已发剧单的弹窗和列表数据
const showPublishedDialog = ref(false);
const todayPublishedList = ref([]);

const loadingText = ref("🚀 正在检索cbo漫剧数据，请稍候...");

// 巡航控制台状态
const currentPhase = ref("waiting");
const currentBatch = ref([]);
const cruiseStartTime = ref(null);
const startTimeStr = ref("");
const cruiseDuration = ref("00:00:00");
let durationTimer = null;

watch(isAutoRunning, (newVal) => {
  emit("cruise-status-change", newVal);
});

const getTodayString = () => {
  const d = new Date();
  const t = new Date(d.getTime() - (d.getTimezoneOffset() * 60000));
  return t.toISOString().split('T')[0];
};

const fetchDateRange = ref([getTodayString(), getTodayString()]);

const fetchParams = ref({
  carrier: "link",
  copyrightType: "分销",
  source: "ZZFQ",
  linkType: "IAP",
  roiThreshold: "0.7"
});

const exportConfig = ref({
  copyright: "ZZ番茄",
  materialCount: "30"
});

const groupedProfilesForSelect = computed(() => {
  if (!props.allProfiles) return [];
  const groupsMap = new Map();
  groupsMap.set("默认分组", []);
  Object.keys(props.allProfiles).forEach(name => {
    const groupName = props.allProfiles[name].group || "默认分组";
    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, []);
    }
    groupsMap.get(groupName).push(name);
  });
  const result = [];
  for (const [gName, pList] of groupsMap.entries()) {
    if (pList.length > 0 || gName === "默认分组") {
      result.push({ label: `📂 ${gName}`, options: pList });
    }
  }
  return result;
});

const selectAllProfiles = () => {
  if (props.allProfiles) selectedProfiles.value = Object.keys(props.allProfiles);
};

const removeSelectedProfile = (name) => {
  selectedProfiles.value = selectedProfiles.value.filter((p) => p !== name);
};

const openProfileFolder = (name) => {
  if (window.api && window.api.openProfileFolder) {
    window.api.openProfileFolder(name);
  }
};

const validateRoi = () => {
  let val = parseFloat(fetchParams.value.roiThreshold);
  if (isNaN(val) || val < 0) val = 0.7;
  fetchParams.value.roiThreshold = val.toString();
};

const validateNumber = (key, defaultVal) => {
  let val = parseInt(exportConfig.value[key]);
  if (isNaN(val) || val <= 0) val = defaultVal;
  exportConfig.value[key] = val.toString();
};

const startDurationTimer = () => {
  const now = new Date();
  cruiseStartTime.value = now;
  startTimeStr.value = now.toLocaleTimeString();

  if (durationTimer) clearInterval(durationTimer);
  durationTimer = setInterval(() => {
    const diff = Math.floor((new Date() - cruiseStartTime.value) / 1000);
    const h = String(Math.floor(diff / 3600)).padStart(2, '0');
    const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
    const s = String(diff % 60).padStart(2, '0');
    cruiseDuration.value = `${h}:${m}:${s}`;
  }, 1000);
};

const stopDurationTimer = () => {
  if (durationTimer) clearInterval(durationTimer);
  cruiseDuration.value = "00:00:00";
  startTimeStr.value = "";
  currentPhase.value = "waiting";
  currentBatch.value = [];
};

const handleSaveSettings = async () => {
  validateRoi();
  validateNumber('materialCount', 30);

  const payload = {
    fetchParams: JSON.parse(JSON.stringify(fetchParams.value)),
    exportConfig: JSON.parse(JSON.stringify(exportConfig.value)),
    intervalMin: intervalMin.value
  };

  try {
    if (window.api && window.api.saveFetchSettings) {
      const res = await window.api.saveFetchSettings(payload);
      if (res.success) {
        ElMessage.success("配置已成功保存！");
      } else {
        ElMessage.error("保存失败: " + res.msg);
      }
    } else {
      ElMessage.warning("接口未连接，前端已记录数据 (请在 preload/main 中实现 saveFetchSettings)");
    }
  } catch (err) {
    ElMessage.error("系统异常: " + err.message);
  }
};

onMounted(async () => {
  try {
    if (window.api && window.api.getFetchSettings) {
      const res = await window.api.getFetchSettings();
      if (res.success && res.data) {
        if (res.data.fetchParams) {
          Object.assign(fetchParams.value, res.data.fetchParams);
        }
        if (res.data.exportConfig) {
          Object.assign(exportConfig.value, res.data.exportConfig);
        }
        if (res.data.intervalMin) {
          intervalMin.value = res.data.intervalMin;
        }
      }
    }
  } catch (e) {
    console.error("加载预设配置失败:", e);
  }

  window.api.onFetchLogUpdate((data) => {
    if (data.type === 'progress') {
      loadingText.value = `🚀 正在检索 [${data.dateRange}] 的数据，已抓取 ${data.count} 条 (共 ${data.total} 条) ...可随时点击中止`;
    } 
    else if (data.type === 'data') {
      goodDramas.value = data.list;
      if (isAutoRunning.value) {
        currentBatch.value = data.list;
        // 🌟 核心拦截：一旦有新剧正在被上，就把它追加到已发记录列表里，让计数器自动上涨
        data.list.forEach(item => {
          if (!todayPublishedList.value.includes(item.bookName)) {
            todayPublishedList.value.push(item.bookName);
          }
        });
      }
    } else if (data.type === 'status') {
      isAutoRunning.value = data.isRunning;
      if (!data.isRunning) stopDurationTimer();
    } else if (data.type === 'error') {
      ElMessage.error(data.msg);
      if (isAutoRunning.value && data.msg.includes('后台巡航抓取失败')) {
        currentPhase.value = 'waiting';
      }
    } else if (data.type === 'success') {
      
      // 🌟 核心修改：如果是开局的防重记录单，静默处理，不要在顶部弹窗打扰用户
      if (!data.msg.includes('📝 [防重记录]')) {
        ElMessage.success(data.msg); 
      }

      // 🌟 提取开局初始化的防重列表（拦截主进程发来的提示语）
      if (data.msg.includes('📝 [防重记录] 今日全网已发剧集')) {
        try {
          const rawNames = data.msg.split('): ')[1];
          if (rawNames) {
            todayPublishedList.value = rawNames.split('、').map(n => n.trim()).filter(n => n);
          }
        } catch(e) {}
      } else if (data.msg.includes('📝 [防重记录] 经核对，今日全网暂无上剧记录')) {
        todayPublishedList.value = [];
      }

      if (isAutoRunning.value) {
        if (data.msg.includes('正在按条件执行后台自动巡航')) {
          currentPhase.value = 'fetching';
        } else if (data.msg.includes('准备触发自动化上剧') || data.msg.includes('将为您自动分发')) { 
          currentPhase.value = 'publishing';
        } else if (data.msg.includes('任务执行完毕') || data.msg.includes('本次巡航未发现') || data.msg.includes('跳过上剧')) {
          currentPhase.value = 'waiting';
        }
      }
    }
  });
});

const handleManualFetch = async () => {
  validateRoi();
  isFetching.value = true;
  goodDramas.value = [];

  const sDay = fetchDateRange.value?.[0] || getTodayString();
  const eDay = fetchDateRange.value?.[1] || getTodayString();
  loadingText.value = `🚀 正在准备拉取 [${sDay} 至 ${eDay}] 的漫剧，建立连接中...`;

  const finalParams = JSON.parse(JSON.stringify(fetchParams.value));
  finalParams.roiThreshold = parseFloat(finalParams.roiThreshold);

  if (fetchDateRange.value && fetchDateRange.value.length === 2) {
    finalParams.startDay = fetchDateRange.value[0];
    finalParams.endDay = fetchDateRange.value[1];
  } else {
    finalParams.startDay = getTodayString();
    finalParams.endDay = getTodayString();
  }

  try {
    const res = await window.api.fetchGoodDramas(finalParams);
    if (res.success) {
      goodDramas.value = res.data;
      ElMessage.success(`抓取成功！发现 ${res.data.length} 部漫剧`);
    } else if (res.msg === 'CANCELLED') {
      ElMessage.warning("已成功中止抓取！");
    } else {
      ElMessage.error("抓取失败: " + res.msg);
    }
  } catch (error) {
    ElMessage.error("系统异常");
  } finally {
    isFetching.value = false;
    setTimeout(() => {
      loadingText.value = "🚀 正在全网检索漫剧数据，请稍候...";
    }, 500);
  }
};

const cancelFetch = () => {
  window.api.cancelFetchDramas();
  loadingText.value = "🛑 正在请求中止，等待当前页返回...";
  ElMessage.warning("正在请求中止，请稍候...");
};

const clearDramasResult = () => {
  goodDramas.value = [];
  showTableDialog.value = false;
  ElMessage.success("已清空抓取结果");
};

const handleExportExcel = async () => {
  if (goodDramas.value.length === 0) return;
  validateNumber('materialCount', 30);

  try {
    const res = await window.api.exportDramasExcel({
      dramas: JSON.parse(JSON.stringify(goodDramas.value)),
      config: JSON.parse(JSON.stringify(exportConfig.value))
    });
    if (res.success) ElMessage.success(`导出成功！文件已保存至: ${res.filePath}`);
    else if (res.msg !== "取消下载") ElMessage.error("导出失败: " + res.msg);
  } catch (err) {
    ElMessage.error("系统异常: " + err.message);
  }
};

const handleCopyText = async () => {
  if (goodDramas.value.length === 0) return;
  const copyright = exportConfig.value.copyright || "";
  const copyString = goodDramas.value.map(item => `${copyright}\t\t${item.bookName}`).join('\n');
  try {
    await navigator.clipboard.writeText(copyString);
    ElMessage.success("已复制到剪贴板，可直接前往 Excel 粘贴！");
  } catch (err) {
    ElMessage.error("复制失败，请重试或检查浏览器权限");
  }
};

const toggleAutoRun = () => {
  if (isAutoRunning.value) {
    window.api.stopAutoFetch();
    isAutoRunning.value = false;
    stopDurationTimer();
  } else {
    if (selectedProfiles.value.length === 0) {
      ElMessage.error("🛑 开启失败！请至少在下方勾选一个【自动化上剧目标方案】");
      return;
    }

    const today = getTodayString();
    fetchDateRange.value = [today, today];
    ElMessage.info("已自动将抓取范围锁定为今日数据");

    validateRoi();
    validateNumber('materialCount', 30);

    ElMessage.success(`已开启后台自动巡航，每 ${intervalMin.value} 分钟执行一次`);

    const finalParams = JSON.parse(JSON.stringify(fetchParams.value));
    finalParams.roiThreshold = parseFloat(finalParams.roiThreshold);

    finalParams.startDay = today;
    finalParams.endDay = today;

    startDurationTimer();
    currentPhase.value = 'fetching';
    isAutoRunning.value = true;

    window.api.startAutoFetch({
      interval: intervalMin.value,
      ...finalParams,
      exportConfig: JSON.parse(JSON.stringify(exportConfig.value)),
      selectedProfiles: JSON.parse(JSON.stringify(selectedProfiles.value))
    });
  }
};
</script>

<style scoped>
.fetch-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  position: relative; 
}

.elevate-controls {
  position: relative;
  z-index: 1000; 
  background: transparent;
}

.settings-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.setting-group {
  display: flex;
  flex-direction: column;
}

.group-desc {
  font-size: 13px;
  color: #303133;
  font-weight: bold;
  margin-bottom: 8px;
}

.desc-light {
  font-weight: normal;
  color: #909399;
  font-size: 12px;
  margin-left: 6px;
}

.filter-container {
  background-color: #fafafa;
  padding: 12px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-label {
  font-size: 13px;
  font-weight: bold;
  color: #606266;
  width: 120px;
}

:deep(.el-date-editor) {
  height: 30px;
}
:deep(.el-date-editor .el-input__wrapper) {
  height: 30px;
}

.filter-item-small {
  width: 150px;
}

.filter-item-middle {
  width: 220px;
}

.custom-input-box {
  display: flex;
  align-items: center;
  background-color: #fff;
  border-radius: 4px;
  border: 1px solid #dcdfe6;
  overflow: hidden;
  height: 30px;
  transition: border-color 0.2s;
}

.custom-input-box:focus-within {
  border-color: #409eff;
}

.custom-label {
  font-size: 13px;
  color: #606266;
  background-color: #f5f7fa;
  padding: 0 10px;
  height: 100%;
  display: flex;
  align-items: center;
  border-right: 1px solid #dcdfe6;
}

.custom-input {
  width: 50px;
}

.custom-input :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background-color: transparent;
  padding: 0 5px;
}

.custom-input :deep(.el-input__inner) {
  text-align: center;
  height: 30px;
}

.custom-suffix {
  font-size: 13px;
  color: #606266;
  padding-right: 8px;
}

.controls-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.manual-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.auto-controls {
  display: flex;
  align-items: center;
  justify-content: center;
}

.auto-box {
  display: flex;
  align-items: center;
  background-color: #f0f9eb;
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid #e1f3d8;
  flex-wrap: wrap; 
  gap: 8px;
}

.data-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding:0px 20px 20px 20px!important;
}

.profile-select-section {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background-color: #fafafa;
  padding: 12px 15px;
  border-radius: 4px;
  border: 1px solid #ebeef5;
}

.row-flex {
  display: flex;
  align-items: center;
  width: 100%;
}

.selected-tags-box {
  margin-top: 12px;
  padding-left: 90px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
}

.selected-tags-box::-webkit-scrollbar { width: 6px; }
.selected-tags-box::-webkit-scrollbar-thumb { background-color: #dcdfe6; border-radius: 4px; }

/* 🌟 已发剧单弹窗内标签样式 */
.published-tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 10px 0;
  max-height: 400px;
  overflow-y: auto;
}

.cruise-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(8px); 
  -webkit-backdrop-filter: blur(8px);
  z-index: 100;
  display: flex;
  justify-content: center;
  align-items: center;
}

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.cruise-panel {
  width: 650px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  border: 1px solid #e4e7ed;
  padding: 30px;
  display: flex;
  flex-direction: column;
  gap: 25px;
  animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(30px); }
  to { opacity: 1; transform: translateY(0); }
}

.cp-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 15px;
}

.radar-spinner {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: #67c23a;
  box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.7);
  animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

@keyframes pulse-ring {
  0% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0.7); }
  70% { box-shadow: 0 0 0 15px rgba(103, 194, 58, 0); }
  100% { box-shadow: 0 0 0 0 rgba(103, 194, 58, 0); }
}

.cp-time {
  display: flex;
  justify-content: center;
  align-items: center;
}

.cp-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f5f7fa;
  padding: 15px 20px;
  border-radius: 8px;
}

.cp-step {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 14px;
  font-weight: bold;
  padding: 8px 15px;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.cp-step.active {
  background: #409eff;
  color: white;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.3);
}

.step-arrow {
  color: #c0c4cc;
  font-size: 20px;
}

.content-box {
  min-height: 120px;
  border: 2px dashed #ebeef5;
  border-radius: 8px;
  padding: 20px;
}

.publishing-box {
  background: #fdf6ec;
  border-color: #f3d19e;
}

.empty-box {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: #909399;
  background: #fafafa;
}

.fetching-box {
  background: #ecf5ff;
  border-color: #a0cfff;
}

.tags-wrapper {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.cp-footer {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

:deep(.el-button.is-loading) {
  animation: none !important;
}
:deep(.el-button.is-loading .el-icon) {
  animation: rotating 2s linear infinite !important;
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>