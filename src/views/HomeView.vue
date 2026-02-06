<script setup lang="ts">
import AppLayout from '@/components/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
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
      <div v-else class="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p class="text-gray-600">
          Dashboard and totals will go here.
        </p>
      </div>
    </div>
  </AppLayout>
</template>
