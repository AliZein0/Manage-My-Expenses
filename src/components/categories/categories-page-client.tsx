"use client"

import { useEffect } from "react"
import { toast } from "@/components/ui/use-toast"

interface CategoriesPageClientProps {
  successMessage?: string
  errorMessage?: string
  children: React.ReactNode
}

export function CategoriesPageClient({ successMessage, errorMessage, children }: CategoriesPageClientProps) {
  useEffect(() => {
    if (successMessage) {
      toast({
        title: "Success",
        description: successMessage,
      })
    }
    if (errorMessage) {
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }, [successMessage, errorMessage])

  return <>{children}</>
}