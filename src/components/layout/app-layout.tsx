"use client"

import { Sidebar } from "./sidebar"
import { useAuthSession } from "@/components/providers/auth-provider"

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useAuthSession()

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    )
  }

  if (!session) {
    // This should not happen as pages are protected, but just in case
    return <>{children}</>
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  )
}