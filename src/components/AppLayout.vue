<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import AuthModal from '@/components/AuthModal.vue'
import ToastContainer from '@/components/ToastContainer.vue'

const auth = useAuthStore()
const showAuthModal = ref(false)
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
            @click="auth.signOut()"
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
    <AuthModal :open="showAuthModal" @close="showAuthModal = false" />
    <ToastContainer />
  </div>
</template>
