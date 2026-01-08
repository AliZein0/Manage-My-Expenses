"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { updateBook } from "@/actions/book-actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "@/components/ui/use-toast"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { CurrencySelector } from "@/components/currency-selector"

interface EditBookFormProps {
  book: {
    id: string
    name: string
    description: string | null
    currency: string
  }
}

export default function EditBookForm({ book }: EditBookFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: book.name,
    description: book.description || "",
    currency: book.currency,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Client-side validation
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Book name is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)

    try {
      const formDataObj = new FormData()
      formDataObj.append("name", formData.name)
      formDataObj.append("description", formData.description)
      formDataObj.append("currency", formData.currency)

      const result = await updateBook(book.id, formDataObj)

      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: "Book updated successfully!",
        })
        router.push(`/books/${book.id}`)
        router.refresh()
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
        description: "Failed to update book",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button asChild variant="outline">
            <Link href={`/books/${book.id}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Edit Book</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Book Information</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Book Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-base font-semibold">
                  Book Name *
                </Label>
                <Input
                  id="name"
                  placeholder="e.g., Personal Expenses, Business Budget"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  disabled={isLoading}
                  required
                  className="text-lg"
                />
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-base font-semibold">
                  Description
                </Label>
                <Textarea
                  id="description"
                  placeholder="Optional description or notes about this book"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  disabled={isLoading}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label htmlFor="currency" className="text-base font-semibold">
                  Currency
                </Label>
                <CurrencySelector
                  value={formData.currency}
                  onChange={(value) => setFormData({ ...formData, currency: value })}
                  disabled={isLoading}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="flex-1"
                >
                  {isLoading ? "Updating..." : "Update Book"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/books/${book.id}`)}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}