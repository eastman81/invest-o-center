<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import CreateCategoryModal from '@/components/CreateCategoryModal.vue'
import ValueHistoryChart from '@/components/ValueHistoryChart.vue'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'
import { useFavoritesStore } from '@/stores/favorites'
import { useToastStore } from '@/stores/toast'
import type { CategoryRow } from '@/stores/categories'
import { fetchCategoriesHistory } from '@/lib/valueHistory'
import type { ValueSeries } from '@/lib/valueHistory'
import type { ItemForHistory } from '@/lib/valueHistory'
import { supabase } from '@/lib/supabase'

const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const favoritesStore = useFavoritesStore()
const toast = useToastStore()
const showCreateModal = ref(false)
const categoryToDelete = ref<CategoryRow | null>(null)
const deleting = ref(false)
const historySeries = ref<ValueSeries[]>([])
const historyLoading = ref(false)
const historyDays = ref(7)
const showChartAsTotal = ref(false)
const deleteCategoryMessage = computed(() =>
  categoryToDelete.value
    ? `Delete "${categoryToDelete.value.name}"? This will also delete all items in it. This cannot be undone.`
    : ''
)

onMounted(() => {
  favoritesStore.load()
  categoriesStore.fetchCategories().then(() => loadHistory())
})

watch(historyDays, () => {
  if (auth.user?.id && categoriesStore.categories.length > 0) loadHistory()
})

async function loadHistory() {
  if (!auth.user?.id || categoriesStore.categories.length === 0) {
    historySeries.value = []
    return
  }
  historyLoading.value = true
  try {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id, quantity, category_id, name')
      .eq('user_id', auth.user.id)
    const items = (itemsData ?? []) as { id: string; quantity: number; category_id: string; name: string }[]
    const byCategory = categoriesStore.categories.map((cat) => ({
      categoryId: cat.id,
      categoryName: cat.name,
      items: items.filter((i) => i.category_id === cat.id).map((i) => ({ id: i.id, quantity: i.quantity, category_id: i.category_id, name: i.name } as ItemForHistory)),
    }))
    const { series } = await fetchCategoriesHistory(auth.user.id, byCategory, historyDays.value)
    historySeries.value = series
  } catch {
    historySeries.value = []
  } finally {
    historyLoading.value = false
  }
}

function onCategoryCreated() {
  categoriesStore.fetchCategories().then(() => loadHistory())
}

function openDeleteConfirm(cat: CategoryRow) {
  categoryToDelete.value = cat
}

function closeDeleteConfirm() {
  if (!deleting.value) categoryToDelete.value = null
}

async function submitDelete() {
  const cat = categoryToDelete.value
  if (!cat) return
  deleting.value = true
  const { error } = await categoriesStore.deleteCategory(cat.id)
  deleting.value = false
  categoryToDelete.value = null
  if (error) {
    toast.addToast(error.message ?? 'Could not delete category.', 'error')
  } else {
    toast.addToast('Category deleted.', 'success')
    loadHistory()
  }
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
      <template v-else>
        <section class="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium text-gray-700">Value history by category</h2>
            <div class="flex items-center gap-3">
              <select
                v-model.number="historyDays"
                class="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-700"
              >
                <option :value="7">7 days</option>
                <option :value="30">30 days</option>
                <option :value="90">90 days</option>
              </select>
              <label class="flex items-center gap-1.5 text-sm text-gray-600">
                <input v-model="showChartAsTotal" type="checkbox" class="rounded border-gray-300" />
                Show as total
              </label>
            </div>
          </div>
          <div v-if="historyLoading" class="flex h-[280px] items-center justify-center text-sm text-gray-500">
            Loading chart…
          </div>
          <ValueHistoryChart
            v-else
            :series="historySeries"
            :time-range-days="historyDays"
            :show-as-total="showChartAsTotal"
            empty-message="No history yet. Refresh prices or wait for the daily snapshot to build history."
          />
        </section>

        <ul class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <li
          v-for="cat in categoriesStore.categories"
          :key="cat.id"
          class="flex items-stretch rounded-lg border border-gray-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow"
        >
          <button
            type="button"
            class="shrink-0 rounded-l-lg p-3 text-gray-400 hover:text-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400"
            :class="{ 'text-amber-500': favoritesStore.isFavorite(cat.id) }"
            :aria-label="favoritesStore.isFavorite(cat.id) ? 'Remove from favorites' : 'Add to favorites'"
            @click.stop="favoritesStore.toggle(cat.id)"
          >
            <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path
                v-if="favoritesStore.isFavorite(cat.id)"
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              />
              <path
                v-else
                stroke="currentColor"
                stroke-width="1.5"
                fill="none"
                d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
              />
            </svg>
          </button>
          <router-link
            :to="{ name: 'category-detail', params: { id: cat.id } }"
            class="min-w-0 flex-1 py-4 pr-4 pl-0"
          >
            <span class="font-medium text-gray-900">{{ cat.name }}</span>
            <span class="mt-1 block text-sm text-gray-500">{{ cat.slug }}</span>
          </router-link>
          <button
            type="button"
            class="rounded-r-lg px-3 text-red-600 hover:bg-red-50 hover:text-red-700"
            title="Delete category"
            @click.stop="openDeleteConfirm(cat)"
          >
            Delete
          </button>
        </li>
      </ul>
      </template>
    </div>
    <CreateCategoryModal
      :open="showCreateModal"
      @created="onCategoryCreated"
      @close="showCreateModal = false"
    />

    <ConfirmModal
      :open="!!categoryToDelete"
      title="Delete category?"
      :message="deleteCategoryMessage"
      :confirm-loading="deleting"
      @close="closeDeleteConfirm"
      @confirm="submitDelete"
    />
  </AppLayout>
</template>
