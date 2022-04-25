<template>
  <button @click="toRoute('a')">a</button>
  <button @click="toRoute('b')">b</button>
  <button @click="toRoute('c')">c</button>
  <router-view/>
</template>
<script lang="ts" setup>
const router = useRouter();
const toRoute = (to: string) => router.push(to);
</script>
