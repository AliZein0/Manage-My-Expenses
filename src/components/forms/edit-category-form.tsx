"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateCategory } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface EditCategoryFormProps {
  category: {
    id: string
    name: string
    description: string | null
    icon: string | null
    color: string | null
    bookId: string
    book: {
      id: string
      name: string
    }
  }
}

export default function EditCategoryForm({ category }: EditCategoryFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: category.name,
    description: category.description || "",
    color: category.color || "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const formDataObj = new FormData()
      formDataObj.append("name", formData.name)
      formDataObj.append("description", formData.description)
      formDataObj.append("color", formData.color)

      const result = await updateCategory(category.id, formDataObj)

      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: "Category updated successfully!",
        })
        router.back()
      } else {
        toast({
          title: "Error",
          description: "Unexpected response from server",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update category",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline">
          <Link href={`/categories?bookId=${category.bookId}`}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Edit Category</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Category Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Book:</span> {category.book.name}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name" className="text-base font-semibold">
                Category Name *
              </Label>
              <Input
                id="name"
                placeholder="e.g., Food, Transportation, Entertainment"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                disabled={isLoading}
                required
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-semibold">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="Optional description or notes about this category"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isLoading}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="color" className="text-base font-semibold">
                Color (Optional)
              </Label>
              <div className="flex gap-3 items-center">
                <Input
                  id="color"
                  type="color"
                  value={formData.color || "#000000"}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  disabled={isLoading}
                  className="w-20 h-10 p-1 cursor-pointer"
                />
                <Input
                  placeholder="#FF5733 or rgb(255,87,51)"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  disabled={isLoading}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="flex-1"
              >
                {isLoading ? "Updating..." : "Update Category"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={isLoading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
