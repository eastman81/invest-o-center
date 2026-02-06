<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import ItemFormModal from '@/components/ItemFormModal.vue'
import type { SavePayload } from '@/components/ItemFormModal.vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { CategoryDetail } from '@/types/category'
import type { ItemRow } from '@/types/item'

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

const categoryNotFound = computed(() => !loading.value && !category.value)
const totalValue = computed(() =>
  items.value.reduce((sum, i) => sum + (Number(i.quantity) * Number(i.unit_value ?? 0)), 0)
)

onMounted(() => {
  loadCategoryAndItems()
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

async function handleDelete(item: ItemRow) {
  if (!auth.user?.id) return
  if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return
  try {
    const { error } = await supabase
      .from('items')
      .delete()
      .eq('id', item.id)
      .eq('user_id', auth.user.id)
    if (error) throw error
    toast.addToast('Item deleted.', 'success')
    await loadCategoryAndItems()
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not delete item.'
    toast.addToast(message, 'error')
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
          <button
            type="button"
            class="inline-flex shrink-0 items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            @click="openAddForm"
          >
            Add item
          </button>
        </div>

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
              <tr v-for="item in items" :key="item.id" class="hover:bg-gray-50">
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
                    type="button"
                    class="font-medium text-indigo-600 hover:text-indigo-500"
                    @click="openEditForm(item)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="ml-4 font-medium text-red-600 hover:text-red-500"
                    @click="handleDelete(item)"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
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
  </AppLayout>
</template>
