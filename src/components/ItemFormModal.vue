<script setup lang="ts">
import { ref, watch } from 'vue'
import type { CategoryDetail } from '@/types/category'
import type { ItemRow } from '@/types/item'
import { useToastStore } from '@/stores/toast'

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

watch(
  () => [props.open, props.item],
  () => {
    if (props.open) {
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
          <div v-for="field in category?.schema_fields ?? []" :key="field.key">
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
