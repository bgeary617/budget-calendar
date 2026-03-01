"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabaseClient"
import { parseCurrencyInput } from "../../lib/financeUtils"

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export default function MobileEntryPage() {
  const router = useRouter()
  const today = useMemo(() => new Date(), [])
  const [date, setDate] = useState(toDateInputValue(today))
  const [amount, setAmount] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage("")
    setError("")

    const parsedAmount = parseCurrencyInput(amount)
    if (parsedAmount === null || parsedAmount <= 0) {
      setError("Enter a valid amount greater than 0.")
      return
    }

    const selectedDate = new Date(`${date}T00:00:00`)
    if (Number.isNaN(selectedDate.getTime())) {
      setError("Enter a valid date.")
      return
    }

    setIsSaving(true)
    const { error: insertError } = await supabase.from("expenses").insert([
      {
        day: selectedDate.getDate(),
        month: selectedDate.getMonth(),
        year: selectedDate.getFullYear(),
        name: "Wife Purchases",
        amount: parsedAmount,
        recurring: "none",
        type: "expense"
      }
    ])
    setIsSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    setAmount("")
    setMessage("Saved.")
  }

  if (isCheckingAuth) {
    return (
      <main className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <p className="text-gray-600">Checking login...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            Quick Expense Entry
          </h1>
          <Link
            href="/"
            className="rounded-md border border-gray-300 px-3 py-1 text-sm text-gray-700"
          >
            Back
          </Link>
        </div>

        <p className="mb-6 text-sm text-gray-600">
          Add the total spent for a day. This saves as a non-recurring
          expense.
        </p>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border bg-white p-4 shadow-sm"
        >
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Date
          </label>
          <input
            value={date}
            onChange={(e) => setDate(e.target.value)}
            type="date"
            className="mb-4 w-full rounded-lg border p-3 text-base"
            required
          />

          <label className="mb-2 block text-sm font-medium text-gray-700">
            Total Amount
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            className="mb-4 w-full rounded-lg border p-3 text-base"
            required
          />

          {error && (
            <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {message && (
            <p className="mb-3 rounded-md bg-green-50 p-2 text-sm text-green-700">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full rounded-lg bg-black px-4 py-3 text-base font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? "Saving..." : "Save Expense"}
          </button>
        </form>
      </div>
    </main>
  )
}
