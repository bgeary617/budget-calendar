"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Calendar from "../components/calendar"
import { supabase } from "../lib/supabaseClient"

export default function Home() {
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        router.replace("/login")
        return
      }
      setIsCheckingAuth(false)
    }

    checkSession()
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace("/login")
  }

  if (isCheckingAuth) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-600">Checking login...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-4xl font-bold text-center">
          Budget Calendar
        </h1>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm"
        >
          Log out
        </button>
      </div>

      <Calendar/>
    </main>
  )
}
