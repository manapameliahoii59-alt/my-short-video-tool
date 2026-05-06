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
      <span style="width: 100px; font-weight: bold; color: #409eff; flex-shrink: 0">
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

      <el-button type="success" link @click="downloadTemplate"> [下载模板] </el-button>
      <el-button type="primary" link @click="pickGlobalDrama"> [更换剧单] </el-button>
      <el-button v-if="globalDramaList" type="danger" link @click="clearGlobalDrama"> [清除] </el-button>
    </div>

    <div class="card-header-actions profile-select-section">
      <div class="row-flex profile-set-row">
        <span style="width: 100px; font-weight: bold; flex-shrink: 0">
          运行预设：
        </span>
        <el-select
          v-model="selectedProfileSetId"
          clearable
          filterable
          placeholder="选用已保存的一批运行方案（可跨分组）"
          style="flex: 1"
          @change="onProfileSetSelectChange"
        >
          <el-option
            v-for="item in profileSets"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          >
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
              <span>{{ item.name }}</span>
              <span style="color: #909399; font-size: 12px;">
                {{ validProfilesInSet(item).length }} 个方案
              </span>
            </div>
          </el-option>
        </el-select>
        <el-button type="primary" link @click="openProfileSetDialog('list')">
          [管理预设]
        </el-button>
        <el-button
          type="success"
          link
          :disabled="selectedProfiles.length === 0"
          @click="openProfileSetDialog('from-current')"
        >
          [保存当前为预设]
        </el-button>
        <el-button
          type="warning"
          link
          :disabled="isUploadingProfileSetsToCloud"
          @click="uploadProfileSetsToCloud"
        >
          <el-icon v-if="isUploadingProfileSetsToCloud" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
          [上传预设]
        </el-button>
        <el-button
          type="primary"
          link
          :disabled="isDownloadingProfileSetsFromCloud"
          @click="downloadProfileSetsFromCloud"
        >
          <el-icon v-if="isDownloadingProfileSetsFromCloud" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
          [从云端拉取预设]
        </el-button>
      </div>


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
        <el-dropdown
          trigger="click"
          :disabled="!hasAnyGroupProfiles"
          @command="addGroupProfilesToSelection"
        >
          <el-button type="primary" link style="margin-left: 4px;">
            [按分组追加] <el-icon class="dropdown-caret"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="g in groupedProfilesForSelect"
                :key="g.groupName"
                :command="g.groupName"
                :disabled="!g.options.length"
              >
                {{ g.groupName }}（{{ g.options.length }}）
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
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

    <div class="detail-panel">
      <div class="form-row action-row">
        <span class="label-text">运行动作：</span>
        <el-radio-group v-model="form.action">
          <el-radio value="publish" size="large">
            <span style="color: #f56c6c; font-weight: bold">正式发布</span>
          </el-radio>
          <el-radio value="publishBeta" size="large">正式发布(Beta版)</el-radio>
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

      <el-button type="info" size="large" :icon="Delete" @click="$emit('clear-logs')">
        清空日志
      </el-button>
    </div>

    <div id="log-window" ref="logRef">
      <div v-for="(log, i) in logs" :key="i" class="log-line" v-html="log"></div>
      <div v-if="logs.length === 0" class="log-empty">⏳ 等待指令启动...</div>
    </div>

    <ProfileSetManageDialog
      ref="profileSetManageRef"
      v-model="profileSetDialogVisible"
      :all-profiles="allProfiles"
      :profile-order="profileOrder"
      :profile-sets="profileSets"
      :working-account="workingAccount"
      @update-profile-sets="(v) => emit('update-profile-sets', v)"
      @applied="onProfileSetDialogApplied"
      @cleared-selected-preset="selectedProfileSetId = ''"
      @remove-preset="onProfileSetRemoved"
    />
  </div>
</template>

<script setup>
import { ref, reactive, watch, nextTick, computed } from "vue";
import {
  VideoPlay,
  Delete,
  Document,
  DocumentChecked,
  Loading,
  ArrowDown,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
defineOptions({
  name: 'RunTab'
})
import ProfileSetManageDialog from "./ProfileSetManageDialog.vue";
import { useProfileSetsRemoteSync } from "../composables/useProfileSetsRemoteSync.js";

const props = defineProps({
  allProfiles: Object,
  profileOrder: Array,
  logs: Array,
  globalDramaList: String,
  isRunning: Boolean,
  profileSets: { type: Array, default: () => [] },
  /** 系统设置中的易投账号，用于方案集云端同步 */
  workingAccount: { type: String, default: "" },
});
const emit = defineEmits(["run-task", "clear-logs", "update-global-drama", "update-profile-sets"]);

const isStopping = ref(false);
const profileSetManageRef = ref(null);

const {
  isUploadingProfileSetsToCloud,
  isDownloadingProfileSetsFromCloud,
  uploadProfileSetsToCloud,
  downloadProfileSetsFromCloud,
} = useProfileSetsRemoteSync(
  () => props.profileSets,
  () => (props.workingAccount || "").trim(),
  (list) => emit("update-profile-sets", list),
  () => {
    selectedProfileSetId.value = "";
  },
);
const selectedProfiles = ref([]);
const logRef = ref(null);
const isDragging = ref(false);

const form = reactive({ action: "publishBeta" });

const selectedProfileSetId = ref("");
const applyingProfileSet = ref(false);
const profileSetDialogVisible = ref(false);

const validProfilesInSet = (row) => {
  const list = row?.profiles;
  if (!Array.isArray(list) || !props.allProfiles) return [];
  return list.filter((name) => props.allProfiles[name]);
};

const openProfileSetDialog = (mode, row) => {
  const dlg = profileSetManageRef.value;
  if (!dlg) return;
  if (mode === "list") dlg.openList();
  else if (mode === "create") dlg.openCreate();
  else if (mode === "edit" && row) dlg.openEdit(row);
  else if (mode === "from-current") dlg.openFromCurrent(selectedProfiles.value);
};

const onProfileSetDialogApplied = ({ id, profiles }) => {
  selectedProfileSetId.value = id;
  applyingProfileSet.value = true;
  selectedProfiles.value = [...profiles];
  nextTick(() => {
    applyingProfileSet.value = false;
  });
};

const onProfileSetRemoved = (id) => {
  if (selectedProfileSetId.value === id) selectedProfileSetId.value = "";
};

const onProfileSetSelectChange = (id) => {
  if (!id) return;
  const item = (props.profileSets || []).find((s) => s.id === id);
  if (!item) return;
  const profiles = validProfilesInSet(item);
  if (profiles.length === 0) {
    ElMessage.warning("该预设内没有当前仍存在的方案，请在「管理预设」中重新编辑");
    return;
  }
  applyingProfileSet.value = true;
  selectedProfiles.value = profiles;
  nextTick(() => {
    applyingProfileSet.value = false;
  });
};

watch(
  selectedProfiles,
  () => {
    if (applyingProfileSet.value) return;
    selectedProfileSetId.value = "";
  },
  { deep: true },
);

watch(
  () => props.profileSets,
  () => {
    const ids = new Set((props.profileSets || []).map((s) => s.id));
    if (selectedProfileSetId.value && !ids.has(selectedProfileSetId.value)) {
      selectedProfileSetId.value = "";
    }
  },
  { deep: true },
);

/** 方案管理删除/重载方案后，运行区多选里去掉已不存在的名字，避免主进程报错 */
watch(
  () => props.allProfiles && Object.keys(props.allProfiles).sort().join("\0"),
  () => {
    if (applyingProfileSet.value || !props.allProfiles) return;
    if (!selectedProfiles.value.length) return;
    const next = selectedProfiles.value.filter((n) => props.allProfiles[n]);
    if (next.length === selectedProfiles.value.length) return;
    applyingProfileSet.value = true;
    selectedProfiles.value = next;
    nextTick(() => {
      applyingProfileSet.value = false;
    });
  },
);

// 将所有方案按分组重新整理，供下拉框使用
const groupedProfilesForSelect = computed(() => {
  if (!props.allProfiles) return [];
  const orderedNames = Array.isArray(props.profileOrder) && props.profileOrder.length > 0
    ? props.profileOrder.filter(name => props.allProfiles[name])
    : Object.keys(props.allProfiles);
  const names = [
    ...orderedNames,
    ...Object.keys(props.allProfiles).filter(name => !orderedNames.includes(name)),
  ];
  
  const groupsMap = new Map();
  // 保证“默认分组”排第一
  groupsMap.set("默认分组", []);

  names.forEach(name => {
    const groupName = props.allProfiles[name].group || "默认分组";
    if (!groupsMap.has(groupName)) {
      groupsMap.set(groupName, []);
    }
    groupsMap.get(groupName).push(name);
  });

  const result = [];
  for (const [gName, pList] of groupsMap.entries()) {
    if (pList.length > 0 || gName === "默认分组") {
      result.push({
        groupName: gName,
        label: `📂 ${gName}`,
        options: pList,
      });
    }
  }
  return result;
});

const hasAnyGroupProfiles = computed(() =>
  groupedProfilesForSelect.value.some((g) => g.options.length > 0),
);

const addGroupProfilesToSelection = (groupName) => {
  const group = groupedProfilesForSelect.value.find((g) => g.groupName === groupName);
  if (!group?.options?.length) return;
  applyingProfileSet.value = true;
  const seen = new Set(selectedProfiles.value);
  const next = [...selectedProfiles.value];
  for (const n of group.options) {
    if (!seen.has(n)) {
      seen.add(n);
      next.push(n);
    }
  }
  selectedProfiles.value = next;
  nextTick(() => {
    applyingProfileSet.value = false;
  });
};

const getFileName = (path) => (path ? path.split(/[\\/]/).pop() : "");

const removeSelectedProfile = (name) => {
  selectedProfiles.value = selectedProfiles.value.filter((p) => p !== name);
};

const openProfileFolder = (name) => {
  if (window.api && window.api.openProfileFolder) {
    window.api.openProfileFolder(name);
  }
};

watch(() => props.isRunning, (newVal) => {
  if (newVal === false) isStopping.value = false;
});

const cancelTask = () => {
  if (window.api && window.api.stopTask) {
    isStopping.value = true;
    window.api.stopTask();
  }
};

const processImportFile = async (sourcePath) => {
  if (!sourcePath) return;
  const isExcel = sourcePath.toLowerCase().match(/\.(xlsx|xls|csv)$/);
  if (!isExcel) return ElMessage.error("请上传 Excel 或 CSV 格式的文件");

  const res = await window.api.importFile({ profileName: "global_assets", sourcePath });
  if (res.success) {
    emit("update-global-drama", res.fileName);
    ElMessage.success("全局剧单已更新");
  } else {
    ElMessage.error("文件导入失败: " + res.msg);
  }
};

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
  const filePath = window.api?.getFilePath ? window.api.getFilePath(file) : file.path;
  if (filePath) processImportFile(filePath);
  else ElMessage.warning("无法读取文件路径");
};

const pickGlobalDrama = async () => {
  const sourcePath = await window.api.openFile();
  if (sourcePath) processImportFile(sourcePath);
};

const clearGlobalDrama = () => {
  emit("update-global-drama", "");
  ElMessage.info("已清空全局剧单配置");
};

const handleOpenGlobalDrama = () => {
  if (props.globalDramaList) {
    window.api.openExternal({ profileName: "global_assets", fileName: props.globalDramaList });
  }
};

const start = () => {
  if (!props.globalDramaList) return ElMessage.warning("请先选择全局剧单文件");
  if (selectedProfiles.value.length === 0) return ElMessage.warning("请至少选择一个运行方案");

  emit("run-task", {
    selectedProfiles: selectedProfiles.value,
    globalDramaList: props.globalDramaList,
    action: form.action,
  });
};

const downloadTemplate = async () => {
  if (window.api?.downloadDramaTemplate) {
    const res = await window.api.downloadDramaTemplate();
    if (res.success) ElMessage.success(`模板已保存至：${res.filePath}`);
    else if (res.msg !== "取消下载") ElMessage.error(`下载失败: ${res.msg}`);
  }
};

const selectAllProfiles = () => {
  if (props.allProfiles) {
    const orderedNames = Array.isArray(props.profileOrder) && props.profileOrder.length > 0
      ? props.profileOrder.filter(name => props.allProfiles[name])
      : Object.keys(props.allProfiles);
    selectedProfiles.value = [
      ...orderedNames,
      ...Object.keys(props.allProfiles).filter(name => !orderedNames.includes(name)),
    ];
  }
};

watch(() => props.logs, () => {
  nextTick(() => {
    if (logRef.value) logRef.value.scrollTop = logRef.value.scrollHeight;
  });
}, { deep: true });
</script>

<style scoped>
.run-tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
}

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

.profile-set-row {
  margin-bottom: 10px;
}


.dropdown-caret {
  font-size: 11px;
  margin-left: 2px;
  vertical-align: middle;
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

.selected-tags-box::-webkit-scrollbar { width: 6px; }
.selected-tags-box::-webkit-scrollbar-thumb { background-color: #dcdfe6; border-radius: 4px; }

.detail-panel {
  background: #fff;
  padding: 10px 20px;
  border-radius: 8px;
  border: 1px solid #ebeef5;
  flex-shrink: 0;
  margin-bottom: 15px;
}

.form-row { display: flex; align-items: center; font-size: 14px; }
.label-text { width: 100px; color: #606266; font-weight: bold; }
.path-link-wrapper { flex: 1; overflow: hidden; margin-right: 10px; }

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

.file-none-text { color: #909399; display: flex; align-items: center; gap: 5px; }
.actions { display: flex; gap: 15px; margin-bottom: 10px; flex-shrink: 0; }
.btn-start { flex: 3; font-weight: bold; min-width: 240px; display: flex; align-items: center; justify-content: center; }

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

.log-line { margin-bottom: 4px; word-break: break-all; }
.log-empty { color: #666; text-align: center; margin-top: 20px; }

:deep(.el-radio-group) { display: flex; align-items: center; }
.btn-cancel.is-disabled { opacity: 0.8; background-color: #fab6b6 !important; border-color: #fab6b6 !important; color: #fff !important; }
.is-loading { animation: rotating 2s linear infinite; margin-right: 8px; }

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>