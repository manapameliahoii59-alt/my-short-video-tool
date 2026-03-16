<template>
  <div class="config-container">
    <div class="sidebar">
      <div class="sidebar-header">
        <el-input
          v-model="searchKeyword"
          placeholder="搜索方案..."
          prefix-icon="Search"
          clearable
          size="default"
        />
        <el-button
          type="success"
          :icon="Plus"
          circle
          size="small"
          style="margin-left: 8px"
          title="新建方案"
          @click="initNewProfile"
        />
      </div>

      <div class="sidebar-list">
        <div
          v-for="name in filteredProfileNames"
          :key="name"
          class="list-item"
          :class="{ active: localSelectedName === name }"
          @click="selectProfile(name)"
        >
          <div class="item-icon">
            <el-icon><Document /></el-icon>
          </div>
          <div class="item-content">
            <div class="item-title">{{ name }}</div>
            <div class="item-desc">
              {{ allProfiles[name]?.businessType || "未知类型" }}
            </div>
          </div>
          <div class="item-action" @click.stop="deleteProfileName(name)">
            <el-icon><Delete /></el-icon>
          </div>
        </div>

        <div v-if="filteredProfileNames.length === 0" class="empty-list">
          <span v-if="searchKeyword">无匹配结果</span>
          <span v-else>暂无方案，请新建</span>
        </div>
      </div>

      <div class="sidebar-footer">
        <el-button-group style="width: 100%; display: flex">
          <el-button
            style="flex: 1; display: flex; justify-content: center; align-items: center;"
            size="small"
            plain
            :disabled="isCloudUploading || isCloudDownloading"
            @click="handleCloudUpload"
          >
            <el-icon v-if="isCloudUploading" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
            <span v-else style="margin-right: 4px;">☁️</span>
            <span>{{ isCloudUploading ? "备份中..." : "备份" }}</span>
          </el-button>
          
          <el-button
            style="flex: 1; display: flex; justify-content: center; align-items: center;"
            size="small"
            plain
            :disabled="isCloudUploading || isCloudDownloading"
            @click="handleCloudDownload"
          >
            <el-icon v-if="isCloudDownloading" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
            <span v-else style="margin-right: 4px;">📥</span>
            <span>{{ isCloudDownloading ? "同步中..." : "恢复" }}</span>
          </el-button>
        </el-button-group>
      </div>
    </div>

    <div class="main-content">
      <el-card class="detail-card" shadow="never">
        <template #header>
          <div class="header-toolbar">
            <div class="header-left">
              <el-tag
                :type="isNewMode ? 'success' : 'primary'"
                effect="dark"
                size="small"
                style="margin-right: 10px"
              >
                {{ isNewMode ? "NEW" : "EDIT" }}
              </el-tag>
              <span class="header-title">{{
                isNewMode ? "新建方案" : targetName
              }}</span>
            </div>

            <div class="header-right">
              <el-button
                v-if="localSelectedName"
                type="info"
                link
                :icon="FolderOpened"
                @click="openFolder(localSelectedName)"
              >
                打开目录
              </el-button>
            </div>
          </div>
        </template>

        <div class="detail-scroll-area">
          <div class="form-row">
            <div class="form-item half">
              <span class="label-text">方案名称：</span>
              <el-input
                v-model="targetName"
                placeholder="方案名称 (唯一标识)"
                clearable
              />
            </div>
            <div class="form-item half">
              <span class="label-text">业务类型：</span>
              <el-select v-model="editingForm.businessType" style="width: 100%">
                <el-option value="端原生-付费短剧" label="端原生-付费短剧" />
                <el-option value="端原生-免费短剧" label="端原生-免费短剧" />
                <el-option value="番茄-付费短剧" label="番茄-付费短剧" />
                <el-option value="番茄-免费短剧" label="番茄-免费短剧" />
              </el-select>
            </div>
          </div>

          <el-divider content-position="left">文件配置</el-divider>

          <div
            v-for="(path, key) in editingForm.files"
            :key="key"
            class="file-drop-row"
          >
            <div class="file-label">
              <el-icon><Document /></el-icon> {{ labelMap[key] || key }}
              <span v-if="!path" class="status-tag unconfigured">未配置</span>
              <span v-else class="status-tag configured">已暂存</span>
            </div>

            <div
              class="drop-zone"
              :class="{ 'has-file': path }"
              @click="triggerFileSelect(key)"
              @dragover.prevent.stop="onDragOver"
              @dragenter.prevent.stop="onDragOver"
              @drop.prevent.stop="handleDrop($event, key)"
            >
              <template v-if="path">
                <div class="file-info">
                  <div class="file-main">
                    <el-icon class="file-icon"><DocumentChecked /></el-icon>
                    <span class="file-name">{{ getFileName(path) }}</span>
                  </div>
                  <div class="file-sub">{{ path }}</div>
                </div>
                <div class="file-actions" @click.stop>
                  <el-button
                    type="primary"
                    size="small"
                    link
                    @click="triggerFileSelect(key)"
                    >更换</el-button
                  >
                  <el-divider direction="vertical" />
                  <el-button
                    type="info"
                    size="small"
                    link
                    @click="openExternal(path)"
                    >打开</el-button
                  >
                  <el-divider direction="vertical" />
                  <el-button
                    type="danger"
                    size="small"
                    link
                    @click="editingForm.files[key] = ''"
                    >清除</el-button
                  >
                </div>
              </template>

              <div v-else class="placeholder-info">
                <el-icon class="upload-icon"><UploadFilled /></el-icon>
                <div class="text">点击或拖拽文件</div>
              </div>
            </div>
          </div>

          <div class="save-footer">
            <el-button
              type="primary"
              size="large"
              class="main-save-btn"
              :loading="isSaving"
              @click="handleMainSave"
            >
              {{ isNewMode ? "确认创建" : "保存修改" }}
            </el-button>
          </div>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import {
  Search,
  Plus,
  Delete,
  FolderOpened,
  Document,
  DocumentChecked,
  UploadFilled,
  Loading
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, ElLoading } from "element-plus";

// 🌟 修改点 2：接收 userKey 作为 prop，用于云端鉴权
const props = defineProps(["allProfiles", "userKey"]);
const emit = defineEmits(["update-profiles"]);

const localSelectedName = ref(""); // 当前选中的方案ID (左侧高亮)
const targetName = ref(""); // 编辑框里的名字
const searchKeyword = ref(""); // 搜索关键词
const isSaving = ref(false);

// 🌟 修改点 3：新增云同步的 Loading 状态变量
const isCloudUploading = ref(false);
const isCloudDownloading = ref(false);

const labelMap = {
  TEMPLATE: "任务模板",
  ACCOUNTS: "账号列表",
};

const editingForm = reactive({
  businessType: "端原生-付费短剧",
  files: { TEMPLATE: "", ACCOUNTS: "" },
});

// 计算属性：根据搜索词过滤列表
const filteredProfileNames = computed(() => {
  const keys = Object.keys(props.allProfiles);
  if (!searchKeyword.value) return keys;
  return keys.filter((name) =>
    name.toLowerCase().includes(searchKeyword.value.toLowerCase()),
  );
});

const isNewMode = computed(
  () => !localSelectedName.value || !props.allProfiles[localSelectedName.value],
);
const getFileName = (path) => (path ? path.split(/[\\/]/).pop() : "");

// --- 逻辑方法 ---

const initNewProfile = () => {
  localSelectedName.value = ""; // 清空选中，代表新建
  targetName.value = "";
  editingForm.businessType = "端原生-付费短剧";
  editingForm.files = { TEMPLATE: "", ACCOUNTS: "" };
};

// 点击左侧列表某一项
const selectProfile = (name) => {
  if (props.allProfiles[name]) {
    localSelectedName.value = name;
    targetName.value = name;
    const p = props.allProfiles[name];
    editingForm.businessType = p.businessType;

    // 🌟 核心修改：不要直接 {...p.files}，而是手动解构，彻底抛弃旧数据里的 DRAMA_LIST
    editingForm.files = {
      TEMPLATE: p.files.TEMPLATE || "",
      ACCOUNTS: p.files.ACCOUNTS || "",
    };
  }
};

const deleteProfileName = (name) => {
  ElMessageBox.confirm(
    `确定删除方案 [${name}] 吗？\n这将同时删除其下属的所有物理文件，无法恢复。`,
    "高能预警",
    {
      type: "warning",
      confirmButtonText: "彻底删除",
      cancelButtonText: "取消",
    },
  )
    .then(async () => {
      try {
        await window.api.deleteProfileFolder(name);
        ElMessage.success("物理文件清理完毕");
      } catch (e) {
        console.error("物理删除失败", e);
      }

      const profiles = { ...props.allProfiles };
      delete profiles[name];
      emit("update-profiles", profiles);

      if (localSelectedName.value === name) {
        initNewProfile();
      }
    })
    .catch(() => {});
};

// --- 文件操作 ---
const updateFilePath = (key, path) => {
  editingForm.files[key] = path;
  ElMessage.info("文件已暂存");
};
const triggerFileSelect = async (key) => {
  const sourcePath = await window.api.openFile();
  if (sourcePath) updateFilePath(key, sourcePath);
};

// 🌟 新增：处理拖拽悬浮逻辑
const onDragOver = (event) => {
  event.preventDefault();
  event.stopPropagation();
  // 核心：强制告诉系统，这是一个“拷贝”操作，鼠标指针会从“禁止”变为“加号”或“链接”
  event.dataTransfer.dropEffect = "copy";
};

const handleDrop = (event, key) => {
  const file = event.dataTransfer?.files[0];
  if (!file) return;

  let filePath = "";
  if (window.api && window.api.getFilePath) {
    filePath = window.api.getFilePath(file);
  } else {
    filePath = file.path;
  }

  if (filePath) {
    updateFilePath(key, filePath);
  } else {
    ElMessage.warning("无法读取文件路径，请点击选择");
  }
};

// --- 保存操作 ---
const handleMainSave = async () => {
  const newName = targetName.value.trim();
  if (!newName) return ElMessage.warning("请输入方案名称");

  isSaving.value = true;
  const loadingInstance = ElLoading.service({
    target: ".detail-card",
    text: "本地文件入库中...",
  });

  try {
    const finalFiles = { ...editingForm.files };

    for (const key in finalFiles) {
      const sourcePath = finalFiles[key];

      if (
        sourcePath &&
        (sourcePath.includes(":") ||
          sourcePath.includes("/") ||
          sourcePath.includes("\\"))
      ) {
        const res = await window.api.importFile({
          profileName: newName,
          sourcePath,
        });

        if (res.success) {
          finalFiles[key] = res.fileName;
        } else {
          throw new Error(`[${labelMap[key]}] 导入失败: ${res.msg}`);
        }
      }
    }

    const profiles = JSON.parse(JSON.stringify(props.allProfiles));

    if (localSelectedName.value && localSelectedName.value !== newName) {
      delete profiles[localSelectedName.value];
    }

    profiles[newName] = { ...editingForm, files: finalFiles };

    emit("update-profiles", profiles);

    localSelectedName.value = newName;
    editingForm.files = finalFiles;

    ElMessage.success("保存成功");
  } catch (error) {
    ElMessage.error(error.message);
  } finally {
    isSaving.value = false;
    loadingInstance.close();
  }
};

// --- 🌟 修改点 4：新增极其丝滑的云端备份与恢复逻辑 ---

// 执行云端备份
// 执行云端备份
const handleCloudUpload = async () => {
  if (!props.userKey)
    return ElMessage.warning("请先在系统设置中填写并验证卡密");

  isCloudUploading.value = true;
  const loading = ElLoading.service({
    lock: true,
    text: "📦 正在将全部方案与物理文件打包同步至云端...",
    background: "rgba(0, 0, 0, 0.7)",
  });

  try {
    // 🌟 核心修复：用 JSON 转换解除 Vue 的 Proxy 代理，变成纯净的 JS 对象
    const cleanProfiles = JSON.parse(JSON.stringify(props.allProfiles));

    const res = await window.api.cloudSave({
      userKey: props.userKey,
      profiles: cleanProfiles,
    });

    if (res.status === "ok") {
      ElMessage.success(res.msg || "备份成功！数据已安全存入云端硬盘。");
    } else {
      ElMessage.error(res.msg);
    }
  } catch (error) {
    console.error("备份底层报错:", error); // 加个打印，以后遇到错能看到真实死因
    ElMessage.error("同步失败，请检查网络或控制台日志");
  } finally {
    isCloudUploading.value = false;
    loading.close();
  }
};

// 执行云端恢复
const handleCloudDownload = async () => {
  if (!props.userKey)
    return ElMessage.warning("请先在系统设置中填写并验证卡密");

  ElMessageBox.confirm(
    "⚠️ 从云端恢复将覆盖本地现有的所有方案与物理文件，此操作不可逆，确定继续吗？",
    "恢复高能预警",
    {
      type: "warning",
      confirmButtonText: "确定覆盖恢复",
      cancelButtonText: "取消",
    },
  )
    .then(async () => {
      isCloudDownloading.value = true;
      const loading = ElLoading.service({
        lock: true,
        text: "📥 正在从云端拉取主账号数据并解压，请勿关闭程序...",
        background: "rgba(0, 0, 0, 0.7)",
      });

      try {
        const res = await window.api.cloudGet(props.userKey);
        if (res.status === "ok") {
          // 直接触发外部数据更新机制
          emit("update-profiles", res.data);
          ElMessage.success("云端数据恢复成功！你的方案配置与文件已还原。");
          // 如果当前正好有打开的方案，重置一下视图
          initNewProfile();
        } else {
          ElMessage.error(res.msg);
        }
      } catch (error) {
        ElMessage.error("恢复失败，无法连接到云端服务器");
      } finally {
        isCloudDownloading.value = false;
        loading.close();
      }
    })
    .catch(() => {});
};

const openFolder = (name) => window.api.openProfileFolder(name);
// ✅ 替换为下面这段：
const openExternal = (path) => {
  if (!path) return;

  // 判断是否是绝对路径 (比如用户刚拖拽进来、还没点击保存的文件)
  if (path.includes(":") || path.includes("/") || path.includes("\\")) {
    window.api.openExternal(path);
  } else {
    // 🌟 已经是相对路径（存入库的文件），就把【方案名】和【文件名】打包发给主进程
    window.api.openExternal({
      profileName: localSelectedName.value,
      fileName: path,
    });
  }
};
</script>

<style scoped>
/* 原有的样式完全保持不变 */
.config-container {
  display: flex;
  height: 100%;
  background-color: #f0f2f5;
  gap: 1px;
  overflow: hidden;
}

.sidebar {
  width: 260px;
  background: #fff;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e6e6e6;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 15px;
  display: flex;
  align-items: center;
  border-bottom: 1px solid #f0f0f0;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 0;
}

.list-item {
  padding: 12px 15px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-left: 3px solid transparent;
}

.list-item:hover {
  background-color: #f5f7fa;
}

.list-item.active {
  background-color: #ecf5ff;
  border-left-color: #409eff;
}

.item-icon {
  margin-right: 10px;
  color: #909399;
  display: flex;
  align-items: center;
}
.list-item.active .item-icon {
  color: #409eff;
}

.item-content {
  flex: 1;
  overflow: hidden;
}

.item-title {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.list-item.active .item-title {
  color: #409eff;
  font-weight: bold;
}

.item-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.item-action {
  display: none;
  padding: 4px;
  color: #f56c6c;
}
.list-item:hover .item-action {
  display: block;
}

.empty-list {
  text-align: center;
  color: #c0c4cc;
  margin-top: 50px;
  font-size: 13px;
}

.sidebar-footer {
  padding: 10px;
  border-top: 1px solid #f0f0f0;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #fff;
  overflow: hidden;
}

.detail-card {
  height: 100%;
  border: none;
  display: flex;
  flex-direction: column;
}

.detail-card :deep(.el-card__header) {
  padding: 15px 25px;
  border-bottom: 1px solid #eee;
}

.detail-card :deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  padding: 20px 40px;
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  font-size: 16px;
  font-weight: bold;
  color: #303133;
}

.form-row {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}
.form-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.label-text {
  font-weight: bold;
  font-size: 13px;
  color: #606266;
}

.file-drop-row {
  margin-bottom: 20px;
}
.file-label {
  font-size: 13px;
  font-weight: bold;
  color: #606266;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-tag {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
}
.status-tag.unconfigured {
  background: #f4f4f5;
  color: #909399;
}
.status-tag.configured {
  background: #ecf5ff;
  color: #409eff;
}

.drop-zone {
  border: 2px dashed #dcdfe6;
  border-radius: 6px;
  height: 64px;
  display: flex;
  align-items: center;
  cursor: pointer;
  background-color: #fafafa;
  transition: all 0.3s;
  padding: 0 15px;
  justify-content: center;
}
.drop-zone:hover {
  border-color: #409eff;
  background-color: #f0f7ff;
}
.drop-zone.has-file {
  border-style: solid;
  border-color: #e4e7ed;
  background-color: #fff;
  justify-content: space-between;
}

.file-info {
  flex: 1;
  min-width: 0;
  margin-right: 10px;
}
.file-main {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #303133;
  font-weight: 500;
}
.file-sub {
  font-size: 12px;
  color: #909399;
  margin-left: 24px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.placeholder-info {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
}
.upload-icon {
  font-size: 20px;
}

.file-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.save-footer {
  margin-top: 30px;
  text-align: center;
}
.main-save-btn {
  width: 200px;
  font-weight: bold;
}
/* 🌟 新增：手动控制旋转动画，告别原生的跳动感 */
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
