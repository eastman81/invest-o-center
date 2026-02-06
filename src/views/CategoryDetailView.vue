<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'

const route = useRoute()
const id = route.params.id as string
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 class="text-2xl font-semibold text-gray-900">Category</h1>
      <p class="mt-2 text-gray-600">Category {{ id }} — items will appear here.</p>
    </div>
  </AppLayout>
</template>
