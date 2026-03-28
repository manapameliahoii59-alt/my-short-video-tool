import path from "path";
import { rootDir } from "./utils.js"; // 保留引入，以备不时之需

const CONFIG = {
  KEY_CONFIG: { userKey: "" }, // 内部可以留空作为默认值
  WORKING_CONFIG: { account: "", password: "" }, // 🌟 核心修改 1：acount 必须改为 account
  FILES: {
    // 🌟 核心修改 2：去掉 path.join(root, ...)，改为留空。
    // 因为现在的架构是：用户在界面选文件 -> 存入对应方案的文件夹 -> 运行时动态拼接路径
    DRAMA_LIST: "",
    TEMPLATE: "",
    ACCOUNTS: "",
    BUSINESS_TYPE: "端原生-付费短剧",
    PAGE_NUM: 20,
    PROJECT_NUM: 1,
    ADS_NUM: 1,
    isAccountFlat: false,
    dateRange: "",
  },
  DRAMA_FIELD_NAMES: {
    targetDramaName: "产品名称",
    copyright: "版权",
    testDramaTitle: "素材名称",
    dramaCount: "素材个数",
    specifyMaterials: "指定素材",
    proNumNew: "新建项目数",
    adsNumNew: "新建广告数",
    materialFileName: "素材文件名称",
    materialDateRange: "素材榜单时间",
  },
  SETTINGS: {
    ACCOUNT_MATCH_COUNT: 2,
    ACTION: "cancel",
  },
  /** 运行页「方案集」：{ id, name, profiles: string[] }[] */
  profileSets: [],
};

export default CONFIG; // 必须使用 export default
