<template>
  <div xe:100="h" xe="hover:bg-primary bg-primary-40" />
  <div xe:100="w h" xe-bg-red-80 xe-flex="~ jc-center ai-center">22</div>
  <div xe:30="w h" :xe-fc-black='isActive?"95":"35"'>
    font
  </div>
  <button @click="isActive=!isActive">click</button>
</template>

<cx-name>A</cx-name>
<script lang="ts" setup>
const isActive = ref(0)
</script>
