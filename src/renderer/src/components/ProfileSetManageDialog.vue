<template>
  <el-dialog
    v-model="dialogVisible"
    :title="profileSetDialogTitle"
    width="560px"
    destroy-on-close
    class="profile-set-dialog"
  >
    <template v-if="profileSetPanel === 'list'">
      <div class="profile-set-toolbar">
        <div class="profile-set-toolbar-row">
          <el-button type="primary" size="small" @click="openCreate">
            新建预设
          </el-button>
          <div v-if="hasProfileSetsRemoteAccount" class="profile-set-toolbar-cloud">
            <el-button
              type="warning"
              plain
              size="small"
              :disabled="isUploadingProfileSetsToCloud"
              @click="uploadProfileSetsToCloud"
            >
              <el-icon v-if="isUploadingProfileSetsToCloud" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
              上传到云端
            </el-button>
            <el-button
              type="primary"
              plain
              size="small"
              :disabled="isDownloadingProfileSetsFromCloud"
              @click="downloadProfileSetsFromCloud"
            >
              <el-icon v-if="isDownloadingProfileSetsFromCloud" class="is-loading" style="margin-right: 4px;"><Loading /></el-icon>
              从云端拉取
            </el-button>
          </div>
        </div>
        <p v-if="hasProfileSetsRemoteAccount" class="profile-set-cloud-hint">
          在列表中删除或编辑后，若希望服务器与其它设备一致，请点击「上传到云端」（用当前列表整表覆盖云端）。「从云端拉取」会用服务器列表覆盖本地。
        </p>
        <p v-else class="profile-set-cloud-hint is-muted">
          在 [系统设置] 填写易投账号并保存全局设置后，可在此上传或拉取云端预设。
        </p>
      </div>
      <el-table
        v-if="profileSets.length > 0"
        :data="profileSets"
        border
        size="small"
        max-height="320"
        style="width: 100%"
      >
        <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
        <el-table-column label="方案数" width="88" align="center">
          <template #default="{ row }">
            {{ validProfilesInSet(row).length }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="140" align="center" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="openEdit(row)">
              编辑
            </el-button>
            <el-button type="danger" link size="small" @click="removeProfileSet(row.id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div v-else class="profile-set-empty">暂无运行预设。可点「新建预设」，或在上方选好运行方案后使用「保存当前为预设」。</div>
    </template>

    <template v-else>
      <div class="profile-set-form">
        <div class="form-line">
          <span class="form-label">名称</span>
          <el-input
            v-model="profileSetForm.name"
            maxlength="40"
            show-word-limit
            placeholder="为该运行预设起一个名字"
            clearable
          />
        </div>
        <div class="form-line form-line-col">
          <span class="form-label">包含方案</span>
          <el-select
            v-model="profileSetForm.profiles"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            clearable
            placeholder="搜索或在分组中选择 (支持多选)"
            style="width: 100%"
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
        </div>
      </div>
    </template>

    <template #footer>
      <template v-if="profileSetPanel === 'list'">
        <el-button type="primary" @click="dialogVisible = false">关闭</el-button>
      </template>
      <template v-else>
        <el-button @click="profileSetPanel = 'list'">返回列表</el-button>
        <el-button type="primary" @click="submitProfileSetForm">确定</el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup>
import { ref, reactive, computed } from "vue";
import { Loading } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useProfileSetsRemoteSync } from "../composables/useProfileSetsRemoteSync.js";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  allProfiles: Object,
  profileOrder: Array,
  profileSets: { type: Array, default: () => [] },
  workingAccount: { type: String, default: "" },
});

const emit = defineEmits([
  "update:modelValue",
  "update-profile-sets",
  "applied",
  "cleared-selected-preset",
  "remove-preset",
]);

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (v) => emit("update:modelValue", v),
});

/** list | edit */
const profileSetPanel = ref("list");
const editingSetId = ref(null);
const closeDialogAfterFormSave = ref(false);
const profileSetForm = reactive({
  id: "",
  name: "",
  profiles: [],
});

const profileSetDialogTitle = computed(() => {
  if (profileSetPanel.value === "list") return "管理运行预设";
  return editingSetId.value ? "编辑运行预设" : "新建运行预设";
});

const hasProfileSetsRemoteAccount = computed(() => !!(props.workingAccount || "").trim());

const {
  isUploadingProfileSetsToCloud,
  isDownloadingProfileSetsFromCloud,
  uploadProfileSetsToCloud,
  downloadProfileSetsFromCloud,
} = useProfileSetsRemoteSync(
  () => props.profileSets,
  () => (props.workingAccount || "").trim(),
  (list) => emit("update-profile-sets", list),
  () => emit("cleared-selected-preset"),
);

const genProfileSetId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `ps_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const validProfilesInSet = (row) => {
  const list = row?.profiles;
  if (!Array.isArray(list) || !props.allProfiles) return [];
  return list.filter((name) => props.allProfiles[name]);
};

const groupedProfilesForSelect = computed(() => {
  if (!props.allProfiles) return [];
  const orderedNames =
    Array.isArray(props.profileOrder) && props.profileOrder.length > 0
      ? props.profileOrder.filter((name) => props.allProfiles[name])
      : Object.keys(props.allProfiles);
  const names = [
    ...orderedNames,
    ...Object.keys(props.allProfiles).filter((name) => !orderedNames.includes(name)),
  ];

  const groupsMap = new Map();
  groupsMap.set("默认分组", []);

  names.forEach((name) => {
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

const resetProfileSetForm = () => {
  profileSetForm.id = "";
  profileSetForm.name = "";
  profileSetForm.profiles = [];
  editingSetId.value = null;
};

const openList = () => {
  profileSetPanel.value = "list";
  closeDialogAfterFormSave.value = false;
  emit("update:modelValue", true);
};

const openCreate = () => {
  resetProfileSetForm();
  profileSetForm.id = genProfileSetId();
  profileSetPanel.value = "edit";
  closeDialogAfterFormSave.value = false;
  emit("update:modelValue", true);
};

const openEdit = (row) => {
  editingSetId.value = row.id;
  profileSetForm.id = row.id;
  profileSetForm.name = row.name || "";
  profileSetForm.profiles = Array.isArray(row.profiles) ? [...row.profiles] : [];
  profileSetPanel.value = "edit";
  closeDialogAfterFormSave.value = false;
};

/** @param {string[]} profiles */
const openFromCurrent = (profiles) => {
  resetProfileSetForm();
  profileSetForm.id = genProfileSetId();
  profileSetForm.profiles = [...profiles];
  profileSetPanel.value = "edit";
  closeDialogAfterFormSave.value = true;
  emit("update:modelValue", true);
};

defineExpose({
  openList,
  openCreate,
  openEdit,
  openFromCurrent,
});

const submitProfileSetForm = () => {
  const name = (profileSetForm.name || "").trim();
  if (!name) return ElMessage.warning("请填写运行预设名称");
  const profiles = (profileSetForm.profiles || []).filter((p) => props.allProfiles?.[p]);
  if (profiles.length === 0) return ElMessage.warning("请至少选择一个仍存在的运行方案");

  const list = [...(props.profileSets || [])];
  let savedId = "";

  if (editingSetId.value) {
    const i = list.findIndex((s) => s.id === editingSetId.value);
    if (i >= 0) list[i] = { ...list[i], name, profiles };
    savedId = editingSetId.value;
  } else {
    savedId = profileSetForm.id || genProfileSetId();
    list.push({ id: savedId, name, profiles });
  }

  emit("update-profile-sets", list);
  ElMessage.success("运行预设已保存");

  if (closeDialogAfterFormSave.value) {
    emit("applied", { id: savedId, profiles });
    dialogVisible.value = false;
    closeDialogAfterFormSave.value = false;
    profileSetPanel.value = "list";
    resetProfileSetForm();
    return;
  }

  profileSetPanel.value = "list";
  resetProfileSetForm();
};

const removeProfileSet = (id) => {
  ElMessageBox.confirm("确定删除该运行预设？（不影响方案与分组）", "提示", {
    type: "warning",
    confirmButtonText: "删除",
    cancelButtonText: "取消",
  })
    .then(() => {
      const next = (props.profileSets || []).filter((s) => s.id !== id);
      emit("update-profile-sets", next);
      emit("remove-preset", id);
      ElMessage.success("已删除");
    })
    .catch(() => {});
};
</script>

<style scoped>
.profile-set-toolbar {
  margin-bottom: 12px;
}

.profile-set-toolbar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.profile-set-toolbar-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-left: auto;
}

.profile-set-cloud-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.55;
  margin: 10px 0 0;
}

.profile-set-cloud-hint.is-muted {
  color: #c0c4cc;
}

.profile-set-empty {
  color: #909399;
  font-size: 13px;
  text-align: center;
  padding: 24px 8px;
  line-height: 1.6;
}

.profile-set-form .form-line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}

.profile-set-form .form-line-col {
  flex-direction: column;
  align-items: stretch;
}

.profile-set-form .form-label {
  width: 72px;
  flex-shrink: 0;
  color: #606266;
  font-size: 14px;
}

.profile-set-form .form-line-col .form-label {
  width: auto;
}

.is-loading {
  animation: rotating 2s linear infinite;
  margin-right: 8px;
}

@keyframes rotating {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
