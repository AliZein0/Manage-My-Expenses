"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { updateExpense } from "@/actions/expense-actions"
import { getCategories } from "@/actions/category-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface EditExpenseFormProps {
  expense: {
    id: string
    amount: number
    date: Date
    description: string | null
    paymentMethod: string | null
    categoryId: string
    category: {
      id: string
      name: string
      bookId: string
      book: {
        id: string
        name: string
      }
    }
  }
}

export default function EditExpenseForm({ expense }: EditExpenseFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [categoriesLoading, setCategoriesLoading] = useState(false)
  const [categories, setCategories] = useState<any[]>([])
  const [formData, setFormData] = useState({
    amount: expense.amount.toString(),
    date: expense.date.toISOString().split('T')[0],
    description: expense.description || "",
    paymentMethod: expense.paymentMethod || "",
    categoryId: expense.categoryId,
  })

  const loadCategories = useCallback(async () => {
    setCategoriesLoading(true)
    try {
      const result = await getCategories()
      if (result.categories) {
        const filteredCategories = result.categories.filter(
          cat => cat.bookId === expense.category.bookId
        )
        setCategories(filteredCategories)
      }
    } finally {
      setCategoriesLoading(false)
    }
  }, [expense.category.bookId])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast({
        title: "Validation Error",
        description: "Amount must be a positive number",
        variant: "destructive",
      })
      return
    }

    if (!formData.date) {
      toast({
        title: "Validation Error",
        description: "Date is required",
        variant: "destructive",
      })
      return
    }

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

    if (!formData.categoryId) {
      toast({
        title: "Validation Error",
        description: "Category is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const formDataObj = new FormData()
      formDataObj.append("amount", formData.amount)
      formDataObj.append("date", formData.date)
      formDataObj.append("description", formData.description)
      formDataObj.append("paymentMethod", formData.paymentMethod)
      formDataObj.append("categoryId", formData.categoryId)

      const result = await updateExpense(expense.id, formDataObj)

      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: "Expense updated successfully!",
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
        description: "Failed to update expense",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          onClick={() => router.back()}
          disabled={isLoading}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Edit Expense</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Information</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Book:</span> {expense.category.book.name}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount" className="text-base font-semibold">
                Amount *
              </Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                disabled={isLoading}
                required
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date" className="text-base font-semibold">
                Date *
              </Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                disabled={isLoading}
                required
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="categoryId" className="text-base font-semibold">
                Category *
              </Label>
              <Select
                value={formData.categoryId}
                onValueChange={(value) => setFormData({ ...formData, categoryId: value })}
                disabled={isLoading || categories.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a category">
                    {categories.find(c => c.id === formData.categoryId)?.name || "Select a category"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {categories.length === 0 && (
                <p className="text-sm text-red-600">
                  No categories available in this book.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-base font-semibold">
                Description
              </Label>
              <Textarea
                id="description"
                placeholder="What was this expense for?"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                disabled={isLoading}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod" className="text-base font-semibold">
                Payment Method
              </Label>
              <Select
                value={formData.paymentMethod || "Cash"}
                onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}
                disabled={isLoading}
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

            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <Button 
                type="submit" 
                disabled={isLoading || categories.length === 0}
                className="flex-1"
              >
                {isLoading ? "Updating..." : "Update Expense"}
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
