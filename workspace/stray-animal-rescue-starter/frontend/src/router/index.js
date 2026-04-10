import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import AnimalView from '../views/AnimalView.vue'

const routes = [
  { path: '/', component: HomeView },
  { path: '/animals', component: AnimalView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
