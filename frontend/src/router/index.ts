import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'share',
      component: () => import('@/views/ShareLocation.vue'),
    },
    {
      path: '/admin',
      name: 'admin-login',
      component: () => import('@/views/AdminLogin.vue'),
    },
    {
      path: '/admin/dashboard',
      name: 'admin-dashboard',
      component: () => import('@/views/AdminDashboard.vue'),
      beforeEnter: (_to, _from, next) => {
        const token = sessionStorage.getItem('u-loc-admin-token');
        if (!token) {
          next({ name: 'admin-login' });
        } else {
          next();
        }
      },
    },
  ],
});

export default router;
