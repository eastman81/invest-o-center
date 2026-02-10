<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { CategoryDetail } from '@/types/category'
import type { ItemRow } from '@/types/item'
import { useToastStore } from '@/stores/toast'
import { supabase } from '@/lib/supabase'

const props = withDefaults(
  defineProps<{
    open: boolean
    category: CategoryDetail | null
    item: ItemRow | null
    saving?: boolean
  }>(),
  { saving: false }
)
const emit = defineEmits<{ close: []; save: [payload: SavePayload] }>()

export interface SavePayload {
  name: string
  quantity: number
  unit_value: number | null
  notes: string
  category_fields: Record<string, string | number | null>
}

const toast = useToastStore()
const name = ref('')
const quantity = ref(1)
const unitValue = ref<string>('')
const notes = ref('')
const categoryFieldValues = ref<Record<string, string>>({})

const isDiscogsCategory = computed(() =>
  props.category?.schema_fields?.some((f) => f.key === 'discogs_release_id')
)
const discogsSearchQuery = ref('')
const discogsSearching = ref(false)
const discogsResults = ref<Array<{ id: number; title: string; thumb: string; year?: string; format?: string[]; lowest_price?: number | null }>>([])
const discogsSelected = ref<{ id: number; title: string } | null>(null)

const isJustTCGCategory = computed(() =>
  props.category?.schema_fields?.some((f) => f.key === 'tcgplayer_id')
)
const justtcgSearchQuery = ref('')
const justtcgSearching = ref(false)
const justtcgResults = ref<Array<{ tcgplayerId: string; name: string; set_name: string; game: string; lowest_price: number | null }>>([])
const justtcgSelected = ref<{ tcgplayerId: string; name: string } | null>(null)

function formatDiscogsPrice(price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price)
}

function formatDiscogsFormat(format: string[] | undefined): string {
  if (!format?.length) return ''
  return format.join(', ')
}

async function searchDiscogs() {
  const q = discogsSearchQuery.value.trim()
  if (!q) return
  discogsSearching.value = true
  discogsResults.value = []
  try {
    const { data, error } = await supabase.functions.invoke('discogs-search', {
      body: { q },
    })
    if (error) throw error
    const payload = data as { results?: Array<{ id: number; title: string; thumb: string; year?: string; format?: string[]; lowest_price?: number | null }> } | undefined
    discogsResults.value = payload?.results ?? []
    if (discogsResults.value.length === 0) {
      toast.addToast('No releases found. Try a different search.', 'info')
    }
  } catch (e) {
    const err = e as Error & { data?: { message?: string } }
    const msg = err?.message ?? err?.data?.message ?? 'Search failed.'
    toast.addToast(msg, 'error')
  } finally {
    discogsSearching.value = false
  }
}

function selectDiscogsResult(r: { id: number; title: string }) {
  discogsSelected.value = r
  categoryFieldValues.value = { ...categoryFieldValues.value, discogs_release_id: String(r.id) }
  if (!name.value.trim()) name.value = r.title
  discogsResults.value = []
  discogsSearchQuery.value = ''
}

function clearDiscogsSelection() {
  discogsSelected.value = null
  categoryFieldValues.value = { ...categoryFieldValues.value, discogs_release_id: '' }
}

function formatJustTCGPrice(price: number | null | undefined): string {
  if (price == null || Number.isNaN(price)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(price)
}

async function searchJustTCG() {
  const q = justtcgSearchQuery.value.trim()
  if (!q) return
  justtcgSearching.value = true
  justtcgResults.value = []
  try {
    const { data, error } = await supabase.functions.invoke('justtcg-search', {
      body: { q },
    })
    if (error) throw error
    const payload = data as { results?: Array<{ tcgplayerId: string; name: string; set_name: string; game: string; lowest_price: number | null }> } | undefined
    justtcgResults.value = payload?.results ?? []
    if (justtcgResults.value.length === 0) {
      toast.addToast('No cards found. Try a different search.', 'info')
    }
  } catch (e) {
    const err = e as Error & { data?: { message?: string } }
    const msg = err?.message ?? err?.data?.message ?? 'Search failed.'
    toast.addToast(msg, 'error')
  } finally {
    justtcgSearching.value = false
  }
}

function selectJustTCGResult(r: { tcgplayerId: string; name: string }) {
  justtcgSelected.value = r
  categoryFieldValues.value = { ...categoryFieldValues.value, tcgplayer_id: r.tcgplayerId }
  if (!name.value.trim()) name.value = r.name
  justtcgResults.value = []
  justtcgSearchQuery.value = ''
}

function clearJustTCGSelection() {
  justtcgSelected.value = null
  categoryFieldValues.value = { ...categoryFieldValues.value, tcgplayer_id: '' }
}

watch(
  () => [props.open, props.item],
  () => {
    if (props.open) {
      discogsSearchQuery.value = ''
      discogsResults.value = []
      discogsSelected.value = null
      justtcgSearchQuery.value = ''
      justtcgResults.value = []
      if (props.item) {
        name.value = props.item.name
        quantity.value = Number(props.item.quantity)
        unitValue.value = props.item.unit_value != null ? String(props.item.unit_value) : ''
        notes.value = props.item.notes ?? ''
        const fields = props.category?.schema_fields ?? []
        categoryFieldValues.value = {}
        for (const f of fields) {
          const v = props.item.category_fields?.[f.key]
          categoryFieldValues.value[f.key] = v != null ? String(v) : ''
        }
        const tcgId = props.item.category_fields?.tcgplayer_id
        justtcgSelected.value =
          tcgId != null && String(tcgId).trim()
            ? { tcgplayerId: String(tcgId).trim(), name: props.item.name }
            : null
      } else {
        name.value = ''
        quantity.value = 1
        unitValue.value = ''
        notes.value = ''
        const fields = props.category?.schema_fields ?? []
        categoryFieldValues.value = {}
        for (const f of fields) {
          categoryFieldValues.value[f.key] = ''
        }
        justtcgSelected.value = null
      }
    }
  },
  { immediate: true }
)

function submit() {
  const nameTrim = name.value.trim()
  if (!nameTrim) {
    toast.addToast('Please enter a name.', 'error')
    return
  }
  const q = Number(quantity.value)
  if (Number.isNaN(q) || q < 0) {
    toast.addToast('Quantity must be a number greater than or equal to 0.', 'error')
    return
  }
  const uvStr = String(unitValue.value ?? '').trim()
  const uv = uvStr === '' ? null : Number(uvStr)
  if (uv !== null && (Number.isNaN(uv) || uv < 0)) {
    toast.addToast('Unit value must be a number (e.g. 100 or 99.99).', 'error')
    return
  }
  const catFields: Record<string, string | number | null> = {}
  for (const [k, v] of Object.entries(categoryFieldValues.value)) {
    const trimmed = String(v).trim()
    if (trimmed === '') {
      catFields[k] = null
    } else {
      const num = Number(trimmed)
      catFields[k] = Number.isNaN(num) ? trimmed : num
    }
  }
  emit('save', {
    name: nameTrim,
    quantity: q,
    unit_value: uv,
    notes: notes.value.trim(),
    category_fields: catFields,
  })
}

function handleBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).hasAttribute?.('data-backdrop')) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-form-title"
    >
      <div data-backdrop class="absolute inset-0 bg-black/50" @click="handleBackdropClick" />
      <div class="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white shadow-xl">
        <div class="border-b border-gray-200 px-6 py-4">
          <h2 id="item-form-title" class="text-lg font-semibold text-gray-900">
            {{ item ? 'Edit item' : 'Add item' }}
          </h2>
        </div>
        <form class="space-y-4 px-6 py-4" @submit.prevent="submit">
          <div>
            <label for="item-name" class="block text-sm font-medium text-gray-700">Name</label>
            <input
              id="item-name"
              v-model="name"
              type="text"
              required
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="item-quantity" class="block text-sm font-medium text-gray-700">Quantity</label>
              <input
                id="item-quantity"
                v-model.number="quantity"
                type="number"
                min="0"
                step="any"
                required
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label for="item-unit-value" class="block text-sm font-medium text-gray-700">Unit value (USD)</label>
              <input
                id="item-unit-value"
                v-model="unitValue"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <template v-for="field in category?.schema_fields ?? []" :key="field.key">
            <div v-if="field.key === 'tcgplayer_id' && isJustTCGCategory">
              <label class="block text-sm font-medium text-gray-700">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500">*</span>
              </label>
              <p class="mt-0.5 text-xs text-gray-500">Search by card name, then pick a result. The card ID is saved for JustTCG price refresh.</p>
              <div v-if="justtcgSelected" class="mt-2 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <span class="min-w-0 flex-1 truncate text-sm text-gray-900">{{ justtcgSelected.name }}</span>
                <span class="shrink-0 text-xs text-gray-500">ID: {{ justtcgSelected.tcgplayerId }}</span>
                <button
                  type="button"
                  class="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                  @click="clearJustTCGSelection"
                >
                  Change
                </button>
              </div>
              <div v-else class="mt-2 space-y-2">
                <div class="flex gap-2">
                  <input
                    v-model="justtcgSearchQuery"
                    type="text"
                    placeholder="e.g. Charizard, Black Lotus"
                    class="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    @keydown.enter.prevent="searchJustTCG"
                  />
                  <button
                    type="button"
                    class="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                    :disabled="justtcgSearching || !justtcgSearchQuery.trim()"
                    @click="searchJustTCG"
                  >
                    {{ justtcgSearching ? 'Searching…' : 'Search' }}
                  </button>
                </div>
                <ul
                  v-if="justtcgResults.length > 0"
                  class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white py-1"
                >
                  <li
                    v-for="r in justtcgResults"
                    :key="r.tcgplayerId"
                    class="flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                    @click="selectJustTCGResult(r)"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="truncate font-medium text-gray-900">{{ r.name }}</div>
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-gray-500">
                        <span v-if="r.set_name">{{ r.set_name }}</span>
                        <span v-if="r.game">{{ r.game }}</span>
                        <span :class="r.lowest_price != null ? 'text-green-700 font-medium' : ''">
                          {{ formatJustTCGPrice(r.lowest_price) }}
                        </span>
                      </div>
                    </div>
                  </li>
                </ul>
                <input
                  v-model="categoryFieldValues[field.key]"
                  type="text"
                  placeholder="Or paste JustTCG card ID"
                  :required="field.required"
                  class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div v-else-if="field.key === 'discogs_release_id' && isDiscogsCategory">
              <label class="block text-sm font-medium text-gray-700">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500">*</span>
              </label>
              <p class="mt-0.5 text-xs text-gray-500">Search by album or artist name, then pick a release.</p>
              <div v-if="discogsSelected" class="mt-2 flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <span class="min-w-0 flex-1 truncate text-sm text-gray-900">{{ discogsSelected.title }}</span>
                <span class="shrink-0 text-xs text-gray-500">ID: {{ discogsSelected.id }}</span>
                <button
                  type="button"
                  class="shrink-0 text-sm font-medium text-indigo-600 hover:text-indigo-500"
                  @click="clearDiscogsSelection"
                >
                  Change
                </button>
              </div>
              <div v-else class="mt-2 space-y-2">
                <div class="flex gap-2">
                  <input
                    v-model="discogsSearchQuery"
                    type="text"
                    placeholder="e.g. Nirvana Nevermind"
                    class="block flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    @keydown.enter.prevent="searchDiscogs"
                  />
                  <button
                    type="button"
                    class="shrink-0 rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
                    :disabled="discogsSearching || !discogsSearchQuery.trim()"
                    @click="searchDiscogs"
                  >
                    {{ discogsSearching ? 'Searching…' : 'Search' }}
                  </button>
                </div>
                <ul
                  v-if="discogsResults.length > 0"
                  class="max-h-56 space-y-1 overflow-y-auto rounded-md border border-gray-200 bg-white py-1"
                >
                  <li
                    v-for="r in discogsResults"
                    :key="r.id"
                    class="flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                    @click="selectDiscogsResult(r)"
                  >
                    <img
                      v-if="r.thumb"
                      :src="r.thumb"
                      :alt="r.title"
                      class="h-10 w-10 shrink-0 rounded object-cover"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="truncate font-medium text-gray-900">{{ r.title }}</div>
                      <div class="flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-gray-500">
                        <span v-if="r.year">{{ r.year }}</span>
                        <span v-if="formatDiscogsFormat(r.format)" class="capitalize">{{ formatDiscogsFormat(r.format) }}</span>
                        <span :class="r.lowest_price != null ? 'text-green-700 font-medium' : ''">
                          {{ formatDiscogsPrice(r.lowest_price) }}
                        </span>
                      </div>
                    </div>
                  </li>
                </ul>
                <input
                  v-model="categoryFieldValues[field.key]"
                  type="text"
                  placeholder="Or paste Release ID or Discogs URL"
                  :required="field.required"
                  class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div v-else>
              <label :for="`item-${field.key}`" class="block text-sm font-medium text-gray-700">
                {{ field.label }}
                <span v-if="field.required" class="text-red-500">*</span>
              </label>
              <input
                :id="`item-${field.key}`"
                v-model="categoryFieldValues[field.key]"
                type="text"
                :required="field.required"
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </template>
          <div>
            <label for="item-notes" class="block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              id="item-notes"
              v-model="notes"
              rows="2"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div class="flex gap-3 border-t border-gray-200 pt-4">
            <button
              type="button"
              class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              @click="emit('close')"
            >
              Cancel
            </button>
            <button
              type="submit"
              :disabled="props.saving || !name.trim()"
              class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              @click.prevent="submit"
            >
              {{ props.saving ? 'Saving…' : item ? 'Save' : 'Add' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
