/* eslint-disable react/no-unescaped-entities */
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { deleteBook } from "@/actions/book-actions"
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
import { Trash2 } from "lucide-react"

interface DeleteBookButtonProps {
  bookId: string
  bookName: string
}

export function DeleteBookButton({ bookId, bookName }: DeleteBookButtonProps) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteBook(bookId)
      
      if (result?.error) {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      } else if (result?.success) {
        toast({
          title: "Success",
          description: result.message || "Book archived successfully!",
        })
        router.push("/books")
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
        description: "Failed to archive book",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setIsOpen(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive Book</DialogTitle>
          <DialogDescription>
            Are you sure you want to archive "{bookName}"? The book will be hidden from your main list but can be restored later from the archived books section.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
            {isDeleting ? "Archiving..." : "Archive Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
