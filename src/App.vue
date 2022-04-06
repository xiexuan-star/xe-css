<template>
  <div xe:100="h bg-primary" xe="hover:bg-primary" />
  <div xe:100="w h" xe-bg-red-80 xe-flex="~ jc-center ai-center">22</div>
  <div xe:30="w h" :xe-fc-black='isActive?"95":"35"'>
    font
  </div>
  <button @click="isActive=!isActive">click</button>
</template>

<cx-name>App</cx-name>
<script lang="ts" setup>
const isActive = ref(0)
</script>
