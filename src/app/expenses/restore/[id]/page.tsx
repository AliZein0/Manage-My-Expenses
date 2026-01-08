"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getExpenseById, restoreExpense } from "@/actions/expense-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { RotateCcw, ArrowLeft } from "lucide-react"

interface RestoreExpensePageProps {
  params: {
    id: string
  }
}

export default function RestoreExpensePage({ params }: RestoreExpensePageProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [expense, setExpense] = useState<any>(null)
  const [loadingExpense, setLoadingExpense] = useState(true)

  useEffect(() => {
    const fetchExpense = async () => {
      const result = await getExpenseById(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        router.back()
      } else {
        setExpense(result.expense)
      }
      setLoadingExpense(false)
    }
    fetchExpense()
  }, [params.id, router])

  const handleRestore = async () => {
    setIsLoading(true)
    try {
      const result = await restoreExpense(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: "Expense restored successfully!",
        })
        // Use browser history to go back
        if (typeof window !== 'undefined' && window.history.length > 1) {
          window.history.back()
        } else {
          router.push('/expenses')
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore expense",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back()
    } else {
      router.push('/expenses')
    }
  }

  if (loadingExpense) {
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
            onClick={handleCancel}
            disabled={isLoading}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold text-green-600">Restore Expense</h1>
        </div>

        <Card className="border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <RotateCcw className="w-6 h-6" />
              Confirm Restore Expense
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <p className="text-lg">
                Are you sure you want to restore this expense?
              </p>
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <p className="text-sm text-green-800 font-semibold">What happens:</p>
                <ul className="list-disc list-inside text-sm text-green-700 mt-2 space-y-1">
                  <li>The expense will appear in your main list again</li>
                  <li>It will be included in reports</li>
                  <li>All original data will be preserved</li>
                </ul>
              </div>
              {expense && (
                <>
                  <p className="text-sm text-gray-600">
                    Amount: <strong>${expense.amount.toFixed(2)}</strong>
                  </p>
                  <p className="text-sm text-gray-600">
                    Date: <strong>{new Date(expense.date).toLocaleDateString()}</strong>
                  </p>
                  <p className="text-sm text-gray-600">
                    Category: <strong>{expense.category.name}</strong>
                  </p>
                  {expense.description && (
                    <p className="text-sm text-gray-600">
                      Description: <strong>{expense.description}</strong>
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleRestore}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={isLoading}
              >
                {isLoading ? "Restoring..." : "Yes, Restore Expense"}
              </Button>
              <Button 
                variant="outline"
                onClick={handleCancel}
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