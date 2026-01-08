"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCategoryById, permanentDeleteCategory } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { Trash2, ArrowLeft } from "lucide-react"

interface PermanentDeleteCategoryPageProps {
  params: {
    id: string
  }
}

export default function PermanentDeleteCategoryPage({ params }: PermanentDeleteCategoryPageProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [category, setCategory] = useState<any>(null)
  const [loadingCategory, setLoadingCategory] = useState(true)

  useEffect(() => {
    const fetchCategory = async () => {
      const result = await getCategoryById(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        router.back()
      } else {
        setCategory(result.category)
      }
      setLoadingCategory(false)
    }
    fetchCategory()
  }, [params.id, router])

  const handlePermanentDelete = async () => {
    setIsLoading(true)
    try {
      const result = await permanentDeleteCategory(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: "Category permanently deleted!",
        })
        // Use browser history to go back
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back()
        } else {
          router.push('/categories')
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete category",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (loadingCategory) {
    return (
      <div className="min-h-screen bg-gray-50 p-8 flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button 
            variant="outline" 
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back()
              } else {
                router.push('/categories')
              }
            }}
            disabled={isLoading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-red-600">Permanently Delete Category</h1>
        </div>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-6 h-6" />
              Confirm Permanent Delete
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-lg text-red-700">
                ⚠️ <strong>WARNING:</strong> This action cannot be undone!
              </p>
              <p className="text-lg">
                Are you sure you want to permanently delete this category?
              </p>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm text-red-800 font-semibold">This will:</p>
                <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
                  <li>Permanently remove the category from the database</li>
                  <li>Cannot be restored or undone</li>
                  <li>Only works if category has NO expenses</li>
                  <li>All expenses must be deleted or moved first</li>
                </ul>
              </div>
              {category && (
                <>
                  <p className="text-sm text-gray-600">
                    Expenses: <strong>{category.expenses.length}</strong>
                  </p>
                  {category.expenses.length > 0 && (
                    <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                      <p className="text-sm text-orange-800 font-semibold">
                        ⚠️ Cannot Delete
                      </p>
                      <p className="text-sm text-orange-700 mt-1">
                        This category has {category.expenses.length} expense(s). You must delete or move all expenses before permanently deleting this category.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handlePermanentDelete}
                variant="destructive"
                className="flex-1"
                disabled={isLoading || category?.expenses.length > 0}
              >
                {isLoading ? "Deleting..." : category?.expenses.length > 0 ? "Cannot Delete" : "Yes, Permanently Delete"}
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  if (typeof window !== 'undefined' && window.history.length > 1) {
                    window.history.back()
                  } else {
                    router.push('/categories')
                  }
                }}
                disabled={isLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}