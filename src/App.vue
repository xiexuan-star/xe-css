<template>
  <div xe:40="h bg-primary hover:bg-primary"></div>
  <div xe:100="w h" xe-bg-red-80 xe-flex="~ jc-center ai-center">22</div>
  <div xe:30="w h" :xe-fc-black='isActive?"75":"55"'>
    font
  </div>
  <button @click="isActive=!isActive">click</button>
  <svg></svg>
</template>

<cx-name>App</cx-name>
<script lang="ts" setup>
import { compileTemplate, SFCTemplateCompileOptions, SFCTemplateCompileResults } from '@vue/compiler-sfc';

const isActive = ref(0);
console.log(compileTemplate({
  source: `
  <div class='cx-btn cx-list' :xe='isActive?"fc-black-45":"fc-primary"'>


  </div>
`, id: '', filename: 'index.vue'
}));
</script>
