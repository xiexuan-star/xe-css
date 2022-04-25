import { createApp } from 'vue'
import App from './App.vue'
import 'xe-css.css'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')
