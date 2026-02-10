<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppLayout from '@/components/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'
import { useFavoritesStore } from '@/stores/favorites'
import { invalidateHistoryCache } from '@/lib/valueHistory'
import {
  useProfileStore,
  type DashboardSectionId,
  type DashboardPrefs,
} from '@/stores/profile'
import { supabase } from '@/lib/supabase'

const router = useRouter()
const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const favoritesStore = useFavoritesStore()
const profileStore = useProfileStore()

const displayNameEdit = ref('')
const savingProfile = ref(false)
const profileError = ref<string | null>(null)
const savingPrefs = ref(false)

const configuredProviders = ref<Set<string>>(new Set())
const apiKeyInputs = ref<Record<string, string>>({})
const apiKeySaving = ref<Record<string, boolean>>({})
const apiKeyError = ref<string | null>(null)
const API_KEY_PROVIDERS: { id: string; label: string }[] = [
  { id: 'alpha_vantage', label: 'Alpha Vantage (stocks)' },
  { id: 'coin_gecko', label: 'CoinGecko (crypto)' },
  { id: 'rent_cast', label: 'RentCast (real estate / home value)' },
]

const email = computed(() => auth.user?.email ?? '')
const profile = computed(() => profileStore.profile)
const dashboardPrefs = computed(() => profileStore.dashboardPrefs)

const sectionLabels: Record<DashboardSectionId, string> = {
  favorites: 'Favorites',
  top3: 'Top 3 categories',
  by_category: 'By category',
}

async function loadProfile() {
  await profileStore.load()
  displayNameEdit.value = profileStore.profile?.display_name ?? ''
}

async function saveDisplayName() {
  profileError.value = null
  savingProfile.value = true
  const err = await profileStore.updateDisplayName(displayNameEdit.value)
  savingProfile.value = false
  if (err) profileError.value = err.message
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function moveSection(index: number, direction: 1 | -1) {
  const order = [...dashboardPrefs.value.sectionOrder]
  const next = index + direction
  if (next < 0 || next >= order.length) return
  ;[order[index], order[next]] = [order[next], order[index]]
  applyPrefs({ sectionOrder: order })
}

async function applyPrefs(partial: Partial<DashboardPrefs>) {
  savingPrefs.value = true
  await profileStore.updateDashboardPrefs(partial)
  savingPrefs.value = false
}

function toggleSectionVisible(id: DashboardSectionId) {
  const next = { ...dashboardPrefs.value.sectionsVisible, [id]: !dashboardPrefs.value.sectionsVisible[id] }
  applyPrefs({ sectionsVisible: next })
}

async function loadConfiguredProviders() {
  const { data } = await supabase.from('user_api_keys').select('provider')
  configuredProviders.value = new Set((data ?? []).map((r) => r.provider as string))
}

async function saveApiKey(provider: string) {
  const key = (apiKeyInputs.value[provider] ?? '').trim()
  if (!key) {
    apiKeyError.value = 'Enter an API key.'
    return
  }
  apiKeyError.value = null
  apiKeySaving.value = { ...apiKeySaving.value, [provider]: true }
  const { data, error } = await supabase.functions.invoke('save-api-key', {
    body: { provider, key },
  })
  apiKeySaving.value = { ...apiKeySaving.value, [provider]: false }
  if (error) {
    apiKeyError.value = (data as { message?: string })?.message ?? error.message
    return
  }
  const err = (data as { code?: string; message?: string })?.code
  if (err && err !== 'ok') {
    apiKeyError.value = (data as { message?: string }).message ?? 'Failed to save.'
    return
  }
  apiKeyInputs.value = { ...apiKeyInputs.value, [provider]: '' }
  await loadConfiguredProviders()
}

async function removeApiKey(provider: string) {
  apiKeyError.value = null
  apiKeySaving.value = { ...apiKeySaving.value, [provider]: true }
  const session = (await supabase.auth.getSession()).data.session
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-api-key`
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ provider }),
  })
  apiKeySaving.value = { ...apiKeySaving.value, [provider]: false }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    apiKeyError.value = (body as { message?: string }).message ?? 'Failed to remove.'
    return
  }
  await loadConfiguredProviders()
}

async function handleSignOut() {
  await auth.signOut()
  invalidateHistoryCache()
  categoriesStore.clear()
  favoritesStore.clear()
  router.replace({ name: 'home' })
}

onMounted(() => {
  loadProfile()
  loadConfiguredProviders()
})
</script>

<template>
  <AppLayout>
    <div class="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <h1 class="text-2xl font-semibold text-gray-900">Account</h1>
      <p class="mt-1 text-gray-600">
        Profile, API keys, and dashboard preferences.
      </p>

      <div class="mt-8 space-y-8">
        <!-- Profile -->
        <section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-base font-medium text-gray-900">Profile</h2>
          <dl class="mt-4 space-y-3">
            <div>
              <dt class="text-sm text-gray-500">Email</dt>
              <dd class="mt-0.5 text-gray-900">{{ email || '—' }}</dd>
            </div>
            <div>
              <dt class="text-sm text-gray-500">Display name</dt>
              <dd class="mt-1 flex flex-wrap items-center gap-2">
                <input
                  v-model="displayNameEdit"
                  type="text"
                  class="block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 sm:text-sm"
                  placeholder="Your name"
                  @keydown.enter="saveDisplayName"
                />
                <button
                  type="button"
                  class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  :disabled="savingProfile"
                  @click="saveDisplayName"
                >
                  {{ savingProfile ? 'Saving…' : 'Save' }}
                </button>
              </dd>
              <p v-if="profileError" class="mt-1 text-sm text-red-600">{{ profileError }}</p>
            </div>
            <div v-if="profile">
              <dt class="text-sm text-gray-500">Member since</dt>
              <dd class="mt-0.5 text-gray-900">{{ formatDate(profile.created_at) }}</dd>
            </div>
          </dl>
        </section>

        <!-- Dashboard preferences -->
        <section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-base font-medium text-gray-900">Dashboard preferences</h2>
          <p class="mt-1 text-sm text-gray-600">
            Choose which sections appear on the home page and in what order.
          </p>
          <ul class="mt-4 space-y-2">
            <li
              v-for="(sectionId, index) in dashboardPrefs.sectionOrder"
              :key="sectionId"
              class="flex items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50/50 py-2 pl-3 pr-2"
            >
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-30"
                  :disabled="savingPrefs || index === 0"
                  aria-label="Move up"
                  @click="moveSection(index, -1)"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 disabled:opacity-30"
                  :disabled="savingPrefs || index === dashboardPrefs.sectionOrder.length - 1"
                  aria-label="Move down"
                  @click="moveSection(index, 1)"
                >
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <span class="text-sm font-medium text-gray-900">{{ sectionLabels[sectionId] }}</span>
              </div>
              <label class="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  :checked="dashboardPrefs.sectionsVisible[sectionId]"
                  class="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  @change="toggleSectionVisible(sectionId)"
                />
                Show
              </label>
            </li>
          </ul>
          <p v-if="savingPrefs" class="mt-2 text-xs text-gray-500">Saving…</p>
        </section>

        <!-- API keys -->
        <section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-base font-medium text-gray-900">API keys</h2>
          <p class="mt-1 text-sm text-gray-600">
            Add your own API keys for price providers. Keys are encrypted and stored per account. Used when you click “Refresh” on an item.
          </p>
          <p v-if="apiKeyError" class="mt-2 text-sm text-red-600">{{ apiKeyError }}</p>
          <ul class="mt-4 space-y-4">
            <li
              v-for="p in API_KEY_PROVIDERS"
              :key="p.id"
              class="flex flex-col gap-2 rounded-md border border-gray-200 bg-gray-50/50 p-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <span class="shrink-0 text-sm font-medium text-gray-900">{{ p.label }}</span>
              <template v-if="configuredProviders.has(p.id)">
                <span class="text-sm text-gray-500">Configured</span>
                <div class="flex gap-2">
                  <input
                    v-model="apiKeyInputs[p.id]"
                    type="password"
                    class="block w-48 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    placeholder="New key to replace"
                    autocomplete="off"
                  />
                  <button
                    type="button"
                    class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                    :disabled="apiKeySaving[p.id]"
                    @click="saveApiKey(p.id)"
                  >
                    {{ apiKeySaving[p.id] ? 'Saving…' : 'Replace' }}
                  </button>
                  <button
                    type="button"
                    class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    :disabled="apiKeySaving[p.id]"
                    @click="removeApiKey(p.id)"
                  >
                    Remove
                  </button>
                </div>
              </template>
              <template v-else>
                <input
                  v-model="apiKeyInputs[p.id]"
                  type="password"
                  class="block w-64 rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:w-72"
                  :placeholder="'Enter ' + p.label + ' API key'"
                  autocomplete="off"
                />
                <button
                  type="button"
                  class="w-fit rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  :disabled="apiKeySaving[p.id]"
                  @click="saveApiKey(p.id)"
                >
                  {{ apiKeySaving[p.id] ? 'Saving…' : 'Save' }}
                </button>
              </template>
            </li>
          </ul>
        </section>

        <!-- Sign out -->
        <section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 class="text-base font-medium text-gray-900">Sign out</h2>
          <p class="mt-1 text-sm text-gray-600">
            Sign out of your account. You’ll be returned to the home page.
          </p>
          <button
            type="button"
            class="mt-4 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            @click="handleSignOut"
          >
            Sign out
          </button>
        </section>
      </div>
    </div>
  </AppLayout>
</template>
