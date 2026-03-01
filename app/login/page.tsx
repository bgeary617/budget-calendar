"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabaseClient"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        router.replace("/")
      }
    }

    checkSession()
  }, [router])

  const handlePasswordLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError("")
    setIsSigningIn(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    })
    setIsSigningIn(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.replace("/")
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">
          Sign In
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          Sign in with your email and password.
        </p>

        <form onSubmit={handlePasswordLogin}>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="mb-4 w-full rounded-lg border p-3 text-base"
            required
          />

          <label className="mb-2 block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="mb-4 w-full rounded-lg border p-3 text-base"
            required
          />

          {error && (
            <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSigningIn}
            className="w-full rounded-lg bg-black px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {isSigningIn ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-600 underline">
            Back to app
          </Link>
        </div>
      </div>
    </main>
  )
}
