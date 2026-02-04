import { getAuthSession } from "@/lib/auth"
import { redirect, notFound } from "next/navigation"
import { getExpenses } from "@/actions/expense-actions"
import { getCategories } from "@/actions/category-actions"
import { getBookById } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { formatCurrency, formatDate } from "@/lib/utils"
import { AppLayout } from "@/components/layout/app-layout"
import { Badge } from "@/components/ui/badge"
import { CategoryIcon } from "@/components/ui/category-icon"
import { Eye, EyeOff } from "lucide-react"
import { getPrismaClient } from "@/lib/prisma"

interface ExpensesPageProps {
  searchParams: {
    bookId?: string
    categoryId?: string
    showDisabled?: string
  }
}

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const bookId = searchParams.bookId
  const categoryId = searchParams.categoryId
  const showDisabled = searchParams.showDisabled === "true"

  // If bookId is provided, get the book details
  let book = null
  if (bookId) {
    const bookResult = await getBookById(bookId)
    if (bookResult.error) {
      notFound()
    }
    book = bookResult.book
  }

  const expensesResult = await getExpenses()
  const categoriesResult = await getCategories()

  if (expensesResult.error || categoriesResult.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Expenses</h1>
          </div>
          <p className="text-red-600">
            Error: {expensesResult.error || categoriesResult.error}
          </p>
        </div>
      </AppLayout>
    )
  }

  let expenses = expensesResult.expenses as any[] || []
  let categories = categoriesResult.categories as any[] || []

  // Filter by bookId if provided
  if (bookId) {
    expenses = expenses.filter(exp => exp.category.bookId === bookId)
    categories = categories.filter(cat => cat.bookId === bookId)
  }

  // Filter by categoryId if provided
  if (categoryId) {
    expenses = expenses.filter(exp => exp.categoryId === categoryId)
  }

  // Get disabled expenses if requested
  let disabledExpenses: any[] = []
  if (showDisabled) {
    const prisma = getPrismaClient()
    disabledExpenses = await prisma.expense.findMany({
      where: {
        ...(bookId ? { category: { bookId } } : {}),
        ...(categoryId ? { categoryId } : {}),
        isDisabled: true,
        category: {
          isDisabled: false,
          book: {
            userId: session.user.id,
            isArchived: false,
          },
        },
      },
      include: {
        category: {
          include: {
            book: true,
          },
        },
      },
      orderBy: { date: "desc" },
    })
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 p-6 rounded-lg border border-purple-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {book ? `Expenses - ${book.name}` : "Expenses"}
            </h1>
            {book && (
              <p className="text-gray-600 mt-1">Book: <span className="font-semibold">{book.name}</span></p>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              asChild
              className="bg-white hover:bg-gray-50"
            >
              <Link 
                href={{
                  pathname: "/expenses",
                  query: { 
                    bookId: bookId || "",
                    categoryId: categoryId || "",
                    showDisabled: !showDisabled 
                  }
                }}
              >
                {showDisabled ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
                {showDisabled ? "Hide Disabled" : "Show Disabled"}
              </Link>
            </Button>
            <Button asChild className="bg-purple-600 hover:bg-purple-700">
              <Link href={bookId ? `/expenses/create?bookId=${bookId}` : "/expenses/create"}>
                Add Expense
              </Link>
            </Button>
          </div>
        </div>

        {/* Active Expenses */}
        {expenses.length === 0 ? (
          <div className="border-2 border-dashed border-purple-300 rounded-lg p-12 text-center bg-purple-50">
            <p className="text-purple-800 text-lg font-medium">No active expenses yet. Add your first expense to get started!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-purple-800 bg-purple-50 p-3 rounded-lg border border-purple-200">Active Expenses</h2>
            <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-purple-200 bg-purple-50">
                    <th className="text-left p-3 font-semibold text-purple-900">Date</th>
                    <th className="text-left p-3 font-semibold text-purple-900">Category</th>
                    <th className="text-left p-3 font-semibold text-purple-900">Description</th>
                    <th className="text-left p-3 font-semibold text-purple-900">Book</th>
                    <th className="text-right p-3 font-semibold text-purple-900">Amount</th>
                    <th className="text-right p-3 font-semibold text-purple-900">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((expense, index) => (
                    <tr 
                      key={expense.id} 
                      className={`border-b hover:bg-purple-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-purple-50/20'}`}
                    >
                      <td className="p-3 text-gray-700">{formatDate(expense.date)}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2">
                          <CategoryIcon iconName={expense.category.icon} className="w-4 h-4 text-gray-600" />
                          <span className="font-medium text-gray-900">{expense.category.name}</span>
                        </span>
                      </td>
                      <td className="p-3 text-gray-600">
                        {expense.description || <span className="text-gray-400 italic">No description</span>}
                        {expense.paymentMethod && (
                          <div className="mt-1">
                            <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-300 text-xs">
                              💳 {expense.paymentMethod}
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-gray-600">{expense.category.book?.name || "N/A"}</td>
                      <td className="p-3 text-right font-bold text-purple-600 text-lg">
                        {formatCurrency(expense.amount, expense.category.book?.currency || "USD")}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="outline" size="sm" asChild className="hover:bg-yellow-100">
                            <Link href={`/expenses/edit/${expense.id}`}>Edit</Link>
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm" 
                            asChild
                            className="hover:bg-red-100"
                          >
                            <Link href={`/expenses/delete/${expense.id}`}>Disable</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disabled Expenses */}
        {showDisabled && disabledExpenses.length > 0 && (
          <div className="space-y-4 mt-8">
            <h2 className="text-xl font-semibold text-gray-600 bg-gray-100 p-3 rounded-lg border border-gray-300">Disabled Expenses</h2>
            <div className="border-2 border-gray-300 rounded-lg overflow-hidden shadow-sm bg-gray-50/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-200">
                    <th className="text-left p-3 font-semibold text-gray-700">Date</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Category</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Description</th>
                    <th className="text-left p-3 font-semibold text-gray-700">Book</th>
                    <th className="text-right p-3 font-semibold text-gray-700">Amount</th>
                    <th className="text-right p-3 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disabledExpenses.map((expense, index) => (
                    <tr 
                      key={expense.id} 
                      className={`border-b opacity-75 ${index % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100/50'}`}
                    >
                      <td className="p-3 text-gray-500 line-through">{formatDate(expense.date)}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2 text-gray-500 line-through">
                          <CategoryIcon iconName={expense.category.icon} className="w-4 h-4 text-gray-400" />
                          <span className="font-medium">{expense.category.name}</span>
                        </span>
                      </td>
                      <td className="p-3 text-gray-500 line-through">
                        {expense.description || <span className="text-gray-400 italic">No description</span>}
                        {expense.paymentMethod && (
                          <div className="mt-1">
                            <Badge variant="outline" className="bg-gray-200 text-gray-600 border-gray-300 text-xs line-through">
                              💳 {expense.paymentMethod}
                            </Badge>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-gray-500 line-through">{expense.category.book.name}</td>
                      <td className="p-3 text-right font-semibold text-gray-500 line-through">
                        {formatCurrency(expense.amount, expense.category.book.currency)}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-1 justify-end">
                          <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-300">Disabled</Badge>
                          <Button variant="outline" size="sm" asChild className="hover:bg-blue-100">
                            <Link href={`/expenses/restore/${expense.id}`}>Restore</Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div>
          <Button variant="outline" asChild className="bg-white hover:bg-gray-50">
            <Link href={bookId ? `/books/${bookId}` : "/dashboard"}>
              ← Back to {bookId ? "Book" : "Dashboard"}
            </Link>
          </Button>
        </div>
      </div>
    </AppLayout>
  )
}