import { createRouter, createWebHistory } from 'vue-router';

function genRouter() {
  return createRouter({
    history: createWebHistory(),
    routes: [],
    scrollBehavior: (to, from, savedPosition) => {
      if (savedPosition) {
        return savedPosition;
      }
      if (to.matched.every((record, i) => from.matched[i] !== record)) {
        return { left: 0, top: 0 };
      }
      return false;
    }
  });
}

const router = genRouter();
[
  { name: 'A', component: () => import('../views/a.vue'), path: '/a' },
  { name: 'B', component: () => import('../views/b.vue'), path: '/b' },
  { name: 'C', component: () => import('../views/c.vue'), path: '/c' },
].forEach(route => {
  router.addRoute(route);
});
export default router;
