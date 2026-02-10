<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import ConfirmModal from '@/components/ConfirmModal.vue'
import CsvImportModal from '@/components/CsvImportModal.vue'
import ItemFormModal from '@/components/ItemFormModal.vue'
import ValueHistoryChart from '@/components/ValueHistoryChart.vue'
import type { SavePayload } from '@/components/ItemFormModal.vue'
import { fetchCategoryHistory, invalidateHistoryCache } from '@/lib/valueHistory'
import type { ValueSeries } from '@/lib/valueHistory'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { CategoryDetail } from '@/types/category'
import type { ItemRow } from '@/types/item'
import cgLogo from '@/assets/attribution/cg_default.png'

const route = useRoute()
const auth = useAuthStore()
const toast = useToastStore()
const categoryId = route.params.id as string

const category = ref<CategoryDetail | null>(null)
const items = ref<ItemRow[]>([])
const loading = ref(true)
const formOpen = ref(false)
const editingItem = ref<ItemRow | null>(null)
const saving = ref(false)
const refreshingItemId = ref<string | null>(null)
const itemToDelete = ref<ItemRow | null>(null)
const deletingItem = ref(false)
const csvImportOpen = ref(false)
const mergeConfirmOpen = ref(false)
const merging = ref(false)
const historySeries = ref<ValueSeries[]>([])
const historyLoading = ref(false)
const historyDays = ref(7)
const showChartAsTotal = ref(false)

const categoryNotFound = computed(() => !loading.value && !category.value)
const deleteItemMessage = computed(() =>
  itemToDelete.value ? `Delete "${itemToDelete.value.name}"? This cannot be undone.` : ''
)
const totalValue = computed(() =>
  items.value.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_value ?? 0)), 0)
)

/** Item IDs that belong to a duplicate group (same name or same identifier e.g. ticker). */
const duplicateItemIds = computed(() => {
  const list = items.value
  const ids = new Set<string>()
  if (list.length < 2) return ids
  const cat = category.value
  const keyField = cat?.schema_fields?.length
    ? cat.schema_fields.find((f) => f.key === 'ticker' || f.key === 'coin_id' || f.key === 'discogs_release_id' || f.key === 'tcgplayer_id') ?? cat.schema_fields[0]
    : null
  const key = keyField?.key ?? null
  const groups = new Map<string, ItemRow[]>()
  for (const item of list) {
    const groupKey = key && item.category_fields?.[key] != null
      ? String(item.category_fields[key]).trim().toLowerCase()
      : (item.name ?? '').trim().toLowerCase()
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(item)
  }
  for (const group of groups.values()) {
    if (group.length > 1) for (const item of group) ids.add(item.id)
  }
  return ids
})

/** Duplicate groups (same key), each group sorted with oldest first for merge. */
const duplicateGroups = computed(() => {
  const list = items.value
  if (list.length < 2) return []
  const cat = category.value
  const keyField = cat?.schema_fields?.length
    ? cat.schema_fields.find((f) => f.key === 'ticker' || f.key === 'coin_id' || f.key === 'discogs_release_id' || f.key === 'tcgplayer_id') ?? cat.schema_fields[0]
    : null
  const key = keyField?.key ?? null
  const groups = new Map<string, ItemRow[]>()
  for (const item of list) {
    const groupKey = key && item.category_fields?.[key] != null
      ? String(item.category_fields[key]).trim().toLowerCase()
      : (item.name ?? '').trim().toLowerCase()
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    groups.get(groupKey)!.push(item)
  }
  const withOldestFirst = [...groups.values()]
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()))
  // Sort groups by oldest item in group so color indices are stable: existing groups keep their color, new duplicate group gets next.
  withOldestFirst.sort((a, b) => new Date(a[0].created_at).getTime() - new Date(b[0].created_at).getTime())
  return withOldestFirst
})

const hasPotentialDuplicates = computed(() => duplicateItemIds.value.size > 0)

/** Map item id -> duplicate group index (0, 1, 2, …) so each group gets a distinct color. */
const duplicateGroupIndexMap = computed(() => {
  const map = new Map<string, number>()
  duplicateGroups.value.forEach((group, index) => {
    group.forEach((item) => map.set(item.id, index))
  })
  return map
})

const duplicateGroupRowColors = [
  'bg-amber-50 hover:bg-amber-100',
  'bg-sky-50 hover:bg-sky-100',
  'bg-rose-50 hover:bg-rose-100',
  'bg-emerald-50 hover:bg-emerald-100',
  'bg-violet-50 hover:bg-violet-100',
] as const

function getDuplicateRowClass(itemId: string): string {
  const index = duplicateGroupIndexMap.value.get(itemId)
  if (index == null) return 'hover:bg-gray-50'
  return duplicateGroupRowColors[index % duplicateGroupRowColors.length]
}

onMounted(() => {
  loadCategoryAndItems()
})

watch(historyDays, () => {
  if (auth.user?.id && items.value.length > 0) loadHistory()
})

async function loadCategoryAndItems() {
  if (!auth.user?.id) return
  loading.value = true
  const [catRes, itemsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, user_id, name, slug, price_provider, schema_fields')
      .eq('id', categoryId)
      .eq('user_id', auth.user.id)
      .single(),
    supabase
      .from('items')
      .select('id, user_id, category_id, name, quantity, unit_value, currency, source, external_id, category_fields, notes, last_price_at, created_at, updated_at')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false }),
  ])
  if (catRes.error || !catRes.data) {
    category.value = null
  } else {
    category.value = {
      ...catRes.data,
      schema_fields: Array.isArray(catRes.data.schema_fields) ? catRes.data.schema_fields : [],
    } as CategoryDetail
  }
  if (itemsRes.error) {
    items.value = []
  } else {
    items.value = (itemsRes.data ?? []) as ItemRow[]
  }
  loading.value = false
  loadHistory()
}

async function loadHistory() {
  if (!auth.user?.id || items.value.length === 0) {
    historySeries.value = []
    return
  }
  historyLoading.value = true
  try {
    const itemsForHistory = items.value.map((i) => ({
      id: i.id,
      quantity: Number(i.quantity),
      category_id: i.category_id,
      name: i.name,
    }))
    const { series } = await fetchCategoryHistory(auth.user.id, itemsForHistory, historyDays.value)
    historySeries.value = series
  } catch {
    historySeries.value = []
  } finally {
    historyLoading.value = false
  }
}

function openAddForm() {
  editingItem.value = null
  formOpen.value = true
}

function openEditForm(item: ItemRow) {
  editingItem.value = item
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  editingItem.value = null
}

async function handleSave(payload: SavePayload) {
  if (!auth.user?.id || !category.value) {
    toast.addToast('Something went wrong. Try signing in again.', 'error')
    return
  }
  saving.value = true
  try {
    if (editingItem.value) {
      const { error } = await supabase
        .from('items')
        .update({
          name: payload.name,
          quantity: payload.quantity,
          unit_value: payload.unit_value,
          notes: payload.notes || null,
          category_fields: payload.category_fields,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingItem.value.id)
        .eq('user_id', auth.user.id)
      if (error) throw error
      toast.addToast('Item updated.', 'success')
    } else {
      const { error } = await supabase.from('items').insert({
        user_id: auth.user.id,
        category_id: categoryId,
        name: payload.name,
        quantity: payload.quantity,
        unit_value: payload.unit_value,
        notes: payload.notes || null,
        category_fields: payload.category_fields,
      })
      if (error) throw error
      toast.addToast('Item added.', 'success')
    }
    closeForm()
    await loadCategoryAndItems()
  } catch (e: unknown) {
    const message = e && typeof e === 'object' && 'message' in e
      ? String((e as { message: unknown }).message)
      : 'Could not save item.'
    toast.addToast(message, 'error')
  } finally {
    saving.value = false
  }
}

function openDeleteItemConfirm(item: ItemRow) {
  itemToDelete.value = item
}

function closeDeleteItemConfirm() {
  if (!deletingItem.value) itemToDelete.value = null
}

async function submitDeleteItem() {
  const item = itemToDelete.value
  if (!item || !auth.user?.id) return
  deletingItem.value = true
  try {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', item.id)
      .eq('user_id', auth.user.id)
    if (error) throw error
    toast.addToast('Item deleted.', 'success')
    itemToDelete.value = null
    await loadCategoryAndItems()
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not delete item.'
    toast.addToast(message, 'error')
  } finally {
    deletingItem.value = false
  }
}

function openMergeConfirm() {
  mergeConfirmOpen.value = true
}

function closeMergeConfirm() {
  if (!merging.value) mergeConfirmOpen.value = false
}

async function submitMerge() {
  const groups = duplicateGroups.value
  if (!groups.length || !auth.user?.id) return
  merging.value = true
  try {
    for (const group of groups) {
      const [keeper, ...toRemove] = group
      const totalQty = group.reduce((sum, i) => sum + Number(i.quantity), 0)
      const { error: updateErr } = await supabase
        .from('items')
        .update({ quantity: totalQty, updated_at: new Date().toISOString() })
        .eq('id', keeper.id)
        .eq('user_id', auth.user.id)
      if (updateErr) throw updateErr
      for (const item of toRemove) {
        const { error: delErr } = await supabase
          .from('items')
          .delete()
          .eq('id', item.id)
          .eq('user_id', auth.user.id)
        if (delErr) throw delErr
      }
    }
    toast.addToast('Duplicates merged.', 'success')
    mergeConfirmOpen.value = false
    await loadCategoryAndItems()
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not merge.'
    toast.addToast(message, 'error')
  } finally {
    merging.value = false
  }
}

async function refreshItemPrice(item: ItemRow) {
  if (refreshingItemId.value) return
  const session = await supabase.auth.getSession()
  if (!session.data.session?.access_token) {
    toast.addToast('Please sign in again.', 'error')
    return
  }
  refreshingItemId.value = item.id
  try {
    const { data, error } = await supabase.functions.invoke('refresh-item-price', {
      body: { item_id: item.id },
      headers: { Authorization: `Bearer ${session.data.session.access_token}` },
    })
    const payload = data as { code?: string; message?: string } | null
    if (error) {
      toast.addToast(payload?.message ?? error.message ?? 'Could not refresh price.', 'error')
      return
    }
    if (payload?.code && payload.code !== 'ok') {
      toast.addToast(payload.message ?? 'Could not refresh price.', 'error')
      return
    }
    toast.addToast('Price updated.', 'success')
    invalidateHistoryCache()
    await loadCategoryAndItems()
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not refresh price.'
    toast.addToast(message, 'error')
  } finally {
    refreshingItemId.value = null
  }
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)
}

function itemTotal(item: ItemRow) {
  return Number(item.quantity) * Number(item.unit_value ?? 0)
}
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div class="mb-4 flex items-center gap-4">
        <router-link
          :to="{ name: 'categories' }"
          class="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          ← Categories
        </router-link>
      </div>

      <div v-if="loading" class="text-sm text-gray-500">
        Loading…
      </div>
      <div v-else-if="categoryNotFound" class="rounded-lg border border-gray-200 bg-white p-6">
        <p class="text-gray-600">Category not found.</p>
        <router-link :to="{ name: 'categories' }" class="mt-2 inline-block text-sm font-medium text-indigo-600 hover:text-indigo-500">
          Back to categories
        </router-link>
      </div>
      <template v-else-if="category">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-gray-900">{{ category.name }}</h1>
            <p class="mt-1 text-sm text-gray-500">Total value: {{ formatCurrency(totalValue) }}</p>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="inline-flex shrink-0 items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              @click="csvImportOpen = true"
            >
              Import from CSV
            </button>
            <button
              type="button"
              class="inline-flex shrink-0 items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              @click="openAddForm"
            >
              Add item
            </button>
          </div>
        </div>

        <div
          v-if="hasPotentialDuplicates"
          class="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-nowrap"
          role="status"
        >
          <span class="shrink-0 text-amber-600" aria-hidden="true" title="Duplicate items">&#9432;</span>
          <p class="min-w-0 flex-1">
            It looks like you have two or more of the same item in this category. Merge them or edit/delete the highlighted rows below.
          </p>
          <button
            type="button"
            class="ml-auto shrink-0 rounded-md border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-200"
            @click="openMergeConfirm"
          >
            Merge duplicates
          </button>
        </div>

        <section v-if="items.length > 0" class="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 class="text-sm font-medium text-gray-700">Value history</h2>
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

        <div class="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white shadow">
          <div v-if="items.length === 0" class="p-6 text-center text-gray-500">
            No items yet. Add one to start tracking.
          </div>
          <table v-else class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th scope="col" class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th scope="col" class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Qty
                </th>
                <th scope="col" class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Unit value
                </th>
                <th scope="col" class="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                  Total
                </th>
                <th scope="col" class="relative px-4 py-3">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr
                v-for="item in items"
                :key="item.id"
                :class="getDuplicateRowClass(item.id)"
              >
                <td class="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                  {{ item.name }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {{ item.quantity }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-600">
                  {{ item.unit_value != null ? formatCurrency(Number(item.unit_value)) : '—' }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-gray-900">
                  {{ formatCurrency(itemTotal(item)) }}
                </td>
                <td class="whitespace-nowrap px-4 py-3 text-right text-sm">
                  <button
                    v-if="category.price_provider"
                    type="button"
                    class="font-medium text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
                    :disabled="refreshingItemId === item.id"
                    @click="refreshItemPrice(item)"
                  >
                    {{ refreshingItemId === item.id ? 'Refreshing…' : 'Refresh' }}
                  </button>
                  <button
                    type="button"
                    class="ml-4 font-medium text-indigo-600 hover:text-indigo-500"
                    @click="openEditForm(item)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="ml-4 font-medium text-red-600 hover:text-red-500"
                    @click="openDeleteItemConfirm(item)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="category.price_provider === 'coin_gecko'"
          class="mt-6 flex justify-end"
        >
          <a
            href="https://www.coingecko.com?utm_source=investocenter&utm_medium=referral"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 shadow-sm hover:border-gray-300 hover:text-gray-900"
            title="Crypto price data by CoinGecko"
          >
            <span class="whitespace-nowrap">Price data by</span>
            <img :src="cgLogo" alt="CoinGecko" class="h-4 w-auto" />
          </a>
        </div>
      </template>
    </div>

    <ItemFormModal
      :open="formOpen"
      :category="category"
      :item="editingItem"
      :saving="saving"
      @save="handleSave"
      @close="closeForm"
    />

    <CsvImportModal
      :open="csvImportOpen"
      :category="category"
      @close="csvImportOpen = false"
      @imported="loadCategoryAndItems"
    />

    <ConfirmModal
      :open="!!itemToDelete"
      title="Delete item?"
      :message="deleteItemMessage"
      :confirm-loading="deletingItem"
      @close="closeDeleteItemConfirm"
      @confirm="submitDeleteItem"
    />

    <ConfirmModal
      :open="mergeConfirmOpen"
      title="Merge duplicates?"
      message="We'll keep the oldest of each duplicate (by name or ticker), add their quantities into it, and remove the extra rows. This cannot be undone."
      confirm-label="Merge"
      confirm-loading-label="Merging…"
      :confirm-loading="merging"
      @close="closeMergeConfirm"
      @confirm="submitMerge"
    />
  </AppLayout>
</template>
