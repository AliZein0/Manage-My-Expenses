"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createCategory, getCategories, addDefaultCategoryToBook } from "@/actions/category-actions"
import { getBooks, getBookById } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/app-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { CategoryIcon } from "@/components/ui/category-icon"
import { ChevronDown, ChevronUp, Check, Home, Car, Utensils, ShoppingBag, Heart, Briefcase, GraduationCap, Gamepad2, Film, Music, Coffee, Zap, Wrench, Plane, Train, Bus, Bike, Dumbbell, Book, Pill, Stethoscope, CreditCard, Smartphone, Laptop, Watch, Gift, Cake, Camera, Palette, Hammer, Scissors, Truck, Building, TreePine, Waves, Mountain, Sun, Moon, Star } from "lucide-react"

function CreateCategoryForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  
  // Get bookId from URL parameter
  const bookIdFromUrl = searchParams.get("bookId")
  
  // State for toggling default categories visibility
  const [showDefaultCategories, setShowDefaultCategories] = useState(false)
  
  // Use React Query for data fetching
  const { data: booksData, isLoading: booksLoading } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const result = await getBooks()
      return result.books || []
    },
    staleTime: 0, // Always consider data stale to ensure fresh fetches
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window gets focus
    enabled: !bookIdFromUrl, // Only fetch all books if no bookId provided
  })

  // If bookId is provided, fetch only that book
  const { data: selectedBook, isLoading: bookLoading } = useQuery({
    queryKey: ["book", bookIdFromUrl],
    queryFn: async () => {
      if (!bookIdFromUrl) return null
      const result = await getBookById(bookIdFromUrl)
      if (result.error) return null
      return result.book
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    enabled: !!bookIdFromUrl,
  })

  // Fetch default categories when bookId is provided
  const { data: defaultCategoriesData } = useQuery({
    queryKey: ["default-categories", bookIdFromUrl],
    queryFn: async () => {
      if (!bookIdFromUrl) return { defaultCategories: [], bookCategories: [] }
      
      const result = await getCategories()
      const allCategories = result.categories as any[] || []
      
      const defaultCategories = allCategories.filter(cat => cat.isDefault)
      const bookCategories = allCategories.filter(cat => cat.bookId === bookIdFromUrl)
      
      return { defaultCategories, bookCategories }
    },
    enabled: !!bookIdFromUrl, // Only fetch when we have a bookId
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  })

  // Use React Query mutation for form submission
  const createCategoryMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      return await createCategory(formData)
    },
    onSuccess: (result) => {
      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: "Category created successfully!",
        })
        // Invalidate and refetch categories
        queryClient.invalidateQueries({ queryKey: ["categories"] })
        // Redirect after success
        setTimeout(() => {
          // If we came from a specific book, go back to that book's details
          if (bookIdFromUrl) {
            router.push(`/books/${bookIdFromUrl}`)
          } else {
            router.push("/categories")
          }
          router.refresh()
        }, 300)
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
        description: error.message || "Failed to create category",
        variant: "destructive",
      })
    },
  })

  // Mutation for adding default category to book
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
        // Refresh the default categories data to show updated status
        queryClient.invalidateQueries({ queryKey: ["default-categories", bookIdFromUrl] })
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

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    bookIds: bookIdFromUrl ? [bookIdFromUrl] : [],
    icon: "",
  })

  // State for emoji picker dialog
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Client-side validation
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Category name is required",
        variant: "destructive",
      })
      return
    }
    
    if (formData.bookIds.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one book",
        variant: "destructive",
      })
      return
    }

    // Create FormData and submit via mutation
    const formDataObj = new FormData()
    formDataObj.append("name", formData.name)
    formDataObj.append("description", formData.description)
    formData.bookIds.forEach(bookId => {
      formDataObj.append("bookIds", bookId)
    })
    formDataObj.append("icon", formData.icon)

    createCategoryMutation.mutate(formDataObj)
  }

  // selectedBook is now fetched directly when bookIdFromUrl is provided
  // For the dropdown case, find from booksData


  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-100">
          <div className="flex flex-row items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              {bookIdFromUrl ? "Add Category to Book" : "Create New Category"}
            </h1>
            {!bookIdFromUrl && (
              <Button 
                variant="outline" 
                onClick={() => queryClient.invalidateQueries({ queryKey: ["books"] })}
                disabled={booksLoading}
                size="sm"
                className="bg-white hover:bg-gray-50"
              >
                {booksLoading ? "Refreshing..." : "Refresh Books"}
              </Button>
            )}
          </div>
        </div>

        {/* Default Categories Selection - only show when bookId is provided */}
        {bookIdFromUrl && defaultCategoriesData?.defaultCategories && defaultCategoriesData.defaultCategories.length > 0 && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-blue-900">Quick Add from Default Categories</h2>
                  <p className="text-blue-700">Choose from pre-made categories to quickly add to your book, or create a custom category below.</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDefaultCategories(!showDefaultCategories)}
                  className="flex items-center space-x-2"
                >
                  {showDefaultCategories ? (
                    <>
                      <span>Hide Categories</span>
                      <ChevronUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      <span>Show Categories</span>
                      <ChevronDown className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
              
              {showDefaultCategories && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {defaultCategoriesData.defaultCategories.map((category) => {
                    const isAlreadyAdded = defaultCategoriesData.bookCategories?.some(
                      bookCat => bookCat.name.toLowerCase() === category.name.toLowerCase()
                    )
                    
                    return (
                      <Card key={category.id} className={`transition-shadow border-blue-200 ${isAlreadyAdded ? 'bg-green-50 border-green-200' : 'hover:shadow-md hover:border-blue-300'}`}>
                        <CardContent className="p-4">
                          <div className="flex items-center space-x-3 mb-3">
                            {category.icon && (
                              <CategoryIcon iconName={category.icon} className="w-4 h-4 flex-shrink-0" />
                            )}
                            <h3 className="font-medium text-gray-900 truncate">{category.name}</h3>
                            {isAlreadyAdded && (
                              <Check className="w-4 h-4 text-green-600 flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {category.description || "No description"}
                          </p>
                          {isAlreadyAdded ? (
                            <Badge variant="secondary" className="w-full justify-center bg-green-100 text-green-800 border-green-200">
                              Already Added
                            </Badge>
                          ) : (
                            <Button
                              onClick={() => {
                                if (bookIdFromUrl) {
                                  addDefaultCategoryMutation.mutate({
                                    categoryId: category.id,
                                    bookId: bookIdFromUrl,
                                  })
                                }
                              }}
                              disabled={addDefaultCategoryMutation.isPending}
                              size="sm"
                              className="w-full bg-blue-600 hover:bg-blue-700"
                            >
                              {addDefaultCategoryMutation.isPending ? "Adding..." : "Add to Book"}
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-1 border-t border-gray-300"></div>
              <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300">OR</Badge>
              <div className="flex-1 border-t border-gray-300"></div>
            </div>
          </div>
        )}

        <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
          <div className="p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Create Custom Category</h2>
              <p className="text-gray-600 text-sm">
                {bookIdFromUrl 
                  ? "Create a new category specifically for this book" 
                  : "Create a new category that can be used across your books"
                }
              </p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Category Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-base font-semibold">
                  Category Name *
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Groceries, Utilities, Entertainment"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={createCategoryMutation.isPending}
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
                  placeholder="Optional description or notes about this category"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={createCategoryMutation.isPending}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Icon Input */}
              <div className="space-y-2">
                <Label htmlFor="icon" className="text-base font-semibold">
                  Icon (Optional)
                </Label>
                <div className="flex gap-3 items-center">
                  <Input
                    id="icon"
                    type="text"
                    placeholder="e.g., Home, Car, Utensils"
                    value={formData.icon}
                    onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                    disabled={createCategoryMutation.isPending}
                    className="flex-1"
                    maxLength={50}
                  />
                  <Dialog open={isEmojiPickerOpen} onOpenChange={setIsEmojiPickerOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={createCategoryMutation.isPending}
                        className="px-3"
                      >
                        Choose Icon
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Choose an Icon</DialogTitle>
                      </DialogHeader>
                      <div className="grid grid-cols-8 gap-2 max-h-64 overflow-y-auto">
                        {[
                          { name: "Home", icon: Home },
                          { name: "Car", icon: Car },
                          { name: "Utensils", icon: Utensils },
                          { name: "ShoppingBag", icon: ShoppingBag },
                          { name: "Heart", icon: Heart },
                          { name: "Briefcase", icon: Briefcase },
                          { name: "GraduationCap", icon: GraduationCap },
                          { name: "Gamepad2", icon: Gamepad2 },
                          { name: "Film", icon: Film },
                          { name: "Music", icon: Music },
                          { name: "Coffee", icon: Coffee },
                          { name: "Zap", icon: Zap },
                          { name: "Wrench", icon: Wrench },
                          { name: "Plane", icon: Plane },
                          { name: "Train", icon: Train },
                          { name: "Bus", icon: Bus },
                          { name: "Bike", icon: Bike },
                          { name: "Dumbbell", icon: Dumbbell },
                          { name: "Book", icon: Book },
                          { name: "Pill", icon: Pill },
                          { name: "Stethoscope", icon: Stethoscope },
                          { name: "CreditCard", icon: CreditCard },
                          { name: "Smartphone", icon: Smartphone },
                          { name: "Laptop", icon: Laptop },
                          { name: "Watch", icon: Watch },
                          { name: "Gift", icon: Gift },
                          { name: "Cake", icon: Cake },
                          { name: "Camera", icon: Camera },
                          { name: "Palette", icon: Palette },
                          { name: "Hammer", icon: Hammer },
                          { name: "Scissors", icon: Scissors },
                          { name: "Truck", icon: Truck },
                          { name: "Building", icon: Building },
                          { name: "TreePine", icon: TreePine },
                          { name: "Waves", icon: Waves },
                          { name: "Mountain", icon: Mountain },
                          { name: "Sun", icon: Sun },
                          { name: "Moon", icon: Moon },
                          { name: "Star", icon: Star },
                        ].map(({ name, icon: IconComponent }) => (
                          <button
                            key={name}
                            type="button"
                            onClick={() => {
                              setFormData({ ...formData, icon: name })
                              setIsEmojiPickerOpen(false)
                            }}
                            className="flex flex-col items-center gap-1 p-2 hover:bg-gray-100 rounded-md transition-colors"
                            title={`Select ${name} icon`}
                          >
                            <IconComponent className="w-6 h-6" />
                            <span className="text-xs text-gray-600 truncate max-w-full">{name}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-end mt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsEmojiPickerOpen(false)}
                        >
                          Close
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  {formData.icon && (
                    <div className="p-2 bg-gray-100 rounded-md">
                      <CategoryIcon iconName={formData.icon} />
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  Add an icon to visually represent this category, or click &quot;Choose Icon&quot; to browse options
                </p>
              </div>

              {/* Book Selection */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  Books *
                </Label>
                {bookIdFromUrl ? (
                  <div className="p-3 bg-gray-100 rounded-md border border-gray-300">
                    <p className="font-medium text-gray-900">
                      {bookLoading ? "Loading..." : selectedBook?.name || "Book not found"}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">This category will be added to the selected book</p>
                    {selectedBook === null && !bookLoading && (
                      <p className="text-sm text-red-600 mt-2">Book not found or access denied</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-600">Select one or more books to add this category to:</p>
                    {booksLoading ? (
                      <p className="text-sm text-gray-500">Loading books...</p>
                    ) : booksData?.length === 0 ? (
                      <div className="text-sm text-red-600">
                        No books available.{" "}
                        <Link
                          href="/books/create"
                          className="font-medium underline hover:text-red-800"
                        >
                          Create a book first
                        </Link>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-wrap gap-2 p-3 border rounded-md bg-gray-50 min-h-[60px]">
                          {booksData?.map((book: any) => {
                            const isSelected = formData.bookIds.includes(book.id)
                            return (
                              <label
                                key={book.id}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer border transition-colors ${
                                  isSelected
                                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                                    : 'bg-white border-gray-300 hover:bg-gray-100'
                                }`}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setFormData({
                                        ...formData,
                                        bookIds: [...formData.bookIds, book.id]
                                      })
                                    } else {
                                      setFormData({
                                        ...formData,
                                        bookIds: formData.bookIds.filter(id => id !== book.id)
                                      })
                                    }
                                  }}
                                  disabled={createCategoryMutation.isPending}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium">{book.name}</span>
                              </label>
                            )
                          })}
                        </div>
                        <p className="text-xs text-gray-500">
                          {formData.bookIds.length} book{formData.bookIds.length !== 1 ? 's' : ''} selected
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <Button 
                  type="submit" 
                  disabled={
                    createCategoryMutation.isPending || 
                    booksLoading || 
                    bookLoading ||
                    (bookIdFromUrl ? !selectedBook : booksData?.length === 0)
                  }
                  className="flex-1"
                >
                  {createCategoryMutation.isPending ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⟳</span>
                      Creating...
                    </span>
                  ) : (
                    "Create Category"
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (bookIdFromUrl) {
                      router.push(`/books/${bookIdFromUrl}`)
                    } else {
                      router.push("/categories")
                    }
                  }}
                  disabled={createCategoryMutation.isPending}
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

export default function CreateCategoryPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateCategoryForm />
    </Suspense>
  )
}