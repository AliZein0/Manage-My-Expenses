"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getExpenseById, permanentDeleteExpense } from "@/actions/expense-actions"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { Trash2, ArrowLeft } from "lucide-react"

interface PermanentDeleteExpensePageProps {
  params: {
    id: string
  }
}

export default function PermanentDeleteExpensePage({ params }: PermanentDeleteExpensePageProps) {
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

  const handlePermanentDelete = async () => {
    setIsLoading(true)
    try {
      const result = await permanentDeleteExpense(params.id)
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: "Expense permanently deleted!",
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
        description: "Failed to delete expense",
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
          <h1 className="text-3xl font-bold text-red-600">Permanently Delete Expense</h1>
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
                Are you sure you want to permanently delete this expense?
              </p>
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm text-red-800 font-semibold">This will:</p>
                <ul className="list-disc list-inside text-sm text-red-700 mt-2 space-y-1">
                  <li>Permanently remove the expense from the database</li>
                  <li>Cannot be restored or undone</li>
                  <li>Will affect all reports and summaries</li>
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
                onClick={handlePermanentDelete}
                variant="destructive"
                className="flex-1"
                disabled={isLoading}
              >
                {isLoading ? "Deleting..." : "Yes, Permanently Delete"}
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