import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getBookById } from "@/actions/book-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { formatCurrency, formatDate } from "@/lib/utils"
import { 
  ArrowLeft, 
  PieChart, 
  BarChart,
  TrendingUp,
  Calendar,
  DollarSign
} from "lucide-react"
import { AppLayout } from "@/components/layout/app-layout"

interface BookReportsPageProps {
  params: {
    id: string
  }
}

export default async function BookReportsPage({ params }: BookReportsPageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getBookById(params.id)
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline">
              <Link href={`/books/${params.id}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Book
              </Link>
            </Button>
          </div>
          <Card>
            <CardContent className="p-6 text-center text-red-600">
              <p>Error: {result.error}</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    )
  }

  if (!result.book || !result.summary) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <p className="text-red-600">Book data not found</p>
        </div>
      </AppLayout>
    )
  }

  const { book, summary } = result

  // Calculate additional statistics
  const categoryBreakdown = book.categories.map(category => ({
    name: category.name,
    color: category.color || '#3b82f6',
    total: category.expenses.reduce((sum, exp) => sum + exp.amount, 0),
    count: category.expenses.length,
  }))

  // Get monthly breakdown
  const monthlyData = book.categories.flatMap(cat => cat.expenses).reduce((acc, exp) => {
    const month = new Date(exp.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    if (!acc[month]) acc[month] = 0
    acc[month] += exp.amount
    return acc
  }, {} as Record<string, number>)

  const sortedMonths = Object.entries(monthlyData)
    .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
    .slice(0, 6) // Last 6 months

  // Get top expenses
  const allExpenses = book.categories.flatMap(cat => 
    cat.expenses.map(exp => ({
      ...exp,
      categoryName: cat.name,
      categoryColor: cat.color || '#3b82f6',
    }))
  ).sort((a, b) => b.amount - a.amount).slice(0, 10)

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline">
              <Link href={`/books/${book.id}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Book
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">Reports - {book.name}</h1>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Spent</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {formatCurrency(summary.totalExpenses, book.currency)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Categories</p>
                  <p className="text-2xl font-bold text-green-600">
                    {summary.totalCategories}
                  </p>
                </div>
                <PieChart className="w-8 h-8 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Entries</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {summary.totalExpensesCount}
                  </p>
                </div>
                <BarChart className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Avg per Entry</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {summary.totalExpensesCount > 0 
                      ? formatCurrency(summary.totalExpenses / summary.totalExpensesCount, book.currency)
                      : '$0.00'
                    }
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-orange-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <p className="text-gray-600">No categories yet</p>
            ) : (
              <div className="space-y-3">
                {categoryBreakdown.map((cat, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-4 h-4 rounded-full" 
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.name}</span>
                      <span className="text-sm text-gray-600">({cat.count} entries)</span>
                    </div>
                    <span className="font-bold text-blue-600">
                      {formatCurrency(cat.total, book.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Monthly Trend */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Monthly Spending Trend (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            {sortedMonths.length === 0 ? (
              <p className="text-gray-600">No monthly data available</p>
            ) : (
              <div className="space-y-2">
                {sortedMonths.reverse().map(([month, total]) => (
                  <div key={month} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-gray-600" />
                      <span className="font-medium">{month}</span>
                    </div>
                    <span className="font-bold text-blue-600">
                      {formatCurrency(total, book.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Expenses */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Top 10 Largest Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            {allExpenses.length === 0 ? (
              <p className="text-gray-600">No expenses yet</p>
            ) : (
              <div className="space-y-2">
                {allExpenses.map((expense) => (
                  <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: expense.categoryColor }}
                        />
                        <span className="font-medium">{expense.description || "Untitled"}</span>
                        <span className="text-sm text-gray-600">({expense.categoryName})</span>
                      </div>
                      <div className="flex gap-2 items-center mt-1">
                        <p className="text-sm text-gray-600">{formatDate(expense.date)}</p>
                        {expense.paymentMethod && (
                          <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                            {expense.paymentMethod}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-bold text-green-600">
                      {formatCurrency(expense.amount, book.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/books/${book.id}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Book
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/categories?bookId=${book.id}`}>
                <PieChart className="w-4 h-4 mr-2" />
                View Categories
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/expenses?bookId=${book.id}`}>
                <DollarSign className="w-4 h-4 mr-2" />
                View All Expenses
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}