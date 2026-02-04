/* eslint-disable react/no-unescaped-entities */
import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { BookOpen, FolderGit2, Wallet, BarChart3, Plus, Archive, Eye, TrendingUp, Calendar } from "lucide-react"
import { getDashboardSummary } from "@/actions/report-actions"
import { formatCurrency, formatDate } from "@/lib/utils"

export default async function DashboardPage() {
  const session = await getAuthSession()

  if (!session) {
    redirect("/login")
  }

  // Fetch dashboard summary
  const summaryResult = await getDashboardSummary()
  const summary = summaryResult.error ? null : summaryResult.summary

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Welcome Header */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Welcome back, {session.user.name || session.user.email}!
          </p>
        </div>

        {/* Summary Stats */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-l-4 border-l-blue-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Books</CardTitle>
                <BookOpen className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">{summary.totalBooks}</div>
                <p className="text-xs text-muted-foreground">
                  Active expense books
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-green-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Categories</CardTitle>
                <FolderGit2 className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{summary.totalCategories}</div>
                <p className="text-xs text-muted-foreground">
                  Across all books
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-purple-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <Wallet className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">{summary.totalExpenses}</div>
                <p className="text-xs text-muted-foreground">
                  All time transactions
                </p>
              </CardContent>
            </Card>

            <Card className="border-l-4 border-l-orange-500">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <Calendar className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatCurrency(summary.currentMonthTotal, "USD")}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current month spending
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent Expenses */}
        {summary && summary.recentExpenses && summary.recentExpenses.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Recent Expenses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.recentExpenses.map((expense: any) => (
                  <div key={expense.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: expense.category.color || '#3b82f6' }}
                      />
                      <div>
                        <p className="font-medium">{expense.category.name}</p>
                        <p className="text-sm text-gray-600">
                          {expense.description || 'No description'} • {formatDate(expense.date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-600">
                        {formatCurrency(expense.amount, expense.category.book.currency)}
                      </p>
                      <p className="text-xs text-gray-500">{expense.category.book.name}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button asChild variant="outline" className="w-full">
                  <Link href="/expenses">View All Expenses</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Action Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Books Card */}
          <Card className="border-l-4 border-l-blue-500 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <BookOpen className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle className="text-xl">Books</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Organize your expenses into books like "Personal", "Business", or "Vacation".
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-blue-600 hover:bg-blue-700">
                  <Link href="/books" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> View
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/books/create" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Create
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/books/archived" className="flex items-center gap-2">
                    <Archive className="w-4 h-4" /> Archived
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Categories Card */}
          <Card className="border-l-4 border-l-green-500 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <FolderGit2 className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle className="text-xl">Categories</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Create categories to classify your expenses (e.g., Groceries, Utilities, Transport).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-green-600 hover:bg-green-700">
                  <Link href="/categories" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Manage
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/categories/create" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Expenses Card */}
          <Card className="border-l-4 border-l-purple-500 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Wallet className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle className="text-xl">Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Track your spending with amounts, dates, descriptions, and payment methods.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild className="bg-purple-600 hover:bg-purple-700">
                  <Link href="/expenses" className="flex items-center gap-2">
                    <Eye className="w-4 h-4" /> View
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/expenses/create" className="flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Add
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Reports Card */}
          <Card className="border-l-4 border-l-orange-500 hover:shadow-lg transition-shadow md:col-span-2 lg:col-span-3">
            <CardHeader className="flex flex-row items-center gap-3 pb-3">
              <div className="bg-orange-100 p-2 rounded-lg">
                <BarChart3 className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle className="text-xl">Detailed Reports & Analytics</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600 mb-4">
                Generate detailed reports with filters, category breakdowns, and export options.
              </p>
              <Button asChild className="bg-orange-600 hover:bg-orange-700 w-full sm:w-auto">
                <Link href="/reports" className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" /> View Detailed Reports
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Quick Start Guide */}
        <div className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-xl border border-gray-200">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">🚀 Quick Start Guide</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
              <span className="bg-blue-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span className="text-sm text-gray-700">Create a Book</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
              <span className="bg-green-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span className="text-sm text-gray-700">Add Categories</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
              <span className="bg-purple-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span className="text-sm text-gray-700">Record Expenses</span>
            </div>
            <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
              <span className="bg-orange-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold">4</span>
              <span className="text-sm text-gray-700">View Reports</span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}







