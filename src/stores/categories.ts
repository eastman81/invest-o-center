import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export interface CategoryRow {
  id: string
  name: string
  slug: string
}

export const useCategoriesStore = defineStore('categories', () => {
  const auth = useAuthStore()
  const categories = ref<CategoryRow[]>([])
  const loading = ref(false)

  async function fetchCategories() {
    const userId = auth.user?.id
    if (!userId) {
      categories.value = []
      return
    }
    loading.value = true
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, slug')
      .eq('user_id', userId)
      .order('name')
    if (error) {
      categories.value = []
    } else {
      categories.value = (data ?? []) as CategoryRow[]
    }
    loading.value = false
  }

  function clear() {
    categories.value = []
  }

  return { categories, loading, fetchCategories, clear }
})
