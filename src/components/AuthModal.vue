<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabase'
import { useToastStore } from '@/stores/toast'
import { TOP_CATEGORIES, type TopCategory } from '@/data/topCategories'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const toast = useToastStore()

type Step = 'form' | 'get-started'
type Mode = 'signin' | 'signup'

const step = ref<Step>('form')
const mode = ref<Mode>('signin')
const email = ref('')
const password = ref('')
const loading = ref(false)
const selectedCategories = ref<Set<string>>(new Set())
const getStartedLoading = ref(false)

// Reset when modal opens
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      step.value = 'form'
      mode.value = 'signin'
      email.value = ''
      password.value = ''
      selectedCategories.value = new Set()
    }
  }
)

function toggleCategory(slug: string) {
  const next = new Set(selectedCategories.value)
  if (next.has(slug)) next.delete(slug)
  else next.add(slug)
  selectedCategories.value = next
}

async function submitAuth() {
  if (!email.value.trim() || !password.value) {
    toast.addToast('Please enter email and password.', 'error')
    return
  }
  loading.value = true
  try {
    if (mode.value === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value })
      if (error) throw error
      emit('close')
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: email.value.trim(),
        password: password.value,
        options: { emailRedirectTo: undefined },
      })
      if (error) throw error
      if (data.user) {
        step.value = 'get-started'
      } else {
        emit('close')
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Something went wrong.'
    toast.addToast(message, 'error')
  } finally {
    loading.value = false
  }
}

async function submitGetStarted() {
  const auth = await supabase.auth.getUser()
  const userId = auth.data.user?.id
  if (!userId) {
    emit('close')
    return
  }
  if (selectedCategories.value.size === 0) {
    emit('close')
    return
  }
  getStartedLoading.value = true
  try {
    const toInsert = TOP_CATEGORIES.filter((c) => selectedCategories.value.has(c.slug)).map(
      (c: TopCategory) => ({
        user_id: userId,
        name: c.name,
        slug: c.slug,
        price_provider: c.price_provider ?? null,
        schema_fields: c.schema_fields ?? [],
      })
    )
    const { error } = await supabase.from('categories').insert(toInsert)
    if (error) throw error
    toast.addToast('Categories created. You’re all set!', 'success')
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not create categories.'
    toast.addToast(message, 'error')
  } finally {
    getStartedLoading.value = false
    emit('close')
  }
}

function skipGetStarted() {
  emit('close')
}

function handleBackdropClick(e: MouseEvent) {
  if ((e.target as HTMLElement).dataset.backdrop) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        data-backdrop
        class="absolute inset-0 bg-black/50"
        @click="handleBackdropClick"
      />
      <div
        class="relative w-full max-w-md rounded-xl bg-white shadow-xl"
        @click.stop
      >
        <!-- Step 1: Sign in / Sign up -->
        <template v-if="step === 'form'">
          <div class="border-b border-gray-200 px-6 py-4">
            <h2 id="auth-modal-title" class="text-lg font-semibold text-gray-900">
              {{ mode === 'signin' ? 'Sign in' : 'Create account' }}
            </h2>
            <div class="mt-2 flex rounded-lg bg-gray-100 p-1">
              <button
                type="button"
                :class="[
                  'flex-1 rounded-md py-2 text-sm font-medium transition',
                  mode === 'signin' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900',
                ]"
                @click="mode = 'signin'"
              >
                Sign in
              </button>
              <button
                type="button"
                :class="[
                  'flex-1 rounded-md py-2 text-sm font-medium transition',
                  mode === 'signup' ? 'bg-white text-gray-900 shadow' : 'text-gray-600 hover:text-gray-900',
                ]"
                @click="mode = 'signup'"
              >
                Sign up
              </button>
            </div>
          </div>
          <form class="space-y-4 px-6 py-4" @submit.prevent="submitAuth">
            <div>
              <label for="auth-email" class="block text-sm font-medium text-gray-700">Email</label>
              <input
                id="auth-email"
                v-model="email"
                type="email"
                autocomplete="email"
                required
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label for="auth-password" class="block text-sm font-medium text-gray-700">Password</label>
              <input
                id="auth-password"
                v-model="password"
                type="password"
                :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
                required
                class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div class="flex gap-3 pt-2">
              <button
                type="button"
                class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                @click="emit('close')"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="loading"
                class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                {{ loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account' }}
              </button>
            </div>
          </form>
        </template>

        <!-- Step 2: Get started (categories) -->
        <template v-else>
          <div class="border-b border-gray-200 px-6 py-4">
            <h2 id="auth-modal-title" class="text-lg font-semibold text-gray-900">
              Choose categories to get started
            </h2>
            <p class="mt-1 text-sm text-gray-500">
              Select one or more, or skip and add them later.
            </p>
          </div>
          <div class="max-h-64 overflow-y-auto px-6 py-4">
            <ul class="space-y-2">
              <li
                v-for="cat in TOP_CATEGORIES"
                :key="cat.slug"
                class="flex items-center gap-3"
              >
                <input
                  :id="`cat-${cat.slug}`"
                  type="checkbox"
                  :checked="selectedCategories.has(cat.slug)"
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  @change="toggleCategory(cat.slug)"
                />
                <label :for="`cat-${cat.slug}`" class="cursor-pointer text-sm font-medium text-gray-900">
                  {{ cat.name }}
                </label>
              </li>
            </ul>
          </div>
          <div class="flex gap-3 border-t border-gray-200 px-6 py-4">
            <button
              type="button"
              class="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              @click="skipGetStarted"
            >
              Skip
            </button>
            <button
              type="button"
              :disabled="getStartedLoading || selectedCategories.size === 0"
              class="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              @click="submitGetStarted"
            >
              {{ getStartedLoading ? 'Creating…' : 'Continue' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>
