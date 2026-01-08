/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { restoreBook } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Archive, Undo } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

interface ArchivedBooksManagerProps {
  books: Array<{
    id: string
    name: string
    description: string | null
    currency: string
    createdAt: Date
    updatedAt: Date
    categories: Array<{
      id: string
      name: string
      expenses: Array<{
        id: string
        amount: number
      }>
    }>
  }>
}

export function ArchivedBooksManager({ books }: ArchivedBooksManagerProps) {
  const router = useRouter()
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const handleRestore = async (bookId: string) => {
    setRestoringId(bookId)
    try {
      const result = await restoreBook(bookId)
      
      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: result.message || "Book restored successfully!",
        })
        router.refresh()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to restore book",
        variant: "destructive",
      })
    } finally {
      setRestoringId(null)
    }
  }

  if (books.length === 0) {
    return (
      <div className="border-2 border-dashed border-amber-300 rounded-lg p-12 text-center bg-amber-50">
        <Archive className="w-12 h-12 mx-auto mb-4 text-amber-500" />
        <p className="text-amber-800 font-medium">No archived books found.</p>
      </div>
    )
  }

  return (
    <div className="border-2 border-amber-200 rounded-lg overflow-hidden shadow-sm bg-amber-50/30">
      <Table>
        <TableHeader className="bg-amber-100">
          <TableRow>
            <TableHead className="text-amber-900">Book Name</TableHead>
            <TableHead className="text-amber-900">Currency</TableHead>
            <TableHead className="text-amber-900">Categories</TableHead>
            <TableHead className="text-amber-900">Expenses</TableHead>
            <TableHead className="text-amber-900">Total</TableHead>
            <TableHead className="text-amber-900">Archived Date</TableHead>
            <TableHead className="text-right text-amber-900">Actions</TableHead>
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
                className={`bg-amber-50 hover:bg-amber-100/50 transition-colors ${index % 2 === 0 ? 'bg-amber-50' : 'bg-amber-100/30'}`}
              >
                <TableCell className="font-medium">
                  <div className="flex flex-col">
                    <span className="font-semibold text-amber-900">{book.name}</span>
                    {book.description && (
                      <span className="text-xs text-amber-700">{book.description}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="bg-amber-200 text-amber-900 border-amber-300">
                    {book.currency}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">
                    {book.categories.length}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">
                    {totalExpensesCount}
                  </Badge>
                </TableCell>
                <TableCell className="font-bold text-blue-600">
                  {formatCurrency(totalExpenses, book.currency)}
                </TableCell>
                <TableCell className="text-sm text-amber-800 font-medium">
                  {formatDate(book.updatedAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button 
                          variant="default" 
                          size="sm"
                          className="bg-amber-600 hover:bg-amber-700"
                          disabled={restoringId === book.id}
                        >
                          <Undo className="w-4 h-4 mr-2" />
                          {restoringId === book.id ? "Restoring..." : "Restore"}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Restore Book</DialogTitle>
                          <DialogDescription>
                            Are you sure you want to restore "{book.name}"? It will appear in your main books list again.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                          <Button variant="outline">Cancel</Button>
                          <Button 
                            variant="default" 
                            className="bg-amber-600 hover:bg-amber-700"
                            onClick={() => handleRestore(book.id)}
                            disabled={restoringId === book.id}
                          >
                            {restoringId === book.id ? "Restoring..." : "Restore Book"}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}