<template>
  <div class="config-container">
    <div class="sidebar">
      <div class="sidebar-header">
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <el-input
            v-model="searchKeyword"
            placeholder="搜索方案..."
            prefix-icon="Search"
            clearable
            size="default"
            style="flex: 1;"
          />
          <el-button
            type="success"
            :icon="Plus"
            circle
            size="small"
            style="margin-left: 8px; flex-shrink: 0;"
            title="新建方案"
            @click="initNewProfile"
          />
          <el-button
            type="warning"
            :icon="FolderAdd"
            circle
            size="small"
            style="margin-left: 8px; flex-shrink: 0;"
            title="新建空白分组"
            @click="createNewGroup"
          />
          <el-button
            :type="isBatchMode ? 'danger' : 'primary'"
            :icon="Operation"
            circle
            size="small"
            style="margin-left: 8px; flex-shrink: 0;"
            :title="isBatchMode ? '退出批量管理' : '批量管理分组'"
            @click="toggleBatchMode"
          />
        </div>
      </div>

      <div class="sidebar-list">
        <div v-for="{ groupProfiles, groupName } in groupedProfiles" :key="groupName" class="group-section">
          
          <div 
            class="group-title"
            @click="toggleGroup(groupName)"
            @dragover.prevent.stop="handleDragOverGroup"
            @dragleave.prevent.stop="handleDragLeaveGroup"
            @drop.prevent.stop="handleGroupDrop(groupName, $event)"
          >
            <el-icon class="folder-arrow" :class="{ 'is-collapsed': collapsedGroups.has(groupName) }">
              <CaretBottom />
            </el-icon>
            <el-icon style="margin-right: 6px;"><Folder /></el-icon>
            <span style="flex: 1;">{{ groupName }} ({{ groupProfiles.length }})</span>
            
            <div 
              v-if="groupName !== '默认分组'" 
              class="group-action" 
              @click.stop="openDeleteGroupDialog(groupName)"
              title="删除此分组"
            >
              <el-icon><Delete /></el-icon>
            </div>
          </div>

          <el-collapse-transition>
            <div v-show="!collapsedGroups.has(groupName)">
              <div
                v-for="name in groupProfiles"
                :key="name"
                class="list-item"
                :class="{ active: localSelectedName === name && !isBatchMode }"
                :draggable="!searchKeyword && !isBatchMode" 
                @dragstart="handleDragStart(name, $event)"
                @dragover.prevent.stop="handleDragOverItem"
                @dragleave.prevent.stop="handleDragLeaveItem"
                @drop.prevent.stop="handleDropItem(name, $event)"
                @click="handleItemClick(name)"
              >
                <el-checkbox
                  v-if="isBatchMode"
                  :model-value="batchSelected.has(name)"
                  @change="toggleSelection(name)"
                  @click.stop
                  style="margin-right: 8px;"
                />
                
                <div v-else class="item-icon">
                  <el-icon><Document /></el-icon>
                </div>

                <div class="item-content">
                  <div class="item-title" :title="name">{{ name }}</div>
                  <div class="item-desc">
                    {{ allProfiles[name]?.businessType || "未知类型" }}
                  </div>
                </div>
                <div v-if="!isBatchMode" class="item-action" @click.stop="deleteProfileName(name)">
                  <el-icon><Delete /></el-icon>
                </div>
              </div>
            </div>
          </el-collapse-transition>

        </div>

        <div v-if="groupedProfiles.length === 0" class="empty-list">
          <span v-if="searchKeyword">无匹配结果</span>
          <span v-else>暂无方案，请新建</span>
        </div>
      </div>

      <div v-if="isBatchMode" class="sidebar-footer batch-footer">
        <span class="batch-count">已选: {{ batchSelected.size }} 项</span>
        <div class="batch-btns">
          <el-button size="small" @click="toggleBatchMode">取消</el-button>
          <el-button 
            size="small" 
            type="primary" 
            :disabled="batchSelected.size === 0" 
            @click="openBatchMoveDialog"
          >
            更改分组
          </el-button>
        </div>
      </div>
      
      <div v-else class="sidebar-footer">
        <el-button-group style="width: 100%; display: flex">
          <el-button
            style="flex: 1; display: flex; justify-content: center; align-items: center;"
            size="small"
            :type="hasUnsyncedChanges ? 'warning' : 'default'"
            :plain="!hasUnsyncedChanges"
            :class="{ 'needs-backup-pulse': hasUnsyncedChanges && !isCloudUploading }"
            :disabled="isCloudUploading || isCloudDownloading"
            @click="handleCloudUpload"
          >
            <el-icon v-if="isCloudUploading" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
            <span v-else style="margin-right: 4px;">☁️</span>
            <span v-if="isCloudUploading">备份中...</span>
            <span v-else>{{ hasUnsyncedChanges ? "点我备份" : "云端备份" }}</span>
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
              <span class="label-text">所属分组 (可直接手填新分组)：</span>
              <el-select
                v-model="editingForm.group"
                filterable
                allow-create
                default-first-option
                placeholder="输入或选择分组"
                style="width: 100%"
              >
                <el-option
                  v-for="g in existingGroups"
                  :key="g"
                  :label="g"
                  :value="g"
                />
              </el-select>
            </div>
          </div>

          <div class="form-row">
             <div class="form-item">
              <span class="label-text">业务类型：</span>
              <el-select v-model="editingForm.businessType" style="width: 100%; max-width: 50%;">
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
              @dragover.prevent.stop="onDropZoneDragOver"
              @dragenter.prevent.stop="onDropZoneDragOver"
              @drop.prevent.stop="handleFileDrop($event, key)"
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

    <el-dialog v-model="showBatchMoveDialog" title="批量转移方案" width="400px" destroy-on-close>
      <div style="margin-bottom: 15px; font-size: 14px; color: #606266;">
        已选择 <b>{{ batchSelected.size }}</b> 个方案，请指定目标分组：
      </div>
      <el-select
        v-model="batchTargetGroup"
        filterable
        allow-create
        default-first-option
        placeholder="选择已有分组或输入新分组名称"
        style="width: 100%"
      >
        <el-option v-for="g in existingGroups" :key="g" :label="g" :value="g" />
      </el-select>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showBatchMoveDialog = false">取消</el-button>
          <el-button type="primary" @click="confirmBatchMove">
            确认转移
          </el-button>
        </span>
      </template>
    </el-dialog>

    <el-dialog v-model="showDeleteGroupDialog" title="删除分组高能预警" width="450px" destroy-on-close>
      <div style="margin-bottom: 20px; font-size: 14px; color: #606266;">
        您正在尝试删除分组 <b style="color: #409eff;">[{{ groupToDelete }}]</b>，请选择对该组内方案的处理方式：
      </div>
      
      <el-radio-group v-model="deleteGroupOption" class="delete-group-radio">
        <el-radio value="keep" class="radio-option">
          <div class="radio-title">仅删除分组标签</div>
          <div class="radio-desc">该分组将被移除，组内的方案将被安全地移至【默认分组】中</div>
        </el-radio>
        
        <el-radio value="delete_all" class="radio-option danger-option">
          <div class="radio-title">彻底删除分组及组内所有方案</div>
          <div class="radio-desc">将同步彻底销毁底层的物理文件目录，操作极其危险且不可恢复！</div>
        </el-radio>
      </el-radio-group>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="showDeleteGroupDialog = false">取消</el-button>
          <el-button 
            :type="deleteGroupOption === 'delete_all' ? 'danger' : 'primary'" 
            :loading="isDeletingGroup" 
            @click="confirmDeleteGroup"
          >
            确认执行
          </el-button>
        </span>
      </template>
    </el-dialog>

  </div>
</template>

<script>
// 🌟 放在外部，确保切换页签甚至组件销毁重建时，依然能记得上一次选了哪个组
let globalPersistentSnapshot = null;
let globalLastSavedGroup = "默认分组"; 
</script>

<script setup>
import { ref, reactive, computed, watch, onMounted, nextTick } from "vue";
import {
  Search,
  Plus,
  Delete,
  FolderOpened,
  Document,
  DocumentChecked,
  UploadFilled,
  Loading,
  Folder,
  FolderAdd,
  CaretBottom,
  Operation
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox, ElLoading } from "element-plus";

const props = defineProps(["allProfiles", "userKey"]);
const emit = defineEmits(["update-profiles"]);

// --- 基础状态 ---
const localSelectedName = ref("");
const targetName = ref("");
const searchKeyword = ref(""); 
const isSaving = ref(false);
const isCloudUploading = ref(false);
const isCloudDownloading = ref(false);
const collapsedGroups = ref(new Set());
const manualEmptyGroups = ref(new Set(["默认分组"]));

// 🌟 记录上一次保存成功的分组
const lastSavedGroup = ref(globalLastSavedGroup);

// 快照响应式引用
const cloudSnapshot = ref(globalPersistentSnapshot);

/**
 * 状态快照生成（用于比对是否需要备份）
 */
const getSnapshotString = (profilesObj, emptyGroupsSet) => {
  if (!profilesObj) return "";
  const profileList = Object.keys(profilesObj).sort().map(name => ({
    n: name,
    g: profilesObj[name].group || "默认分组",
    t: profilesObj[name].businessType,
    f: profilesObj[name].files
  }));
  const groups = Array.from(emptyGroupsSet).sort();
  return JSON.stringify({ p: profileList, g: groups });
};

/**
 * 计算属性：比对是否有未备份的更改
 */
const hasUnsyncedChanges = computed(() => {
  if (!cloudSnapshot.value) return false;
  const current = getSnapshotString(props.allProfiles, manualEmptyGroups.value);
  return current !== cloudSnapshot.value;
});

// 初始化快照
onMounted(() => {
  if (!cloudSnapshot.value && props.allProfiles && Object.keys(props.allProfiles).length > 0) {
    const initial = getSnapshotString(props.allProfiles, manualEmptyGroups.value);
    cloudSnapshot.value = initial;
    globalPersistentSnapshot = initial;
  }
});

// 监听数据变化，自动维护分组白名单
watch(
  () => props.allProfiles,
  (newProfiles) => {
    if (!newProfiles) return;
    const newSet = new Set(manualEmptyGroups.value);
    Object.values(newProfiles).forEach((p) => {
      if (p.group) newSet.add(p.group);
    });
    manualEmptyGroups.value = newSet;

    if (!cloudSnapshot.value && Object.keys(newProfiles).length > 0) {
      const initial = getSnapshotString(newProfiles, newSet);
      cloudSnapshot.value = initial;
      globalPersistentSnapshot = initial;
    }
  },
  { immediate: true, deep: true }
);

// --- 备份与恢复 ---
const handleCloudUpload = async () => {
  if (!props.userKey) return ElMessage.warning("请先在系统设置中填写并验证卡密");
  isCloudUploading.value = true;
  const loading = ElLoading.service({ lock: true, text: "📦 同步中...", background: "rgba(0, 0, 0, 0.7)" });
  try {
    const cleanProfiles = JSON.parse(JSON.stringify(props.allProfiles));
    const res = await window.api.cloudSave({ userKey: props.userKey, profiles: cleanProfiles });
    if (res.status === "ok") {
      ElMessage.success("备份成功！");
      const newSnapshot = getSnapshotString(props.allProfiles, manualEmptyGroups.value);
      cloudSnapshot.value = newSnapshot;
      globalPersistentSnapshot = newSnapshot;
    } else { ElMessage.error(res.msg); }
  } catch (error) { ElMessage.error("同步失败"); } finally { isCloudUploading.value = false; loading.close(); }
};

const handleCloudDownload = async () => {
  if (!props.userKey) return ElMessage.warning("请先在系统设置中填写并验证卡密");
  ElMessageBox.confirm("⚠️ 覆盖本地现有方案？", "预警", { type: "warning" }).then(async () => {
    isCloudDownloading.value = true;
    const loading = ElLoading.service({ lock: true, text: "📥 恢复中...", background: "rgba(0, 0, 0, 0.7)" });
    try {
      const res = await window.api.cloudGet(props.userKey);
      if (res.status === "ok") {
        manualEmptyGroups.value = new Set(["默认分组"]);
        emit("update-profiles", res.data);
        initNewProfile();
        nextTick(() => {
          const s = getSnapshotString(res.data, manualEmptyGroups.value);
          cloudSnapshot.value = s; globalPersistentSnapshot = s;
        });
      } else { ElMessage.error(res.msg); }
    } catch (e) { ElMessage.error("恢复失败"); } finally { isCloudDownloading.value = false; loading.close(); }
  }).catch(() => {});
};

// --- 分组与方案管理 ---
const existingGroups = computed(() => {
  const groups = new Set(manualEmptyGroups.value);
  Object.values(props.allProfiles).forEach(p => { if (p.group) groups.add(p.group); });
  const arr = Array.from(groups).filter(g => g !== "默认分组");
  return ["默认分组", ...arr];
});

const groupedProfiles = computed(() => {
  const keys = Object.keys(props.allProfiles);
  let filteredKeys = keys;
  if (searchKeyword.value) filteredKeys = keys.filter(n => n.toLowerCase().includes(searchKeyword.value.toLowerCase()));
  const rawGroups = new Map();
  if (!searchKeyword.value) manualEmptyGroups.value.forEach(g => rawGroups.set(g, []));
  filteredKeys.forEach(name => {
    const gName = props.allProfiles[name]?.group || "默认分组";
    if (!rawGroups.has(gName)) rawGroups.set(gName, []);
    rawGroups.get(gName).push(name);
  });
  const finalArray = [];
  if (rawGroups.has("默认分组") || !searchKeyword.value) {
    finalArray.push({ groupName: "默认分组", groupProfiles: rawGroups.get("默认分组") || [] });
  }
  for (const [gName, pList] of rawGroups.entries()) {
    if (gName !== "默认分组") finalArray.push({ groupName: gName, groupProfiles: pList });
  }
  return finalArray;
});

const isNewMode = computed(() => !localSelectedName.value || !props.allProfiles[localSelectedName.value]);
const labelMap = { TEMPLATE: "任务模板", ACCOUNTS: "账号列表" };
const editingForm = reactive({ group: "默认分组", businessType: "端原生-付费短剧", files: { TEMPLATE: "", ACCOUNTS: "" } });

// 🌟 修改点 1：初始化新方案时，默认使用上一次成功保存的分组
const initNewProfile = () => { 
  localSelectedName.value = ""; 
  targetName.value = ""; 
  editingForm.group = lastSavedGroup.value; // 👈 这里改用记录的变量
  editingForm.businessType = "端原生-付费短剧"; 
  editingForm.files = { TEMPLATE: "", ACCOUNTS: "" }; 
};

const createNewGroup = () => {
  ElMessageBox.prompt('请输入新分组名称', '新建分组', { confirmButtonText: '确定', cancelButtonText: '取消', inputPattern: /\S+/, inputErrorMessage: '不可为空' })
    .then(({ value }) => {
      const g = value.trim();
      if (existingGroups.value.includes(g)) return ElMessage.warning('分组已存在');
      manualEmptyGroups.value.add(g);
      ElMessage.success(`分组 [${g}] 已创建`);
    }).catch(() => {});
};

const openDeleteGroupDialog = (groupName) => { groupToDelete.value = groupName; deleteGroupOption.value = "keep"; showDeleteGroupDialog.value = true; };
const isDeletingGroup = ref(false);
const showDeleteGroupDialog = ref(false);
const groupToDelete = ref("");
const deleteGroupOption = ref("keep");

const confirmDeleteGroup = async () => {
  const gName = groupToDelete.value;
  const opt = deleteGroupOption.value;
  isDeletingGroup.value = true;
  try {
    const profiles = JSON.parse(JSON.stringify(props.allProfiles));
    let changed = false;
    if (opt === "keep") {
      Object.keys(profiles).forEach(n => { if (profiles[n].group === gName) { profiles[n].group = "默认分组"; changed = true; } });
      if (editingForm.group === gName) editingForm.group = "默认分组";
    } else {
      const toDel = Object.keys(profiles).filter(n => profiles[n].group === gName);
      for (const n of toDel) {
        await window.api.deleteProfileFolder(n);
        delete profiles[n];
        changed = true;
        if (localSelectedName.value === n) initNewProfile();
      }
    }
    manualEmptyGroups.value.delete(gName);
    if (changed) emit("update-profiles", profiles);
    showDeleteGroupDialog.value = false;
    ElMessage.success("分组处理完毕");
  } catch (e) { ElMessage.error(e.message); } finally { isDeletingGroup.value = false; }
};

// --- 批量管理 ---
const isBatchMode = ref(false);
const batchSelected = ref(new Set());
const showBatchMoveDialog = ref(false);
const batchTargetGroup = ref("");
const toggleBatchMode = () => { isBatchMode.value = !isBatchMode.value; if (!isBatchMode.value) batchSelected.value = new Set(); };
const toggleSelection = (n) => {
  const s = new Set(batchSelected.value);
  if (s.has(n)) s.delete(n); else s.add(n);
  batchSelected.value = s;
};
const openBatchMoveDialog = () => { batchTargetGroup.value = ""; showBatchMoveDialog.value = true; };
const confirmBatchMove = () => {
  if (!batchTargetGroup.value) return ElMessage.warning("请指定目标");
  const p = JSON.parse(JSON.stringify(props.allProfiles));
  batchSelected.value.forEach(n => { if (p[n]) p[n].group = batchTargetGroup.value; });
  manualEmptyGroups.value.add(batchTargetGroup.value);
  emit("update-profiles", p);
  if (batchSelected.value.has(localSelectedName.value)) editingForm.group = batchTargetGroup.value;
  isBatchMode.value = false;
  showBatchMoveDialog.value = false;
};

// --- 基础交互与拖拽 ---
const handleItemClick = (n) => { if (isBatchMode.value) toggleSelection(n); else selectProfile(n); };
const selectProfile = (n) => {
  if (props.allProfiles[n]) {
    localSelectedName.value = n; targetName.value = n;
    const p = props.allProfiles[n];
    editingForm.group = p.group || "默认分组";
    editingForm.businessType = p.businessType;
    editingForm.files = { ...p.files };
  }
};

const deleteProfileName = (n) => {
  ElMessageBox.confirm(`确定删除方案 [${n}] 吗？`, "警告", { type: "warning" }).then(async () => {
    await window.api.deleteProfileFolder(n);
    const p = { ...props.allProfiles };
    delete p[n];
    emit("update-profiles", p);
    if (localSelectedName.value === n) initNewProfile();
  }).catch(() => {});
};

let draggingProfileName = null;
const handleDragStart = (n, e) => { draggingProfileName = n; e.dataTransfer.effectAllowed = "move"; setTimeout(() => { e.target.style.opacity = "0.5"; }, 0); };
const handleDragOverItem = (e) => { e.dataTransfer.dropEffect = "move"; e.currentTarget.classList.add("drag-over-item"); };
const handleDragLeaveItem = (e) => e.currentTarget.classList.remove("drag-over-item");
const handleDropItem = (targetN, e) => {
  e.currentTarget.classList.remove("drag-over-item");
  if (!draggingProfileName || draggingProfileName === targetN) return;
  const p = JSON.parse(JSON.stringify(props.allProfiles));
  p[draggingProfileName].group = p[targetN].group || "默认分组";
  const keys = Object.keys(p);
  const fromIdx = keys.indexOf(draggingProfileName);
  keys.splice(fromIdx, 1);
  const toIdx = keys.indexOf(targetN);
  keys.splice(toIdx, 0, draggingProfileName);
  const newP = {}; keys.forEach(k => newP[k] = p[k]);
  emit("update-profiles", newP);
  draggingProfileName = null;
};
const handleDragOverGroup = (e) => { e.dataTransfer.dropEffect = "move"; e.currentTarget.classList.add("drag-over-group"); };
const handleDragLeaveGroup = (e) => e.currentTarget.classList.remove("drag-over-group");
const handleGroupDrop = (gName, e) => {
  e.currentTarget.classList.remove("drag-over-group");
  if (!draggingProfileName) return;
  const p = JSON.parse(JSON.stringify(props.allProfiles));
  p[draggingProfileName].group = gName;
  emit("update-profiles", p);
  if (collapsedGroups.value.has(gName)) { const s = new Set(collapsedGroups.value); s.delete(gName); collapsedGroups.value = s; }
  draggingProfileName = null;
};
const toggleGroup = (g) => { const s = new Set(collapsedGroups.value); if (s.has(g)) s.delete(g); else s.add(g); collapsedGroups.value = s; };

// --- 文件处理与保存 ---
const getFileName = (path) => (path ? path.split(/[\\/]/).pop() : "");
const openFolder = (n) => window.api.openProfileFolder(n);
const triggerFileSelect = async (k) => { const s = await window.api.openFile(); if (s) editingForm.files[k] = s; };
const onDropZoneDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
const handleFileDrop = (e, k) => {
  const f = e.dataTransfer?.files[0];
  if (f) editingForm.files[k] = window.api?.getFilePath ? window.api.getFilePath(f) : f.path;
};

const handleMainSave = async () => {
  const nName = targetName.value.trim();
  if (!nName) return ElMessage.warning("请输入名称");
  isSaving.value = true;
  const loading = ElLoading.service({ target: ".detail-card", text: "保存中..." });
  try {
    const finalFiles = { ...editingForm.files };
    for (const key in finalFiles) {
      const src = finalFiles[key];
      if (src && (src.includes(":") || src.includes("/"))) {
        const res = await window.api.importFile({ profileName: nName, sourcePath: src });
        if (res.success) finalFiles[key] = res.fileName; else throw new Error(res.msg);
      }
    }
    const p = JSON.parse(JSON.stringify(props.allProfiles));
    if (localSelectedName.value && localSelectedName.value !== nName) delete p[localSelectedName.value];
    p[nName] = { ...editingForm, files: finalFiles };
    emit("update-profiles", p);
    
    // 🌟 修改点 2：保存成功后，更新“上一次保存分组”的变量
    lastSavedGroup.value = editingForm.group;
    globalLastSavedGroup = editingForm.group; // 写入持久变量

    localSelectedName.value = nName;
    editingForm.files = finalFiles;
    ElMessage.success("保存成功");
  } catch (e) { ElMessage.error(e.message); } finally { isSaving.value = false; loading.close(); }
};

const openExternal = (p) => {
  if (!p) return;
  if (p.includes(":") || p.includes("/")) window.api.openExternal(p);
  else window.api.openExternal({ profileName: localSelectedName.value, fileName: p });
};
</script>

<style scoped>
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
  flex-direction: column; 
  border-bottom: 1px solid #f0f0f0;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0; 
}

.group-title {
  padding: 8px 10px;
  font-size: 12px;
  color: #606266;
  background: #f4f4f5;
  font-weight: bold;
  position: sticky;
  top: 0;
  z-index: 10;
  border-bottom: 1px solid #ebeef5;
  border-top: 1px solid #ebeef5;
  display: flex;
  align-items: center;
  transition: background-color 0.2s;
  cursor: pointer;
  user-select: none;
}
.group-title:hover {
  background: #e9e9eb;
}
.drag-over-group {
  background-color: #e6f1fc !important;
  color: #409eff;
}

.group-action {
  opacity: 0;
  pointer-events: none;
  padding: 2px 6px;
  color: #f56c6c;
  border-radius: 4px;
  transition: opacity 0.2s ease;
}
.group-action:hover {
  background: #fef0f0;
}
.group-title:hover .group-action {
  opacity: 1;
  pointer-events: auto;
}

.folder-arrow {
  margin-right: 4px;
  transition: transform 0.3s ease;
}
.folder-arrow.is-collapsed {
  transform: rotate(-90deg);
}

.list-item {
  padding: 12px 10px;
  display: flex;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-left: 3px solid transparent;
}

.drag-over-item {
  border-top: 2px solid #409eff !important;
  background-color: #f0f7ff;
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
  opacity: 0;
  pointer-events: none;
  padding: 4px;
  color: #f56c6c;
  transition: opacity 0.2s ease;
}
.list-item:hover .item-action {
  opacity: 1;
  pointer-events: auto;
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

.batch-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #ecf5ff;
  border-top: 1px solid #c6e2ff;
}
.batch-count {
  font-size: 13px;
  color: #409eff;
  font-weight: bold;
}
.batch-btns {
  display: flex;
  gap: 5px;
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
  padding: 20px 30px;
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

.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.delete-group-radio {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
}
.radio-option {
  width: 100%;
  margin-right: 0 !important;
  padding: 12px 15px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  height: auto;
  box-sizing: border-box;
  margin-bottom: 12px;
  transition: all 0.3s;
}
.radio-option:last-child {
  margin-bottom: 0;
}
.radio-option.is-checked {
  border-color: #409eff;
  background-color: #ecf5ff;
}
.danger-option.is-checked {
  border-color: #f56c6c !important;
  background-color: #fef0f0 !important;
}

.radio-option :deep(.el-radio__label) {
  white-space: normal;
  display: inline-block;
  vertical-align: top;
  width: calc(100% - 24px); 
}
.radio-title {
  font-weight: bold;
  color: #303133;
}
.danger-option .radio-title {
  color: #f56c6c;
}
.radio-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 6px;
  line-height: 1.4;
}

.needs-backup-pulse {
  animation: pulse-warning 2s infinite;
  color: #fff !important;
  background-color: #e6a23c !important;
  border-color: #e6a23c !important;
  z-index: 1; 
}

@keyframes pulse-warning {
  0% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.7);
  }
  70% {
    box-shadow: 0 0 0 6px rgba(230, 162, 60, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(230, 162, 60, 0);
  }
}
</style>