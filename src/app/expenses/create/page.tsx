"use client"

import React, { useState, useEffect, useCallback, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { createExpense } from "@/actions/expense-actions"
import { getCategories } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { AppLayout } from "@/components/layout/app-layout"

function CreateExpenseForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isLoading, setIsLoading] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [formData, setFormData] = useState({
    amount: "",
    date: new Date().toISOString().split('T')[0],
    description: "",
    paymentMethod: "Cash",
    categoryId: "",
  })

  // Get bookId and categoryId from URL
  const bookId = searchParams.get("bookId")
  const categoryId = searchParams.get("categoryId")

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true)
    try {
      const result = await getCategories()
      if (result.categories) {
        // Filter categories by bookId if provided
        let filteredCategories = result.categories
        if (bookId) {
          filteredCategories = result.categories.filter(cat => cat.bookId === bookId)
        }
        setCategories(filteredCategories)
        
        // Pre-select category from URL parameter or first available
        if (categoryId) {
          setFormData(prev => ({ ...prev, categoryId }))
        } else if (filteredCategories.length > 0) {
          setFormData(prev => ({ ...prev, categoryId: filteredCategories[0].id }))
        }
      }
    } finally {
      setCategoriesLoading(false)
    }
  }, [bookId, categoryId])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate date is not in the future
    const selectedDate = new Date(formData.date)
    const today = new Date()
    
    // Compare only the date part (year, month, day) to avoid timezone issues
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate())
    
    // Allow today, but not tomorrow or later
    if (selectedDateOnly > todayDateOnly) {
      toast({
        title: "Validation Error",
        description: "Expense date cannot be in the future",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    const formDataObj = new FormData()
    formDataObj.append("amount", formData.amount)
    formDataObj.append("date", formData.date)
    formDataObj.append("description", formData.description)
    formDataObj.append("paymentMethod", formData.paymentMethod)
    formDataObj.append("categoryId", formData.categoryId)

    const result = await createExpense(formDataObj)

    if (result.error) {
      toast({
        title: "Error",
        description: result.error,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Success",
        description: "Expense added successfully!",
      })
      router.push("/expenses")
      router.refresh()
    }

    setIsLoading(false)
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {bookId && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <p className="text-sm text-green-800">
              Adding expense to book: <span className="font-semibold">{categories[0]?.book?.name || "Loading..."}</span>
            </p>
          </div>
        )}
        <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-6 rounded-lg border border-slate-200">
          <div className="flex flex-row items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">Add New Expense</h1>
            <Button 
              variant="outline" 
              onClick={loadCategories}
              disabled={categoriesLoading}
              size="sm"
              className="bg-white hover:bg-gray-50"
            >
              {categoriesLoading ? "Refreshing..." : "Refresh Categories"}
            </Button>
          </div>
        </div>
        <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
          <div className="p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date *</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="categoryId">Category *</Label>
                <Select
                  value={formData.categoryId}
                  onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                  disabled={categories.length === 0}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category">
                      {categories.find(c => c.id === formData.categoryId)?.name || "Select a category"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name} {!bookId && `(${category.book.name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {categories.length === 0 && (
                  <p className="text-sm text-red-600">
                    No categories available.{" "}
                    <Link 
                      href={bookId ? `/categories/create?bookId=${bookId}` : "/categories/create"} 
                      className="font-medium underline hover:text-red-800"
                    >
                      Create a category first
                    </Link>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="What was this expense for?"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                <Select
                  value={formData.paymentMethod}
                  onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select payment method">
                      {formData.paymentMethod || "Cash"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Wire Transfer">Wire Transfer</SelectItem>
                    <SelectItem value="PayPal">PayPal</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 pt-4 border-t border-gray-200">
                <Button type="submit" disabled={isLoading || categories.length === 0} className="flex-1">
                  {isLoading ? "Adding..." : "Add Expense"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (bookId) {
                      router.push(`/books/${bookId}`)
                    } else {
                      router.push("/expenses")
                    }
                  }}
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

export default function CreateExpensePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CreateExpenseForm />
    </Suspense>
  )
}