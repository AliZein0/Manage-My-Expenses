"use client"

import React from "react"
import { SessionProvider, useSession } from "next-auth/react"
import type { Session } from "next-auth"

export function AuthProvider({ 
  children, 
  session 
}: { 
  children: React.ReactNode 
  session?: Session | null 
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>
}

export function useAuthSession() {
  return useSession()
}