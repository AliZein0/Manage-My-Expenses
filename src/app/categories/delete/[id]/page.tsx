"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { disableCategory } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { AlertTriangle, ArrowLeft } from "lucide-react"
import Link from "next/link"

interface DeleteCategoryPageProps {
  params: {
    id: string
  }
}

export default function DeleteCategoryPage({ params }: DeleteCategoryPageProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)

  const handleDisable = async () => {
    setIsLoading(true)
    try {
      const result = await disableCategory(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: "Category disabled successfully!",
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
        description: "Failed to disable category",
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
          <h1 className="text-3xl font-bold text-red-600">Disable Category</h1>
        </div>

        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              Confirm Disable Category
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-lg">
                Are you sure you want to disable this category?
              </p>
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800 font-semibold">What happens:</p>
                <ul className="list-disc list-inside text-sm text-yellow-700 mt-2 space-y-1">
                  <li>The category will be hidden from your main list</li>
                  <li>Existing expenses will remain linked to this category</li>
                  <li>You can restore it later from the categories page</li>
                  <li>Cannot be deleted permanently if it has expenses</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleDisable}
                variant="destructive"
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading ? "Disabling..." : "Yes, Disable Category"}
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