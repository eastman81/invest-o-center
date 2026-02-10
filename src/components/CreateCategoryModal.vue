<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import { getCategoryTemplateForNameOrSlug } from '@/data/topCategories'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: []; created: [] }>()

const auth = useAuthStore()
const toast = useToastStore()
const name = ref('')
const slug = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      name.value = ''
      slug.value = ''
    }
  }
)

function slugFromName(n: string): string {
  return n
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

watch(name, (n) => {
  if (props.open && !slug.value) slug.value = slugFromName(n)
})

async function submit() {
  const nameTrim = name.value.trim()
  if (!nameTrim) return
  const slugTrim = slug.value.trim() || slugFromName(nameTrim)
  if (!slugTrim) {
    toast.addToast('Slug is required (or use a name that generates one).', 'error')
    return
  }
  if (!auth.user?.id) return
  saving.value = true
  try {
    const template = getCategoryTemplateForNameOrSlug(nameTrim, slugTrim)
    const { error } = await supabase.from('categories').insert({
      user_id: auth.user.id,
      name: nameTrim,
      slug: slugTrim,
      price_provider: template?.price_provider ?? null,
      schema_fields: template?.schema_fields ?? [],
    })
    if (error) throw error
    toast.addToast('Category created.', 'success')
    emit('created')
    emit('close')
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not create category.'
    toast.addToast(message, 'error')
  } finally {
    saving.value = false
  }
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
      aria-labelledby="create-category-title"
    >
      <div data-backdrop class="absolute inset-0 bg-black/50" @click="handleBackdropClick" />
      <div class="relative w-full max-w-md rounded-xl bg-white shadow-xl">
        <div class="border-b border-gray-200 px-6 py-4">
          <h2 id="create-category-title" class="text-lg font-semibold text-gray-900">
            Create category
          </h2>
          <p class="mt-1 text-sm text-gray-500">
            Add a new category to group your items (e.g. Stocks, Vinyl Records).
          </p>
        </div>
        <form class="space-y-4 px-6 py-4" @submit.prevent="submit">
          <div>
            <label for="category-name" class="block text-sm font-medium text-gray-700">Name</label>
            <input
              id="category-name"
              v-model="name"
              type="text"
              required
              placeholder="e.g. Stocks"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label for="category-slug" class="block text-sm font-medium text-gray-700">Slug</label>
            <input
              id="category-slug"
              v-model="slug"
              type="text"
              placeholder="e.g. stocks (optional)"
              class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p class="mt-1 text-xs text-gray-500">Leave blank to generate from name. Used in URLs.</p>
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
              :disabled="saving"
              class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {{ saving ? 'Creating…' : 'Create' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
