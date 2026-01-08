"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createCategory } from "@/actions/category-actions"
import { getBooks, getBookById } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { AppLayout } from "@/components/layout/app-layout"

function CreateCategoryForm() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  
  // Get bookId from URL parameter
  const bookIdFromUrl = searchParams.get("bookId")
  
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

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    bookId: bookIdFromUrl || "",
    color: "#3b82f6",
  })

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
    
    if (!formData.bookId) {
      toast({
        title: "Validation Error",
        description: "Please select a book",
        variant: "destructive",
      })
      return
    }

    // Create FormData and submit via mutation
    const formDataObj = new FormData()
    formDataObj.append("name", formData.name)
    formDataObj.append("description", formData.description)
    formDataObj.append("bookId", formData.bookId)
    formDataObj.append("color", formData.color)

    createCategoryMutation.mutate(formDataObj)
  }

  // selectedBook is now fetched directly when bookIdFromUrl is provided
  // For the dropdown case, find from booksData
  const selectedBookFromDropdown = booksData?.find(b => b.id === formData.bookId)

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-100">
          <div className="flex flex-row items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Create New Category</h1>
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
        <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
          <div className="p-6">
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

              {/* Book Selection */}
              <div className="space-y-2">
                <Label htmlFor="bookId" className="text-base font-semibold">
                  Book *
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
                  <Select
                    value={formData.bookId}
                    onValueChange={(value) => setFormData({ ...formData, bookId: value })}
                    disabled={createCategoryMutation.isPending || booksLoading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={booksLoading ? "Loading books..." : "Select a book"}>
                        {selectedBookFromDropdown?.name || "Select a book"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {booksData?.map((book) => (
                        <SelectItem key={book.id} value={book.id}>
                          {book.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {booksData?.length === 0 && !booksLoading && !bookIdFromUrl && (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md border border-red-200">
                    No books available.{" "}
                    <Link 
                      href="/books/create" 
                      className="font-medium underline hover:text-red-800"
                    >
                      Create a book first
                    </Link>
                  </div>
                )}
              </div>

              {/* Color Selection */}
              <div className="space-y-2">
                <Label htmlFor="color" className="text-base font-semibold">
                  Color
                </Label>
                <div className="flex gap-3 items-center">
                  <Input
                    id="color"
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    disabled={createCategoryMutation.isPending}
                    className="w-16 h-12 p-1 cursor-pointer"
                  />
                  <Input
                    type="text"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    placeholder="#3b82f6"
                    disabled={createCategoryMutation.isPending}
                    className="flex-1 font-mono"
                  />
                </div>
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