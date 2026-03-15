<template>
  <div class="card">
    <h3>🔑 授权与账号 (全局生效)</h3>
    <div class="row">
      <span class="label">授权卡密:</span>
      <input
        :value="settings.userKey"
        class="flex-1"
        placeholder="请输入授权激活码"
        @input="update('userKey', $event.target.value)"
      />
    </div>
    <div class="row mt-15 border-top">
      <span class="label">易投账号:</span>
      <input
        :value="settings.workingAccount"
        class="flex-1"
        placeholder="登录账号"
        @input="update('workingAccount', $event.target.value)"
      />
    </div>
    <div class="row">
      <span class="label">易投密码:</span>
      <input
        :value="settings.workingPassword"
        class="flex-1"
        placeholder="登录密码 (明文)"
        @input="update('workingPassword', $event.target.value)"
      />
    </div>
  </div>

  <div class="card">
    <h3>📊 任务参数控制</h3>

    <div class="row">
      <span class="label">账号匹配数:</span>
      <input
        :value="settings.accountMatchCount"
        type="number"
        min="1"
        style="width: 60px"
        @input="update('accountMatchCount', +$event.target.value)"
      />
      <span style="font-size: 12px; color: #999; margin-left: 10px"
        >(每个模板最多匹配的账号数量)</span
      >
    </div>

    <div class="row">
      <span class="label">素材榜单时间范围:</span>
      <el-select
        :model-value="settings.dateRange || ''"
        class="flex-1"
        placeholder="请选择时间范围"
        @update:model-value="update('dateRange', $event)"
      >
        <el-option label="无" value="" />
        <el-option label="今天" value="今天" />
        <el-option label="昨天" value="昨天" />
        <el-option label="近三天" value="近三天" />
        <el-option label="近七天" value="近七天" />
        <el-option label="近十五天" value="近十五天" />
        <el-option label="近一个月" value="近一个月" />
        <el-option label="本周" value="本周" />
        <el-option label="本月" value="本月" />
        <el-option label="上个月" value="上个月" />
      </el-select>
    </div>

    <div class="row">
      <span class="label">账号平铺:</span>
      <div class="radio-group">
        <label class="radio-item">
          <input
            type="radio"
            name="tiling"
            :checked="settings.isAccountFlat === true"
            @change="handleTilingChange(true)"
          />
          是
        </label>
        <label class="radio-item">
          <input
            type="radio"
            name="tiling"
            :checked="settings.isAccountFlat === false"
            @change="handleTilingChange(false)"
          />
          否
        </label>
      </div>
    </div>

    <div class="row">
      <span class="label">项目数:</span>
      <input
        :value="settings.projectNum"
        :disabled="settings.isAccountFlat"
        type="number"
        min="0"
        style="width: 60px"
        :class="{ 'input-disabled': settings.isAccountFlat }"
        @input="update('projectNum', +$event.target.value)"
      />
    </div>

    <div class="row">
      <span class="label">广告数:</span>
      <input
        :value="settings.adsNum"
        :disabled="settings.isAccountFlat"
        type="number"
        min="0"
        style="width: 60px"
        :class="{ 'input-disabled': settings.isAccountFlat }"
        @input="update('adsNum', +$event.target.value)"
      />
    </div>
  </div>

  <div class="footer-actions">
    <button v-if="isDev" class="btn-dev" @click="handleOpenDataDir">
      📁 打开 AppData 本地数据目录
    </button>

    <button class="btn-save-sys" @click="$emit('save-settings', settings)">
      💾 立即保存全局设置
    </button>
  </div>
</template>

<script setup>
import { ElMessage } from "element-plus";

const props = defineProps(["settings"]);
const emit = defineEmits(["update:settings", "save-settings"]);

// 🌟 核心判断：利用 Vite 的环境变量判断当前是否为开发模式
const isDev = import.meta.env.DEV;

/**
 * 🌟 打开本地数据存放目录
 */
const handleOpenDataDir = () => {
  if (window.api && window.api.openStorageDir) {
    window.api.openStorageDir();
  } else {
    ElMessage.error("未找到打开目录的方法，请检查 preload.js 配置");
  }
};

/**
 * 基础更新辅助函数
 */
const update = (key, value) => {
  const newSettings = { ...props.settings, [key]: value };
  emit("update:settings", newSettings);
};

/**
 * 处理账号平铺单选切换
 * @param {Boolean} isFlat 是否平铺
 */
const handleTilingChange = (isFlat) => {
  const updates = {
    isAccountFlat: isFlat,
  };

  if (isFlat) {
    // 选择“是”：数值清零
    updates.projectNum = 0;
    updates.adsNum = 0;
  } else {
    // 选择“否”：恢复默认值 1
    updates.projectNum = 1;
    updates.adsNum = 1;
  }

  const newSettings = { ...props.settings, ...updates };
  emit("update:settings", newSettings);
};
</script>

<style scoped>
.card {
  margin-bottom: 10px;
}

input,
select {
  outline: none;
  border: 1px solid #ddd;
  padding: 4px 8px;
  border-radius: 4px;
  transition: border-color 0.3s;
  background-color: #fff;
  font-family: inherit;
  font-size: 14px;
}

input:focus,
select:focus {
  border-color: #3498db;
}

select {
  cursor: pointer;
}

.radio-group {
  display: flex;
  gap: 20px;
  align-items: center;
}

.radio-item {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
}

.radio-item input[type="radio"] {
  margin-right: 6px;
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* 禁用状态样式 */
.input-disabled {
  background-color: #f5f5f5 !important;
  color: #999 !important;
  border-color: #dcdfe6 !important;
  cursor: not-allowed;
}

/* 布局辅助 */
.flex-1 {
  flex: 1;
}
.mt-15 {
  margin-top: 15px;
}
.border-top {
  border-top: 1px solid #eee;
  padding-top: 15px;
}

.label {
  display: inline-block;
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 110px;
  margin-right: 10px;
  text-align: right; /* 增加右对齐让文字看起来更整齐 */
}

/* 🌟 新增：底部按钮布局 */
.footer-actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 15px;
  margin-top: 20px;
}

/* 🌟 新增：开发测试专用按钮样式 */
.btn-dev {
  background-color: #f0f2f5;
  color: #606266;
  border: 1px dashed #c0c4cc;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.3s;
}

.btn-dev:hover {
  background-color: #e9e9eb;
  color: #333;
  border-color: #909399;
}
</style>
