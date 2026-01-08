"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { restoreCategory } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { RotateCcw, ArrowLeft } from "lucide-react"

interface RestoreCategoryPageProps {
  params: {
    id: string
  }
}

export default function RestoreCategoryPage({ params }: RestoreCategoryPageProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleRestore = async () => {
    setIsLoading(true)
    try {
      const result = await restoreCategory(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: "Category restored successfully!",
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
        description: "Failed to restore category",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
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
          <h1 className="text-3xl font-bold text-green-600">Restore Category</h1>
        </div>

        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <RotateCcw className="w-6 h-6" />
              Confirm Restore Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-lg">
                Are you sure you want to restore this category?
              </p>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800 font-semibold">What happens:</p>
                <ul className="list-disc list-inside text-sm text-green-700 mt-2 space-y-1">
                  <li>The category will appear in your main list again</li>
                  <li>All existing expenses remain linked to this category</li>
                  <li>You can use it for new expenses immediately</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleRestore}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={isLoading}
              >
                {isLoading ? "Restoring..." : "Yes, Restore Category"}
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