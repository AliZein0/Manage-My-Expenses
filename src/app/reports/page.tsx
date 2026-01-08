"use client"

import { useState, useEffect } from "react"
import { getDetailedReport } from "@/actions/report-actions"
import { getBooks } from "@/actions/book-actions"
import { getCategories } from "@/actions/category-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { formatCurrency, formatDate } from "@/lib/utils"
import { AppLayout } from "@/components/layout/app-layout"
import { Download, Filter } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export default function ReportsPage() {
  const [books, setBooks] = useState<any[]>([])
  const [bookCategories, setBookCategories] = useState<any[]>([])
  const [selectedBookId, setSelectedBookId] = useState("")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [detailedReport, setDetailedReport] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [categoriesLoading, setCategoriesLoading] = useState(false)

  // Load books on mount
  useEffect(() => {
    loadBooks()
  }, [])

  // Load categories when book changes
  useEffect(() => {
    if (selectedBookId) {
      loadCategories(selectedBookId)
    } else {
      setBookCategories([])
      setSelectedCategories([])
    }
  }, [selectedBookId])

  const loadBooks = async () => {
    try {
      const result = await getBooks()
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        setBooks(result.books || [])
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load books",
        variant: "destructive",
      })
    }
  }

  const loadCategories = async (bookId: string) => {
    setCategoriesLoading(true)
    try {
      const result = await getCategories()
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        const filtered = result.categories?.filter(cat => cat.bookId === bookId) || []
        setBookCategories(filtered)
      }
    } finally {
      setCategoriesLoading(false)
    }
  }

  const handleCategoryToggle = (categoryId: string) => {
    setSelectedCategories(prev => 
      prev.includes(categoryId) 
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    )
  }

  const generateReport = async () => {
    if (!selectedBookId) {
      toast({
        title: "Validation Error",
        description: "Please select a book",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      const result = await getDetailedReport({
        bookId: selectedBookId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        categories: selectedCategories.length > 0 ? selectedCategories : undefined,
      })
      
      if (result.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else {
        setDetailedReport(result)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const exportToCSV = (report: any) => {
    if (!report || !report.expenses || report.expenses.length === 0) {
      toast({
        title: "No Data",
        description: "There are no expenses to export",
        variant: "destructive",
      })
      return
    }

    // Create CSV header
    const headers = ['Date', 'Category', 'Description', 'Payment Method', 'Amount', 'Currency']
    
    // Create CSV rows
    const rows = report.expenses.map((exp: any) => [
      formatDate(exp.date),
      exp.category.name,
      exp.description || '',
      exp.paymentMethod || '',
      exp.amount.toFixed(2),
      report.currency || 'USD'
    ])

    // Add summary row
    const summaryRow = [
      'TOTAL',
      '',
      '',
      '',
      report.totalAmount.toFixed(2),
      report.currency || 'USD'
    ]

    // Combine headers, rows, and summary
    const csvContent = [
      headers,
      ...rows,
      [],
      summaryRow
    ]
      .map(row => row.map((cell: any) => `"${cell}"`).join(','))
      .join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    // Generate filename with date
    const date = new Date().toISOString().split('T')[0]
    const bookName = report.expenses[0]?.category?.book?.name || 'Report'
    const filename = `${bookName}_expenses_${date}.csv`
    
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Success",
      description: "Report exported successfully!",
    })
  }

  const exportCategoryBreakdownCSV = (report: any) => {
    if (!report || !report.categories || report.categories.length === 0) {
      toast({
        title: "No Data",
        description: "There are no categories to export",
        variant: "destructive",
      })
      return
    }

    // Create CSV header
    const headers = ['Category', 'Transaction Count', 'Total Amount', 'Currency']
    
    // Create CSV rows
    const rows = report.categories.map((cat: any) => [
      cat.name,
      cat.count.toString(),
      cat.total.toFixed(2),
      report.currency || 'USD'
    ])

    // Add summary row
    const summaryRow = [
      'TOTAL',
      report.expenses.length.toString(),
      report.totalAmount.toFixed(2),
      report.currency || 'USD'
    ]

    // Combine headers, rows, and summary
    const csvContent = [
      headers,
      ...rows,
      [],
      summaryRow
    ]
      .map(row => row.map((cell: any) => `"${cell}"`).join(','))
      .join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    // Generate filename with date
    const date = new Date().toISOString().split('T')[0]
    const bookName = report.expenses[0]?.category?.book?.name || 'Report'
    const filename = `${bookName}_category_breakdown_${date}.csv`
    
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    toast({
      title: "Success",
      description: "Category breakdown exported successfully!",
    })
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Reports & Analytics</h1>
          <Button variant="outline" asChild>
            <Link href="/dashboard">← Back to Dashboard</Link>
          </Button>
        </div>

        {/* Filter Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filter Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Book Selection (Required) */}
                <div>
                  <Label htmlFor="bookId" className="font-semibold">Book *</Label>
                  <select 
                    value={selectedBookId}
                    onChange={(e) => setSelectedBookId(e.target.value)}
                    className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">Select a book...</option>
                    {books.map((book) => (
                      <option key={book.id} value={book.id}>
                        {book.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div>
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                {/* End Date */}
                <div>
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>

                {/* Categories (Multi-select) - Shows instantly after book selection */}
                <div className="md:col-span-2 lg:col-span-3">
                  <Label htmlFor="categories">Categories (Select multiple)</Label>
                  {selectedBookId ? (
                    categoriesLoading ? (
                      <p className="text-sm text-gray-500 mt-2 italic">Loading categories...</p>
                    ) : bookCategories.length > 0 ? (
                      <>
                        <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-md bg-gray-50">
                          {bookCategories.map((category) => {
                            const isSelected = selectedCategories.includes(category.id)
                            return (
                              <label 
                                key={category.id} 
                                className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer border transition-colors ${
                                  isSelected 
                                    ? 'bg-blue-100 border-blue-300 text-blue-800' 
                                    : 'bg-white border-gray-300 hover:bg-gray-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleCategoryToggle(category.id)}
                                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: category.color || '#3b82f6' }}
                                />
                                <span className="text-sm font-medium">{category.name}</span>
                              </label>
                            )
                          })}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {selectedCategories.length} category(ies) selected
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 mt-2 italic">
                        No categories available in this book yet.
                      </p>
                    )
                  ) : (
                    <p className="text-sm text-gray-500 mt-2 italic">
                      Select a book first to see categories.
                    </p>
                  )}
                </div>

                {/* Generate Report Button */}
                <div className="flex items-end md:col-span-2 lg:col-span-3">
                  <Button 
                    onClick={generateReport} 
                    disabled={isLoading || !selectedBookId}
                    className="w-full"
                  >
                    {isLoading ? "Generating..." : "Generate Report"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Detailed Report Section */}
        {detailedReport && (
          <>
            {/* Summary Cards */}
            <Card>
              <CardHeader>
                <CardTitle>Report Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <p className="text-sm text-gray-600">Total Amount</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(detailedReport.totalAmount, detailedReport.currency || "USD")}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-gray-600">Total Transactions</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {detailedReport.expenses.length}
                    </p>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                    <p className="text-sm text-gray-600">Categories</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {detailedReport.categories.length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Category Breakdown</span>
                  <Button variant="outline" size="sm" onClick={() => exportCategoryBreakdownCSV(detailedReport)}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {detailedReport.categories.map((category: any) => (
                    <Card key={category.name} className="border-green-200">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-lg">{category.name}</p>
                            <p className="text-sm text-gray-600">{category.count} transactions</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-green-600 text-lg">
                              {formatCurrency(category.total, detailedReport.currency)}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Detailed Expenses Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Detailed Expenses</span>
                  <Button variant="outline" size="sm" onClick={() => exportToCSV(detailedReport)}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {detailedReport.expenses.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-gray-200 bg-gray-50">
                          <th className="text-left p-3 font-semibold">Date</th>
                          <th className="text-left p-3 font-semibold">Category</th>
                          <th className="text-left p-3 font-semibold">Description</th>
                          <th className="text-left p-3 font-semibold">Payment</th>
                          <th className="text-right p-3 font-semibold">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailedReport.expenses.map((exp: any, index: number) => (
                          <tr key={exp.id} className={`border-b hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
                            <td className="p-3">{formatDate(exp.date)}</td>
                            <td className="p-3">
                              <span className="inline-flex items-center gap-2">
                                <span 
                                  className="w-2 h-2 rounded-full" 
                                  style={{ backgroundColor: exp.category.color || '#3b82f6' }}
                                />
                                {exp.category.name}
                              </span>
                            </td>
                            <td className="p-3 text-gray-600">{exp.description || "-"}</td>
                            <td className="p-3">
                              {exp.paymentMethod ? (
                                <span className="text-xs bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">
                                  {exp.paymentMethod}
                                </span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-right font-bold text-green-600">
                              {formatCurrency(exp.amount, exp.category.book.currency)}
                            </td>
                          </tr>
                        ))}
                        {/* Total Row */}
                        <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold">
                          <td colSpan={4} className="p-3 text-right text-gray-700">TOTAL:</td>
                          <td className="p-3 text-right text-green-700 text-lg">
                            {formatCurrency(detailedReport.totalAmount, detailedReport.currency)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-8">No expenses found for the selected filters.</p>
                )}
              </CardContent>
            </Card>
          </>
        )}



        {/* Quick Actions */}
        <div className="mt-8 p-6 bg-green-50 rounded-lg border border-green-200">
          <h3 className="font-semibold mb-3">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="bg-green-600 hover:bg-green-700">
              <Link href="/books/create">Create Book</Link>
            </Button>
            <Button asChild className="bg-green-600 hover:bg-green-700">
              <Link href="/categories/create">Create Category</Link>
            </Button>
            <Button asChild className="bg-green-600 hover:bg-green-700">
              <Link href="/expenses/create">Add Expense</Link>
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}