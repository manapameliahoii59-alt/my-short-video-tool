<template>
  <div class="run-tab-container">
    <div
      class="card-header-actions global-drama-section"
      :class="{ 'is-dragging': isDragging }"
      @dragover.prevent.stop="onDragOver"
      @dragenter.prevent.stop="onDragOver"
      @dragleave.prevent.stop="isDragging = false"
      @drop.prevent.stop="handleDrop"
    >
      <span
        style="width: 100px; font-weight: bold; color: #409eff; flex-shrink: 0"
      >
        全局剧单：
      </span>
      <div class="path-link-wrapper">
        <span
          v-if="globalDramaList"
          class="file-link-text"
          title="点击打开文件"
          @click="handleOpenGlobalDrama"
        >
          <el-icon><DocumentChecked /></el-icon>
          {{ getFileName(globalDramaList) }}
        </span>
        <span v-else class="file-none-text">
          <el-icon><Document /></el-icon> 尚未选择（支持拖拽文件到此处）
        </span>
      </div>

      <el-button type="success" link @click="downloadTemplate">
        [下载模板]
      </el-button>
      <el-button type="primary" link @click="pickGlobalDrama">
        [更换剧单]
      </el-button>
      <el-button
        v-if="globalDramaList"
        type="danger"
        link
        @click="clearGlobalDrama"
      >
        [清除]
      </el-button>
    </div>

    <div class="card-header-actions profile-select-section">
      <div class="row-flex">
        <span style="width: 100px; font-weight: bold; flex-shrink: 0">
          运行方案：
        </span>
        <el-select
          v-model="selectedProfiles"
          multiple
          collapse-tags
          collapse-tags-tooltip
          filterable
          clearable
          placeholder="可输入关键词搜索方案 (支持多选)"
          style="flex: 1"
        >
          <el-option
            v-for="(p, name) in allProfiles"
            :key="name"
            :label="name"
            :value="name"
          />
        </el-select>
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

    <div class="detail-panel">
      <div class="form-row action-row">
        <span class="label-text">运行动作：</span>
        <el-radio-group v-model="form.action">
          <el-radio value="publish" size="large">
            <span style="color: #f56c6c; font-weight: bold">正式发布</span>
          </el-radio>
          <el-radio value="cancel" size="large">测试模式</el-radio>
        </el-radio-group>
      </div>
    </div>

    <div class="actions">
      <el-button
        v-if="!isRunning"
        type="success"
        size="large"
        class="btn-start"
        :icon="VideoPlay"
        @click="start"
      >
        启动自动化任务 (多方案队列)
      </el-button>

      <el-button
        v-else
        type="danger"
        size="large"
        class="btn-start btn-cancel"
        :disabled="isStopping"
        @click="cancelTask"
      >
        <el-icon v-if="isStopping" class="is-loading"><Loading /></el-icon>
        <span>{{ isStopping ? "正在取消任务..." : "🚫 取消当前任务" }}</span>
      </el-button>

      <el-button
        type="info"
        size="large"
        :icon="Delete"
        @click="$emit('clear-logs')"
      >
        清空日志
      </el-button>
    </div>

    <div id="log-window" ref="logRef">
      <div
        v-for="(log, i) in logs"
        :key="i"
        class="log-line"
        v-html="log"
      ></div>
      <div v-if="logs.length === 0" class="log-empty">⏳ 等待指令启动...</div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick } from "vue";
import {
  VideoPlay,
  Delete,
  Document,
  DocumentChecked,
  Loading, // 🌟 新增引入这个图标
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";

const props = defineProps([
  "allProfiles",
  "logs",
  "globalDramaList",
  "isRunning",
]);
const emit = defineEmits(["run-task", "clear-logs", "update-global-drama"]);
// 🌟 新增：局部状态，记录用户是否点击了取消
const isStopping = ref(false);

const selectedProfiles = ref([]);
const logRef = ref(null);
const isDragging = ref(false);

const form = reactive({
  action: "publish",
});

const getFileName = (path) => (path ? path.split(/[\\/]/).pop() : "");

const removeSelectedProfile = (name) => {
  selectedProfiles.value = selectedProfiles.value.filter((p) => p !== name);
};

const openProfileFolder = (name) => {
  if (window.api && window.api.openProfileFolder) {
    window.api.openProfileFolder(name);
  }
};

// 🌟 监听 isRunning 的变化：一旦任务彻底停下来了（isRunning 变回 false），把 isStopping 重置
watch(
  () => props.isRunning,
  (newVal) => {
    if (newVal === false) {
      isStopping.value = false;
    }
  },
);

const cancelTask = () => {
  if (window.api && window.api.stopTask) {
    isStopping.value = true; // 🌟 第一时间切换状态，让按钮变灰/转圈
    window.api.stopTask();
  }
};

/**
 * 统一导入文件处理
 */
const processImportFile = async (sourcePath) => {
  if (!sourcePath) return;

  const isExcel = sourcePath.toLowerCase().match(/\.(xlsx|xls|csv)$/);
  if (!isExcel) {
    ElMessage.error("请上传 Excel 或 CSV 格式的文件");
    return;
  }

  const res = await window.api.importFile({
    profileName: "global_assets",
    sourcePath,
  });

  if (res.success) {
    emit("update-global-drama", res.fileName);
    ElMessage.success("全局剧单已更新");
  } else {
    ElMessage.error("文件导入失败: " + res.msg);
  }
};

// --- 🌟 按照 ConfigTab.vue 完全重写的拖拽逻辑 ---

const onDragOver = (event) => {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
  isDragging.value = true;
};

const handleDrop = (event) => {
  isDragging.value = false;

  const file = event.dataTransfer?.files[0];
  if (!file) return;

  // 🌟 核心修复：使用你项目中预先定义好的 getFilePath 方法获取真实路径
  let filePath = "";
  if (window.api && window.api.getFilePath) {
    filePath = window.api.getFilePath(file);
  } else {
    filePath = file.path;
  }

  if (filePath) {
    processImportFile(filePath);
  } else {
    ElMessage.warning("无法读取文件路径，请点击选择");
  }
};

// --- 其他功能 ---

const pickGlobalDrama = async () => {
  const sourcePath = await window.api.openFile();
  if (sourcePath) {
    processImportFile(sourcePath);
  }
};

const clearGlobalDrama = () => {
  emit("update-global-drama", "");
  ElMessage.info("已清空全局剧单配置");
};

const handleOpenGlobalDrama = () => {
  if (props.globalDramaList) {
    window.api.openExternal({
      profileName: "global_assets",
      fileName: props.globalDramaList,
    });
  }
};

const start = () => {
  if (!props.globalDramaList) return ElMessage.warning("请先选择全局剧单文件");
  if (selectedProfiles.value.length === 0)
    return ElMessage.warning("请至少选择一个运行方案");

  emit("run-task", {
    selectedProfiles: selectedProfiles.value,
    globalDramaList: props.globalDramaList,
    action: form.action,
  });
};

const downloadTemplate = async () => {
  if (window.api && window.api.downloadDramaTemplate) {
    const res = await window.api.downloadDramaTemplate();
    if (res.success) {
      ElMessage.success(`模板已成功保存至：${res.filePath}`);
    } else if (res.msg !== "取消下载") {
      ElMessage.error(`下载失败: ${res.msg}`);
    }
  }
};

watch(
  () => props.logs,
  () => {
    nextTick(() => {
      if (logRef.value) {
        logRef.value.scrollTop = logRef.value.scrollHeight;
      }
    });
  },
  { deep: true },
);
</script>

<style scoped>
.run-tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

/* 🌟 去掉了之前可能导致冲突的 pointer-events 设置 */
.card-header-actions {
  background: #fff;
  padding: 12px 15px;
  border-radius: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  margin-bottom: 12px;
  flex-shrink: 0;
  border: 2px dashed transparent;
  transition: all 0.3s ease;
}

/* 拖拽高亮样式 */
.global-drama-section.is-dragging {
  border-color: #409eff;
  background-color: #f0f7ff;
}

.global-drama-section {
  display: flex;
  align-items: center;
}

.profile-select-section {
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.row-flex {
  display: flex;
  align-items: center;
  width: 100%;
}

.selected-tags-box {
  margin-top: 12px;
  padding-left: 100px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 140px;
  overflow-y: auto;
}

.selected-tags-box::-webkit-scrollbar {
  width: 6px;
}
.selected-tags-box::-webkit-scrollbar-thumb {
  background-color: #dcdfe6;
  border-radius: 4px;
}

.detail-panel {
  background: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
  margin-bottom: 15px;
}

.form-row {
  display: flex;
  align-items: center;
  font-size: 14px;
}

.label-text {
  width: 100px;
  color: #606266;
  font-weight: bold;
}

.path-link-wrapper {
  flex: 1;
  overflow: hidden;
  margin-right: 10px;
}

.file-link-text {
  color: #409eff;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  text-decoration: underline;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-none-text {
  color: #909399;
  display: flex;
  align-items: center;
  gap: 5px;
}

.actions {
  display: flex;
  gap: 15px;
  margin-bottom: 10px;
  flex-shrink: 0;
}

/* 锁定按钮宽度，防止文字切换时按钮忽大忽小 */
.btn-start {
  flex: 3;
  font-weight: bold;
  min-width: 220px; /* 🌟 核心：给个固定最小宽度，文字长短变化不抖动 */
  display: flex;
  align-items: center;
  justify-content: center;
}

#log-window {
  flex: 1;
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 15px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  border-radius: 4px;
  overflow-y: auto;
  line-height: 1.5;
  border: 1px solid #333;
}

.log-line {
  margin-bottom: 4px;
  word-break: break-all;
}

.log-empty {
  color: #666;
  text-align: center;
  margin-top: 20px;
}

:deep(.el-radio-group) {
  display: flex;
  align-items: center;
}

/* 强制给取消状态一点置灰感，但保持红色基调 */
.btn-cancel.is-disabled {
  opacity: 0.8;
  background-color: #fab6b6 !important;
  border-color: #fab6b6 !important;
  color: #fff !important;
}

/* 确保旋转图标有旋转动画 */
.is-loading {
  animation: rotating 2s linear infinite;
  margin-right: 8px; /* 图标和文字的间距 */
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
