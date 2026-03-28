import { ref } from "vue";
import { ElMessage, ElMessageBox, ElLoading } from "element-plus";

/**
 * 运行预设与易投服务器的 JSON 同步（与整包 zip 无关）
 * @param {() => unknown[]} getProfileSets
 * @param {() => string} getAccount 已 trim 的易投账号
 * @param {(list: unknown[]) => void} onUpdateProfileSets
 * @param {() => void} [onAfterPull] 拉取成功后回调（如清空当前选用的预设 id）
 */
export function useProfileSetsRemoteSync(
  getProfileSets,
  getAccount,
  onUpdateProfileSets,
  onAfterPull,
) {
  const isUploadingProfileSetsToCloud = ref(false);
  const isDownloadingProfileSetsFromCloud = ref(false);

  const uploadProfileSetsToCloud = async () => {
    const account = getAccount();
    if (!account) {
      return ElMessage.warning("请先在 [系统设置] 填写易投账号并点击「立即保存全局设置」");
    }
    if (!window.api?.saveProfileSetsRemote) return;

    const sets = getProfileSets() || [];
    if (!sets.length) {
      try {
        await ElMessageBox.confirm(
          "当前本地运行预设为空，上传将用空列表覆盖服务器上的预设（相当于清空云端）。是否继续？",
          "上传空列表到云端",
          { type: "warning", confirmButtonText: "清空云端", cancelButtonText: "取消" },
        );
      } catch {
        return;
      }
    }

    isUploadingProfileSetsToCloud.value = true;
    const loading = ElLoading.service({
      lock: true,
      text: "正在上传运行预设...",
      background: "rgba(0, 0, 0, 0.7)",
    });
    try {
      const res = await window.api.saveProfileSetsRemote({
        account,
        profileSets: JSON.parse(JSON.stringify(sets)),
      });
      if (res.status === "ok" || res.success === true) {
        ElMessage.success("运行预设已上传至服务器");
      } else {
        ElMessage.error(res.msg || res.message || "上传失败");
      }
    } catch {
      ElMessage.error("上传失败");
    } finally {
      loading.close();
      isUploadingProfileSetsToCloud.value = false;
    }
  };

  const downloadProfileSetsFromCloud = () => {
    const account = getAccount();
    if (!account) {
      return ElMessage.warning("请先在 [系统设置] 填写易投账号并点击「立即保存全局设置」");
    }
    if (!window.api?.getProfileSetsRemote) return;

    ElMessageBox.confirm(
      "将从服务器拉取该账号下的运行预设并覆盖本地列表（不影响方案配置与分组）。是否继续？",
      "拉取运行预设",
      { type: "warning", confirmButtonText: "拉取", cancelButtonText: "取消" },
    )
      .then(async () => {
        isDownloadingProfileSetsFromCloud.value = true;
        const loading = ElLoading.service({
          lock: true,
          text: "正在拉取运行预设...",
          background: "rgba(0, 0, 0, 0.7)",
        });
        try {
          const res = await window.api.getProfileSetsRemote(account);
          if (res.status !== "ok" || !Array.isArray(res.profileSets)) {
            ElMessage.error(res.msg || "拉取失败");
            return;
          }
          onUpdateProfileSets(res.profileSets);
          onAfterPull?.();
          ElMessage.success("已从云端同步运行预设");
        } catch {
          ElMessage.error("拉取失败");
        } finally {
          loading.close();
          isDownloadingProfileSetsFromCloud.value = false;
        }
      })
      .catch(() => {});
  };

  return {
    isUploadingProfileSetsToCloud,
    isDownloadingProfileSetsFromCloud,
    uploadProfileSetsToCloud,
    downloadProfileSetsFromCloud,
  };
}
