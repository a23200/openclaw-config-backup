<template>
  <div>
    <h2>流浪动物列表</h2>
    <button @click="loadAnimals">刷新</button>
    <ul>
      <li v-for="item in animals" :key="item.id">
        {{ item.name }} - {{ item.category }} - {{ item.rescueStatus }}
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import axios from 'axios'

const animals = ref([])

const loadAnimals = async () => {
  const { data } = await axios.get('http://localhost:8080/api/animals')
  animals.value = data
}

onMounted(loadAnimals)
</script>
