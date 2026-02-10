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

  async function deleteCategory(categoryId: string): Promise<{ error: Error | null }> {
    const userId = auth.user?.id
    if (!userId) return { error: new Error('Not signed in') }
    const { error: itemsError } = await supabase
      .from('items')
      .delete()
      .eq('category_id', categoryId)
      .eq('user_id', userId)
    if (itemsError) return { error: itemsError as Error }
    const { error: catError } = await supabase
      .from('categories')
      .delete()
      .eq('id', categoryId)
      .eq('user_id', userId)
    if (catError) return { error: catError as Error }
    categories.value = categories.value.filter((c) => c.id !== categoryId)
    return { error: null }
  }

  function clear() {
    categories.value = []
  }

  return { categories, loading, fetchCategories, deleteCategory, clear }
})
