import { getAuthSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import { getBooks, getArchivedBooks } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import { formatCurrency } from "@/lib/utils"
import Link from "next/link"
import { AppLayout } from "@/components/layout/app-layout"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default async function BooksPage() {
  const session = await getAuthSession()
  if (!session) redirect("/login")

  const result = await getBooks()
  if (result.error) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Books</h1>
          </div>
          <p className="text-red-600">Error: {result.error}</p>
        </div>
      </AppLayout>
    )
  }

  const books = result.books || []

  // Get archived books count for display
  const archivedResult = await getArchivedBooks()
  const archivedCount = archivedResult.books?.length || 0

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-lg border border-blue-100">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Books</h1>
            {archivedCount > 0 && (
              <p className="text-sm text-gray-600 mt-1">
                {archivedCount} book{archivedCount !== 1 ? "s" : ""} archived
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {archivedCount > 0 && (
              <Button asChild variant="outline" className="bg-white hover:bg-gray-50">
                <Link href="/books/archived">
                  View Archived ({archivedCount})
                </Link>
              </Button>
            )}
            <Button asChild className="bg-blue-600 hover:bg-blue-700">
              <Link href="/books/create">Create Book</Link>
            </Button>
          </div>
        </div>

        {books.length === 0 ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center bg-gray-50">
            <p className="text-gray-600 text-lg">No books yet. Create your first book to get started!</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden shadow-sm bg-white">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="text-gray-700">Book Name</TableHead>
                  <TableHead className="text-gray-700">Currency</TableHead>
                  <TableHead className="text-gray-700">Categories</TableHead>
                  <TableHead className="text-gray-700">Expenses</TableHead>
                  <TableHead className="text-gray-700">Total</TableHead>
                  <TableHead className="text-right text-gray-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {books.map((book, index) => {
                  const totalExpenses = book.categories.reduce(
                    (acc, cat) => acc + cat.expenses.reduce((sum, exp) => sum + exp.amount, 0),
                    0
                  )
                  const totalExpensesCount = book.categories.reduce(
                    (acc, cat) => acc + cat.expenses.length,
                    0
                  )
                  
                  return (
                    <TableRow 
                      key={book.id} 
                      className={`hover:bg-blue-50/50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}
                    >
                      <TableCell className="font-medium">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-900">{book.name}</span>
                          {book.description && (
                            <span className="text-xs text-gray-500">{book.description}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
                          {book.currency}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          {book.categories.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          {totalExpensesCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-blue-600 text-lg">
                        {formatCurrency(totalExpenses, book.currency)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end flex-wrap">
                          <Button asChild size="sm" variant="ghost" className="hover:bg-blue-100">
                            <Link href={`/books/${book.id}`}>View</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="hover:bg-blue-100">
                            <Link href={`/books/${book.id}/reports`}>Reports</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="hover:bg-green-100">
                            <Link href={`/categories/create?bookId=${book.id}`}>Add Category</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="hover:bg-purple-100">
                            <Link href={`/categories?bookId=${book.id}`}>Categories</Link>
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="hover:bg-orange-100">
                            <Link href={`/expenses?bookId=${book.id}`}>Expenses</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </AppLayout>
  )
}