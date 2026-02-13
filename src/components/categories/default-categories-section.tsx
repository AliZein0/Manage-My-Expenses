"use client"

import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { Plus } from "lucide-react"
import { addDefaultCategoryToBook } from "@/actions/category-actions"
import { useMutation, useQueryClient } from "@tanstack/react-query"

interface DefaultCategoriesSectionProps {
  defaultCategories: any[]
  bookId?: string
}

export function DefaultCategoriesSection({ defaultCategories, bookId }: DefaultCategoriesSectionProps) {
  const queryClient = useQueryClient()

  const addDefaultCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, bookId }: { categoryId: string; bookId: string }) => {
      return await addDefaultCategoryToBook(categoryId, bookId)
    },
    onSuccess: (result, variables) => {
      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: result.message || "Category added to book successfully!",
        })
        // Refresh the data to show updated status
        queryClient.invalidateQueries({ queryKey: ["categories"] })
        queryClient.invalidateQueries({ queryKey: ["default-categories", bookId] })
      } else {
        toast({
          title: "Error",
          description: "Unexpected response from server",
          variant: "destructive",
        })
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add category to book",
        variant: "destructive",
      })
    },
  })

  const handleAddToBook = async (categoryId: string) => {
    if (!bookId) {
      toast({
        title: "No book selected",
        description: "Please select a book to add categories to.",
        variant: "destructive",
      })
      return
    }

    addDefaultCategoryMutation.mutate({
      categoryId,
      bookId,
    })
  }

  if (defaultCategories.length === 0) {
    return null
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-blue-800 bg-blue-50 p-3 rounded-lg border border-blue-200">Default Categories</h2>
      <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-blue-200 bg-blue-50">
              <th className="text-left p-3 font-semibold text-blue-900">Color</th>
              <th className="text-left p-3 font-semibold text-blue-900">Name</th>
              <th className="text-left p-3 font-semibold text-blue-900">Description</th>
              <th className="text-center p-3 font-semibold text-blue-900">Actions</th>
            </tr>
          </thead>
          <tbody>
            {defaultCategories.map((category, index) => (
              <tr
                key={category.id}
                className={`border-b hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/20'}`}
              >
                <td className="p-3">
                  {category.color && (
                    <div
                      className="w-6 h-6 rounded-full shadow-sm"
                      style={{ backgroundColor: category.color }}
                    />
                  )}
                </td>
                <td className="p-3 font-medium text-gray-900">{category.name}</td>
                <td className="p-3 text-gray-600">
                  {category.description || <span className="text-gray-400 italic">No description</span>}
                </td>
                <td className="p-3 text-center">
                  <div className="flex gap-1 justify-center">
                    {bookId ? (
                      <Button
                        onClick={() => handleAddToBook(category.id)}
                        variant="outline"
                        size="sm"
                        className="hover:bg-green-100"
                        disabled={addDefaultCategoryMutation.isPending}
                      >
                        <Plus className="w-4 h-4 mr-1" />
                        {addDefaultCategoryMutation.isPending ? "Adding..." : "Add to Book"}
                      </Button>
                    ) : (
                      <span className="text-gray-400 text-sm">Select a book to add</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}