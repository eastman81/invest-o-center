<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import AppLayout from '@/components/AppLayout.vue'
import ValueHistoryChart from '@/components/ValueHistoryChart.vue'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'
import { useFavoritesStore } from '@/stores/favorites'
import { useProfileStore } from '@/stores/profile'
import { fetchNetWorthHistory, getPnL } from '@/lib/valueHistory'
import type { ItemForHistory } from '@/lib/valueHistory'
import type { ValueSeries } from '@/lib/valueHistory'
import { supabase } from '@/lib/supabase'

const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const favoritesStore = useFavoritesStore()
const profileStore = useProfileStore()

interface ItemSummary {
  id: string
  category_id: string
  quantity: number
  unit_value: number | null
  name: string
}

const itemsSummary = ref<ItemSummary[]>([])
const loading = ref(false)
const pnlPeriod = ref<'30d' | 'all'>('30d')
const pnlData = ref<{ startValue: number; endValue: number } | null>(null)
const pnlLoading = ref(false)
const netWorthSeries = ref<ValueSeries[]>([])

async function loadDashboard() {
  const userId = auth.user?.id
  if (!userId) {
    itemsSummary.value = []
    return
  }
  loading.value = true
  const { data, error } = await supabase
    .from('items')
    .select('id, category_id, quantity, unit_value, name')
    .eq('user_id', userId)
  if (error) {
    itemsSummary.value = []
  } else {
    itemsSummary.value = (data ?? []) as ItemSummary[]
  }
  loading.value = false
  loadPnL()
  loadNetWorthChart()
}

async function loadNetWorthChart() {
  const userId = auth.user?.id
  if (!userId || itemsSummary.value.length === 0) {
    netWorthSeries.value = []
    return
  }
  try {
    const items: ItemForHistory[] = itemsSummary.value.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      category_id: i.category_id,
      name: i.name,
    }))
    const { series } = await fetchNetWorthHistory(userId, items, 30)
    netWorthSeries.value = series
  } catch {
    netWorthSeries.value = []
  }
}

async function loadPnL() {
  const userId = auth.user?.id
  if (!userId || itemsSummary.value.length === 0) {
    pnlData.value = null
    return
  }
  pnlLoading.value = true
  try {
    const items: ItemForHistory[] = itemsSummary.value.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      category_id: i.category_id,
      name: i.name,
    }))
    const result = await getPnL(userId, items, pnlPeriod.value)
    pnlData.value = result
  } catch {
    pnlData.value = null
  } finally {
    pnlLoading.value = false
  }
}

const totalNetWorth = computed(() => {
  return itemsSummary.value.reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.unit_value ?? 0),
    0
  )
})

const categoryTotalMap = computed(() => {
  const map = new Map<string, number>()
  for (const i of itemsSummary.value) {
    const value = Number(i.quantity) * Number(i.unit_value ?? 0)
    map.set(i.category_id, (map.get(i.category_id) ?? 0) + value)
  }
  return map
})

const byCategory = computed(() =>
  categoriesStore.categories
    .map((c) => ({ id: c.id, name: c.name, total: categoryTotalMap.value.get(c.id) ?? 0 }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total)
)

const favoritesList = computed(() => {
  const map = categoryTotalMap.value
  const cats = categoriesStore.categories
  return favoritesStore.favoriteCategoryIds
    .map((id) => {
      const c = cats.find((x) => x.id === id)
      if (!c) return null
      return { id: c.id, name: c.name, total: map.get(c.id) ?? 0 }
    })
    .filter((r): r is { id: string; name: string; total: number } => r !== null)
})

const top3Categories = computed(() => byCategory.value.slice(0, 3))

/** Dashboard sections to show, in user’s preferred order (only visible ones). */
const orderedVisibleSections = computed(() => {
  const prefs = profileStore.dashboardPrefs
  return prefs.sectionOrder.filter((id) => prefs.sectionsVisible[id])
})

function formatCurrency(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(() => {
  if (auth.isLoggedIn) {
    profileStore.load()
    favoritesStore.load()
    categoriesStore.fetchCategories()
    loadDashboard()
  }
})

watch(
  () => auth.isLoggedIn,
  (loggedIn) => {
    if (loggedIn) {
      profileStore.load()
      favoritesStore.load()
      categoriesStore.fetchCategories()
      loadDashboard()
    } else {
      itemsSummary.value = []
      pnlData.value = null
      netWorthSeries.value = []
      favoritesStore.clear()
    }
  }
)

watch(pnlPeriod, () => {
  if (auth.user?.id && itemsSummary.value.length > 0) loadPnL()
})

const pnlDisplay = computed(() => {
  const p = pnlData.value
  if (!p) return null
  const pnl = p.endValue - p.startValue
  const pct = p.startValue !== 0 ? (pnl / p.startValue) * 100 : 0
  return { pnl, pct }
})
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 class="text-2xl font-semibold text-gray-900 sm:text-3xl">
        Invest-O-Center
      </h1>
      <p class="mt-2 text-gray-600">
        Track all of your investments in one place.
      </p>
      <div v-if="!auth.isLoggedIn" class="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p class="text-gray-600">
          Sign in or create an account to start tracking your assets.
        </p>
      </div>
      <template v-else>
        <div class="mt-6 space-y-6">
          <section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div class="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
              <div class="shrink-0">
                <h2 class="text-sm font-medium text-gray-500">Total net worth</h2>
                <p v-if="loading" class="mt-1 text-2xl font-semibold text-gray-900">Loading…</p>
                <p v-else class="mt-1 text-2xl font-semibold text-gray-900">
                  ${{ totalNetWorth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
                </p>
                <div class="mt-3 flex flex-wrap items-center gap-2">
                  <span class="text-sm text-gray-500">PnL</span>
                  <button
                    type="button"
                    class="rounded px-2 py-0.5 text-sm font-medium"
                    :class="pnlPeriod === '30d' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'"
                    @click="pnlPeriod = '30d'"
                  >
                    30 days
                  </button>
                  <button
                    type="button"
                    class="rounded px-2 py-0.5 text-sm font-medium"
                    :class="pnlPeriod === 'all' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'"
                    @click="pnlPeriod = 'all'"
                  >
                    All time
                  </button>
                  <span v-if="pnlLoading" class="text-sm text-gray-500">…</span>
                  <span
                    v-else-if="pnlDisplay"
                    class="text-sm font-medium tabular-nums"
                    :class="pnlDisplay.pnl >= 0 ? 'text-green-600' : 'text-red-600'"
                  >
                    {{ pnlDisplay.pnl >= 0 ? '+' : '' }}{{ formatCurrency(pnlDisplay.pnl) }}
                    ({{ pnlDisplay.pnl >= 0 ? '+' : '' }}{{ pnlDisplay.pct.toFixed(1) }}%)
                  </span>
                  <span v-else class="text-sm text-gray-500">No history yet</span>
                </div>
              </div>
              <div class="hidden min-w-0 flex-1 md:block">
                <ValueHistoryChart
                  v-if="netWorthSeries.length > 0"
                  :series="netWorthSeries"
                  :time-range-days="30"
                  minimal
                />
              </div>
            </div>
          </section>

          <template v-for="sectionId in orderedVisibleSections" :key="sectionId">
            <!-- Favorites -->
            <section
              v-if="sectionId === 'favorites'"
              class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 class="text-sm font-medium text-gray-500">Favorites</h2>
              <p v-if="favoritesList.length === 0" class="mt-1 text-sm text-gray-600">
                Star categories in By category or on the Categories page to add them here. Favorites sync across devices.
              </p>
              <ul v-else class="mt-3 space-y-2">
                <li
                  v-for="row in favoritesList"
                  :key="row.id"
                  class="flex items-center justify-between border-b border-gray-100 py-2 last:border-0"
                >
                  <RouterLink
                    :to="{ name: 'category-detail', params: { id: row.id } }"
                    class="text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    {{ row.name }}
                  </RouterLink>
                  <span class="font-medium text-gray-900">
                    {{ formatCurrency(row.total) }}
                  </span>
                </li>
              </ul>
            </section>

            <!-- Top 3 -->
            <section
              v-else-if="sectionId === 'top3' && top3Categories.length > 0"
              class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 class="text-sm font-medium text-gray-500">Your top 3 categories</h2>
              <p class="mt-1 text-sm text-gray-600">
                Highest value by category.
              </p>
              <ul class="mt-4 grid gap-4 sm:grid-cols-3">
                <li
                  v-for="(row, index) in top3Categories"
                  :key="row.id"
                  class="relative flex flex-col rounded-lg border border-gray-200 bg-gray-50/80 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/50"
                >
                  <span
                    class="absolute right-3 top-3 text-lg font-bold tabular-nums text-gray-300"
                    aria-hidden="true"
                  >
                    {{ index + 1 }}
                  </span>
                  <RouterLink
                    :to="{ name: 'category-detail', params: { id: row.id } }"
                    class="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    {{ row.name }}
                  </RouterLink>
                  <span class="mt-2 text-xl font-semibold text-gray-900">
                    {{ formatCurrency(row.total) }}
                  </span>
                </li>
              </ul>
            </section>

            <!-- By category -->
            <section
              v-else-if="sectionId === 'by_category' && byCategory.length > 0"
              class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
            >
              <h2 class="text-sm font-medium text-gray-500">By category</h2>
              <ul class="mt-3 space-y-2">
                <li
                  v-for="row in byCategory"
                  :key="row.id"
                  class="flex items-center justify-between gap-2 border-b border-gray-100 py-2 last:border-0"
                >
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      type="button"
                      class="shrink-0 rounded p-0.5 text-gray-400 hover:text-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      :class="{ 'text-amber-500': favoritesStore.isFavorite(row.id) }"
                      :aria-label="favoritesStore.isFavorite(row.id) ? 'Remove from favorites' : 'Add to favorites'"
                      @click="favoritesStore.toggle(row.id)"
                    >
                      <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                        <path
                          v-if="favoritesStore.isFavorite(row.id)"
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
                    <RouterLink
                      :to="{ name: 'category-detail', params: { id: row.id } }"
                      class="text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {{ row.name }}
                    </RouterLink>
                  </div>
                  <span class="shrink-0 font-medium text-gray-900">
                    {{ formatCurrency(row.total) }}
                  </span>
                </li>
              </ul>
            </section>
          </template>
        </div>
      </template>
    </div>
  </AppLayout>
</template>
