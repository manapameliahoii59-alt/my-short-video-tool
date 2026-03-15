import { createApp } from 'vue'
import App from './App.vue'
import './assets/style.css' // 保留你的全局布局样式

// 🟢 1. 引入 Element Plus
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// 🟢 2. 引入图标
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

const app = createApp(App)

// 🟢 3. 注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 🟢 4. 使用组件库
app.use(ElementPlus)
app.mount('#app')
