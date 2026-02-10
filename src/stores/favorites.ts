import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabase'

export const useFavoritesStore = defineStore('favorites', () => {
  const auth = useAuthStore()
  const rawIds = ref<string[]>([])

  const favoriteCategoryIds = computed(() => rawIds.value)

  async function load() {
    const userId = auth.user?.id
    if (!userId) {
      rawIds.value = []
      return
    }
    const { data, error } = await supabase
      .from('user_favorites')
      .select('category_id')
      .eq('user_id', userId)
    if (error) {
      rawIds.value = []
      return
    }
    rawIds.value = (data ?? []).map((row) => row.category_id as string)
  }

  function isFavorite(categoryId: string) {
    return rawIds.value.includes(categoryId)
  }

  async function toggle(categoryId: string) {
    const userId = auth.user?.id
    if (!userId) return

    if (rawIds.value.includes(categoryId)) {
      const { error } = await supabase
        .from('user_favorites')
        .delete()
        .eq('user_id', userId)
        .eq('category_id', categoryId)
      if (!error) {
        rawIds.value = rawIds.value.filter((id) => id !== categoryId)
      }
    } else {
      const { error } = await supabase.from('user_favorites').insert({
        user_id: userId,
        category_id: categoryId,
      })
      if (!error) {
        rawIds.value = [...rawIds.value, categoryId]
      }
    }
  }

  function clear() {
    rawIds.value = []
  }

  return {
    favoriteCategoryIds,
    load,
    isFavorite,
    toggle,
    clear,
  }
})
