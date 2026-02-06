<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import CreateCategoryModal from '@/components/CreateCategoryModal.vue'
import { useCategoriesStore } from '@/stores/categories'

const categoriesStore = useCategoriesStore()
const showCreateModal = ref(false)

onMounted(() => {
  categoriesStore.fetchCategories()
})

function onCategoryCreated() {
  categoriesStore.fetchCategories()
}
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-2xl font-semibold text-gray-900">Categories</h1>
          <p class="mt-2 text-gray-600">
            Your tracking categories. Click one to see its items.
          </p>
        </div>
        <button
          type="button"
          class="inline-flex shrink-0 items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          @click="showCreateModal = true"
        >
          Create category
        </button>
      </div>
      <div v-if="categoriesStore.loading" class="mt-6 text-sm text-gray-500">
        Loading…
      </div>
      <div v-else-if="categoriesStore.categories.length === 0" class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-gray-600">
          You don’t have any categories yet. Click "Create category" above to add one.
        </p>
      </div>
      <ul v-else class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="cat in categoriesStore.categories"
          :key="cat.id"
        >
          <router-link
            :to="{ name: 'category-detail', params: { id: cat.id } }"
            class="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-indigo-300 hover:shadow"
          >
            <span class="font-medium text-gray-900">{{ cat.name }}</span>
            <span class="mt-1 block text-sm text-gray-500">{{ cat.slug }}</span>
          </router-link>
        </li>
      </ul>
    </div>
    <CreateCategoryModal
      :open="showCreateModal"
      @created="onCategoryCreated"
      @close="showCreateModal = false"
    />
  </AppLayout>
</template>
