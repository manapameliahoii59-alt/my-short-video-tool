import { resolve } from "path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
// 🌟 1. 引入代码混淆插件
import obfuscator from "rollup-plugin-javascript-obfuscator";

export default defineConfig({
  main: {
    plugins: [
      // 🌟 2. 核心防御：只在打包 (production) 时执行混淆，开发调试时不混淆
      process.env.NODE_ENV === "production"
        ? obfuscator({
            include: ["src/main/**/*.js"], // 只针对 main 文件夹下的代码进行混淆
            exclude: [/node_modules/],
            compact: true, // 压缩成一行
            controlFlowFlattening: true, // 打乱代码执行流，防逆向分析
            controlFlowFlatteningThreshold: 0.5, // 50% 逻辑打乱（平衡安全与运行性能）
            stringArray: true, // 提取敏感字符串（如接口地址）
            stringArrayEncoding: ["base64"], // 用 Base64 加密字符串
            disableConsoleOutput: true, // 生产环境禁用 console.log，不留调试后门
          })
        : null,
    ],
  },
  preload: {}, // 预加载脚本保持默认即可
  renderer: {
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
      },
    },
    plugins: [vue()],
  },
});
