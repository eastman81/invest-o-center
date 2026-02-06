<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const categories = ref<{ id: string; name: string; slug: string }[]>([])
const loading = ref(true)

onMounted(async () => {
  if (!auth.user?.id) return
  loading.value = true
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, slug')
    .eq('user_id', auth.user.id)
    .order('name')
  if (error) {
    categories.value = []
  } else {
    categories.value = data ?? []
  }
  loading.value = false
})
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 class="text-2xl font-semibold text-gray-900">Categories</h1>
      <p class="mt-2 text-gray-600">
        Your tracking categories. Click one to see its items.
      </p>
      <div v-if="loading" class="mt-6 text-sm text-gray-500">
        Loading…
      </div>
      <ul v-else-if="categories.length === 0" class="mt-6 rounded-lg border border-gray-200 bg-white p-6">
        <li class="text-gray-600">
          You don’t have any categories yet. Create one from your account, or add items after creating a category.
        </li>
      </ul>
      <ul v-else class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="cat in categories"
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
  </AppLayout>
</template>
