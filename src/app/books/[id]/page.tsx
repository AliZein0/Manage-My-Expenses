import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getBookById } from "@/actions/book-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { formatCurrency, formatDate } from "@/lib/utils"
import { 
  Calendar, 
  DollarSign, 
  Tag, 
  FileText, 
  ArrowLeft, 
  Edit, 
  Trash2,
  PieChart,
  Plus
} from "lucide-react"
import { DeleteBookButton } from "@/components/delete-book-button"
import { AppLayout } from "@/components/layout/app-layout"

interface BookDetailsPageProps {
  params: {
    id: string
  }
}

export default async function BookDetailsPage({ params }: BookDetailsPageProps) {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getBookById(params.id)
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline">
              <Link href="/books">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Books
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

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="outline">
              <Link href="/books">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Books
              </Link>
            </Button>
            <h1 className="text-3xl font-bold">{book.name}</h1>
            {book.isArchived && (
              <Badge variant="destructive">Archived</Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href={`/books/${book.id}/edit`}>
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Link>
            </Button>
            <DeleteBookButton bookId={book.id} bookName={book.name} />
          </div>
        </div>

        {/* Book Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Book Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <FileText className="w-4 h-4" />
                <span>Description</span>
              </div>
              <p className="text-gray-900">
                {book.description || "No description provided"}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <DollarSign className="w-4 h-4" />
                <span>Currency</span>
              </div>
              <p className="text-gray-900 font-mono">{book.currency}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Calendar className="w-4 h-4" />
                <span>Created</span>
              </div>
              <p className="text-gray-900">{formatDate(book.createdAt)}</p>
            </div>
            <div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                <Tag className="w-4 h-4" />
                <span>Owner</span>
              </div>
              <p className="text-gray-900">{book.user.name} ({book.user.email})</p>
            </div>
          </CardContent>
        </Card>

        {/* Summary Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Expenses</p>
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
                <Tag className="w-8 h-8 text-green-600 opacity-50" />
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
                <FileText className="w-8 h-8 text-purple-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Categories and Expenses */}
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Categories & Expenses</h2>
            <div className="flex gap-2">
              <Button asChild>
                <Link href={`/categories/create?bookId=${book.id}`}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Category
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/expenses/create?bookId=${book.id}`}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Expense
                </Link>
              </Button>
            </div>
          </div>

          {book.categories.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-600">
                <p>No categories yet. Create your first category to get started!</p>
                <Button asChild className="mt-4">
                  <Link href={`/categories/create?bookId=${book.id}`}>Create Category</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {book.categories.map((category) => (
                <Card key={category.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: category.color || '#3b82f6' }}
                        />
                        <span>{category.name}</span>
                        <Badge variant="secondary">
                          {category.expenses.length} expenses
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/categories/edit/${category.id}`}>
                            <Edit className="w-3 h-3 mr-1" />
                            Edit
                          </Link>
                        </Button>
                        <Button asChild size="sm">
                          <Link href={`/expenses/create?bookId=${book.id}&categoryId=${category.id}`}>
                            <Plus className="w-3 h-3 mr-1" />
                            Add Expense
                          </Link>
                        </Button>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {category.description && (
                      <p className="text-sm text-gray-600 mb-4">
                        {category.description}
                      </p>
                    )}
                    
                    {category.expenses.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">
                        No expenses in this category yet
                      </p>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {category.expenses.map((expense) => (
                            <div 
                              key={expense.id} 
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:border-blue-200 transition-colors"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {expense.description || "Untitled Expense"}
                                </p>
                                <div className="flex gap-2 items-center mt-1">
                                  <p className="text-sm text-gray-600">
                                    {formatDate(expense.date)}
                                  </p>
                                  {expense.paymentMethod && (
                                    <span className="text-xs bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded">
                                      {expense.paymentMethod}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-green-600">
                                  {formatCurrency(expense.amount, book.currency)}
                                </span>
                                <Button asChild variant="ghost" size="sm">
                                  <Link href={`/expenses/edit/${expense.id}`}>
                                    <Edit className="w-3 h-3" />
                                  </Link>
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {category.expenses.length > 0 && (
                          <Button asChild variant="outline" size="sm" className="w-full">
                            <Link href={`/expenses?bookId=${book.id}&categoryId=${category.id}`}>
                              View All Expenses
                            </Link>
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/books/${book.id}/reports`}>
                <PieChart className="w-4 h-4 mr-2" />
                View Reports
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/categories/create?bookId=${book.id}`}>
                <Tag className="w-4 h-4 mr-2" />
                Add Category
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/categories?bookId=${book.id}`}>
                <Tag className="w-4 h-4 mr-2" />
                View Categories
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/expenses/create?bookId=${book.id}`}>
                <DollarSign className="w-4 h-4 mr-2" />
                Add Expense
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/expenses?bookId=${book.id}`}>
                <DollarSign className="w-4 h-4 mr-2" />
                View Expenses
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}