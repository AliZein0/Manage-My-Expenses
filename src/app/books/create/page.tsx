"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createBook } from "@/actions/book-actions"
import { getCategories } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { ArrowLeft, Check } from "lucide-react"
import { CurrencySelector } from "@/components/currency-selector"
import { AppLayout } from "@/components/layout/app-layout"
import { CategoryIcon } from "@/components/ui/category-icon"
import { useQuery } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"

export default function CreateBookPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    currency: "USD",
  })
  const [selectedDefaultCategories, setSelectedDefaultCategories] = useState<string[]>([])

  // Fetch default categories
  const { data: defaultCategoriesData, isLoading: defaultCategoriesLoading } = useQuery({
    queryKey: ["default-categories"],
    queryFn: async () => {
      const result = await getCategories()
      return (result.categories as any[])?.filter(cat => cat.isDefault) || []
    },
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Client-side validation
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Book name is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const formDataObj = new FormData()
      formDataObj.append("name", formData.name)
      formDataObj.append("description", formData.description)
      formDataObj.append("currency", formData.currency)

      // Add selected default categories
      selectedDefaultCategories.forEach(categoryId => {
        formDataObj.append("defaultCategories", categoryId)
      })

      const result = await createBook(formDataObj)

      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: "Book created successfully!",
        })
        // Wait a moment before redirecting
        setTimeout(() => {
          router.push("/books")
          router.refresh()
        }, 500)
      } else {
        toast({
          title: "Error",
          description: "Unexpected response from server",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating book:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create book",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-100">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline" className="bg-white hover:bg-gray-50">
              <Link href="/books">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Books
              </Link>
            </Button>
            <h1 className="text-3xl font-bold text-gray-900">Create New Book</h1>
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Book Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-base font-semibold">
                  Book Name *
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., House, Company, Personal"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isLoading}
                  required
                  className="text-lg"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-base font-semibold">
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Optional description of this book"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isLoading}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label htmlFor="currency" className="text-base font-semibold">
                  Currency
                </Label>
                <CurrencySelector
                  value={formData.currency}
                  onChange={(value) => setFormData({ ...formData, currency: value })}
                  disabled={isLoading}
                />
              </div>

              {/* Default Categories Selection */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">
                  Add Default Categories (Optional)
                </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">
                      {selectedDefaultCategories.length} selected
                    </span>
                    {selectedDefaultCategories.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedDefaultCategories([])}
                        className="text-xs"
                      >
                        Clear All
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-600">
                  Choose from pre-made categories to quickly set up your book. You can always add or remove categories later.
                </p>
                
                {defaultCategoriesLoading ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">Loading default categories...</p>
                  </div>
                ) : defaultCategoriesData && defaultCategoriesData.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto border rounded-lg p-4 bg-gray-50/50">
                    {defaultCategoriesData.map((category) => {
                      const isSelected = selectedDefaultCategories.includes(category.id)
                      return (
                        <Card 
                          key={category.id} 
                          className={`cursor-pointer transition-all hover:shadow-md ${
                            isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : 'hover:bg-white'
                          }`}
                          onClick={() => {
                            setSelectedDefaultCategories(prev => 
                              prev.includes(category.id)
                                ? prev.filter(id => id !== category.id)
                                : [...prev, category.id]
                            )
                          }}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  setSelectedDefaultCategories(prev => 
                                    prev.includes(category.id)
                                      ? prev.filter(id => id !== category.id)
                                      : [...prev, category.id]
                                  )
                                }}
                                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 border-gray-300"
                              />
                              {category.icon && (
                                <CategoryIcon iconName={category.icon} className="w-4 h-4 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm text-gray-900 truncate">
                                  {category.name}
                                </h4>
                                <p className="text-xs text-gray-600 truncate">
                                  {category.description}
                                </p>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <p>No default categories available</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? "Creating..." : "Create Book"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/books")}
                  disabled={isLoading}
                  className="bg-white hover:bg-gray-50"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}