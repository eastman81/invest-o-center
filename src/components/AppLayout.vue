<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import { invalidateHistoryCache } from '@/lib/valueHistory'
import { useAuthStore } from '@/stores/auth'
import { useCategoriesStore } from '@/stores/categories'
import { useProfileStore } from '@/stores/profile'
import AuthModal from '@/components/AuthModal.vue'
import PlanModal from '@/components/PlanModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const PLAN_MODAL_KEY = 'saw_plan_modal'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const categoriesStore = useCategoriesStore()
const profileStore = useProfileStore()
const showAuthModal = ref(false)
const showPlanModal = ref(false)

const shouldShowPlanModal = computed(() => {
  if (!auth.isLoggedIn || !profileStore.profile) return false
  if (profileStore.profile.plan !== 'free') return false
  try {
    return !sessionStorage.getItem(PLAN_MODAL_KEY)
  } catch {
    return false
  }
})

onMounted(async () => {
  if (auth.isLoggedIn) await profileStore.load()
})

watch(
  () => auth.isLoggedIn,
  async (isLoggedIn) => {
    if (!isLoggedIn) {
      invalidateHistoryCache()
      categoriesStore.clear()
      showPlanModal.value = false
      if (route.meta.requiresAuth) {
        router.replace({ name: 'home' })
      }
    } else {
      await profileStore.load()
    }
  }
)

watch(shouldShowPlanModal, (v) => {
  showPlanModal.value = v
}, { immediate: true })

async function handleSignOut() {
  await auth.signOut()
  invalidateHistoryCache()
  categoriesStore.clear()
  router.replace({ name: 'home' })
}
</script>

<template>
  <div class="min-h-screen bg-gray-50">
    <header class="border-b border-gray-200 bg-white">
      <nav class="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8" aria-label="Main">
        <RouterLink to="/" class="text-lg font-semibold text-gray-900">
          Invest-O-Center
        </RouterLink>
        <div class="flex items-center gap-4">
          <RouterLink
            v-if="auth.isLoggedIn"
            to="/categories"
            class="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Categories
          </RouterLink>
          <RouterLink
            v-if="auth.isLoggedIn"
            to="/account"
            class="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Account
          </RouterLink>
          <button
            v-if="auth.isLoggedIn"
            type="button"
            class="text-sm font-medium text-gray-700 hover:text-gray-900"
            @click="handleSignOut()"
          >
            Sign out
          </button>
          <button
            v-else
            type="button"
            class="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            @click="showAuthModal = true"
          >
            Sign in
          </button>
        </div>
      </nav>
    </header>
    <main>
      <slot />
    </main>
    <AuthModal :open="showAuthModal" @close="showAuthModal = false" @categories-created="categoriesStore.fetchCategories()" />
    <PlanModal :open="showPlanModal" @close="showPlanModal = false" />
    <ToastContainer />
  </div>
</template>
