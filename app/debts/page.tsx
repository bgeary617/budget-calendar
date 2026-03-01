"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabaseClient"
import { calculateDebtPayoff, getMonthlyPayment } from "../../lib/debtUtils"
import { parseCurrencyInput, roundCurrency } from "../../lib/financeUtils"

type Debt = {
  id?: number
  name: string
  type: "credit_card" | "loan" | "other"
  current_balance: number
  apr: number
  minimum_payment: number
  extra_payment: number
  start_date: string | null
  is_active: boolean
}

type Toast = {
  id: number
  message: string
  type: "error" | "success"
}

const emptyForm = {
  name: "",
  type: "credit_card" as Debt["type"],
  current_balance: "",
  apr: "",
  minimum_payment: "",
  extra_payment: "0",
  start_date: ""
}

export default function DebtsPage() {
  const router = useRouter()
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [debts, setDebts] = useState<Debt[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState("")
  const [toasts, setToasts] = useState<Toast[]>([])
  const [form, setForm] = useState(emptyForm)

  const pushToast = useCallback((message: string, type: Toast["type"] = "error") => {
    const id = Date.now() + Math.floor(Math.random() * 10000)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 3500)
  }, [])

  const fetchDebts = useCallback(async () => {
    const { data, error } = await supabase.from("debts").select("*").order("name")
    if (error) {
      pushToast(error.message)
      return
    }
    setDebts((data as Debt[]) ?? [])
  }, [pushToast])

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) {
        router.replace("/login")
        return
      }
      setIsCheckingAuth(false)
      fetchDebts()
    }

    checkSession()
  }, [router, fetchDebts])

  const activeDebts = useMemo(() => debts.filter((debt) => debt.is_active), [debts])

  const debtRows = useMemo(() => {
    return activeDebts.map((debt) => {
      const startDate = debt.start_date ? new Date(`${debt.start_date}T00:00:00`) : new Date()
      const payoff = calculateDebtPayoff(debt, startDate)
      return {
        ...debt,
        monthlyPayment: getMonthlyPayment(debt),
        ...payoff
      }
    })
  }, [activeDebts])

  const totals = useMemo(() => {
    const totalBalance = debtRows.reduce((sum, debt) => sum + debt.current_balance, 0)
    const totalMonthlyPayment = debtRows.reduce((sum, debt) => sum + debt.monthlyPayment, 0)
    const weightedApr =
      totalBalance > 0
        ? debtRows.reduce((sum, debt) => sum + debt.current_balance * debt.apr, 0) / totalBalance
        : 0

    const hasNeverPayoff = debtRows.some((debt) => debt.monthsToPayoff === null)
    const payoffDates = debtRows
      .map((debt) => debt.payoffDate)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => a.getTime() - b.getTime())

    const debtFreeDate = hasNeverPayoff
      ? null
      : payoffDates.length > 0
        ? payoffDates[payoffDates.length - 1]
        : null

    return {
      totalBalance,
      totalMonthlyPayment,
      weightedApr,
      hasNeverPayoff,
      debtFreeDate
    }
  }, [debtRows])

  const openCreateModal = () => {
    setEditingDebt(null)
    setForm(emptyForm)
    setFormError("")
    setIsModalOpen(true)
  }

  const openEditModal = (debt: Debt) => {
    setEditingDebt(debt)
    setForm({
      name: debt.name,
      type: debt.type,
      current_balance: String(debt.current_balance),
      apr: String(debt.apr),
      minimum_payment: String(debt.minimum_payment),
      extra_payment: String(debt.extra_payment ?? 0),
      start_date: debt.start_date ?? ""
    })
    setFormError("")
    setIsModalOpen(true)
  }

  const handleSave = async () => {
    setFormError("")

    const name = form.name.trim()
    const currentBalance = parseCurrencyInput(form.current_balance)
    const apr = Number(form.apr)
    const minimumPayment = parseCurrencyInput(form.minimum_payment)
    const extraPayment = parseCurrencyInput(form.extra_payment) ?? 0

    if (!name) {
      setFormError("Name is required.")
      pushToast("Name is required.")
      return
    }

    if (currentBalance === null || currentBalance < 0) {
      setFormError("Balance must be 0 or greater.")
      pushToast("Balance must be 0 or greater.")
      return
    }

    if (!Number.isFinite(apr) || apr < 0) {
      setFormError("APR must be 0 or greater.")
      pushToast("APR must be 0 or greater.")
      return
    }

    if (minimumPayment === null || minimumPayment <= 0) {
      setFormError("Minimum payment must be greater than 0.")
      pushToast("Minimum payment must be greater than 0.")
      return
    }

    if (extraPayment < 0) {
      setFormError("Extra payment must be 0 or greater.")
      pushToast("Extra payment must be 0 or greater.")
      return
    }

    setIsSaving(true)

    const payload = {
      name,
      type: form.type,
      current_balance: roundCurrency(currentBalance),
      apr: roundCurrency(apr),
      minimum_payment: roundCurrency(minimumPayment),
      extra_payment: roundCurrency(extraPayment),
      start_date: form.start_date || null,
      is_active: true
    }

    let errorMessage: string | null = null

    if (editingDebt?.id) {
      const { error } = await supabase.from("debts").update(payload).eq("id", editingDebt.id)
      errorMessage = error?.message ?? null
    } else {
      const { error } = await supabase.from("debts").insert([payload])
      errorMessage = error?.message ?? null
    }

    setIsSaving(false)

    if (errorMessage) {
      setFormError(errorMessage)
      pushToast(errorMessage)
      return
    }

    setIsModalOpen(false)
    await fetchDebts()
    pushToast(editingDebt ? "Debt updated." : "Debt added.", "success")
  }

  const handleDelete = async (debt: Debt) => {
    if (!debt.id) return
    const confirmed = window.confirm(`Delete "${debt.name}"?`)
    if (!confirmed) return

    const { error } = await supabase
      .from("debts")
      .update({ is_active: false })
      .eq("id", debt.id)

    if (error) {
      pushToast(error.message)
      return
    }

    await fetchDebts()
    pushToast("Debt archived.", "success")
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
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[70] space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-md px-3 py-2 text-sm shadow ${
                toast.type === "error" ? "bg-red-600 text-white" : "bg-green-600 text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-3xl font-bold text-gray-900">Debt Tracker</h1>
          <div className="flex gap-2">
            <Link href="/" className="rounded border bg-white px-3 py-2 text-sm">
              Back to Calendar
            </Link>
            <button
              onClick={openCreateModal}
              className="rounded bg-black px-3 py-2 text-sm text-white"
            >
              Add Debt
            </button>
          </div>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded border bg-white p-3">
            <div className="text-xs text-gray-500">Total Balance</div>
            <div className="text-lg font-semibold">${totals.totalBalance.toLocaleString()}</div>
          </div>
          <div className="rounded border bg-white p-3">
            <div className="text-xs text-gray-500">Monthly Payments</div>
            <div className="text-lg font-semibold">
              ${totals.totalMonthlyPayment.toLocaleString()}
            </div>
          </div>
          <div className="rounded border bg-white p-3">
            <div className="text-xs text-gray-500">Weighted APR</div>
            <div className="text-lg font-semibold">{totals.weightedApr.toFixed(2)}%</div>
          </div>
          <div className="rounded border bg-white p-3">
            <div className="text-xs text-gray-500">Projected Debt-Free Date</div>
            <div className="text-sm font-semibold">
              {totals.hasNeverPayoff
                ? "No payoff with current payments"
                : totals.debtFreeDate
                  ? totals.debtFreeDate.toLocaleDateString()
                  : "-"}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Balance</th>
                <th className="px-3 py-2">APR</th>
                <th className="px-3 py-2">Monthly Payment</th>
                <th className="px-3 py-2">Months Left</th>
                <th className="px-3 py-2">Payoff Date</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {debtRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-gray-500">
                    No active debts yet.
                  </td>
                </tr>
              ) : (
                debtRows.map((debt) => (
                  <tr key={debt.id} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{debt.name}</td>
                    <td className="px-3 py-2">{debt.type}</td>
                    <td className="px-3 py-2">${debt.current_balance.toLocaleString()}</td>
                    <td className="px-3 py-2">{debt.apr.toFixed(2)}%</td>
                    <td className="px-3 py-2">${debt.monthlyPayment.toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {debt.monthsToPayoff === null ? "No payoff" : debt.monthsToPayoff}
                    </td>
                    <td className="px-3 py-2">
                      {debt.payoffDate ? debt.payoffDate.toLocaleDateString() : "-"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(debt)}
                          className="rounded border px-2 py-1 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(debt)}
                          className="rounded border px-2 py-1 text-xs text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold">{editingDebt ? "Edit Debt" : "Add Debt"}</h3>

            <input
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Name"
              className="mb-3 w-full rounded border p-2"
            />

            <select
              value={form.type}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, type: e.target.value as Debt["type"] }))
              }
              className="mb-3 w-full rounded border p-2"
            >
              <option value="credit_card">Credit Card</option>
              <option value="loan">Loan</option>
              <option value="other">Other</option>
            </select>

            <input
              value={form.current_balance}
              onChange={(e) => setForm((prev) => ({ ...prev, current_balance: e.target.value }))}
              type="text"
              placeholder="Current Balance"
              className="mb-3 w-full rounded border p-2"
            />

            <input
              value={form.apr}
              onChange={(e) => setForm((prev) => ({ ...prev, apr: e.target.value }))}
              type="number"
              step="0.01"
              min="0"
              placeholder="APR %"
              className="mb-3 w-full rounded border p-2"
            />

            <input
              value={form.minimum_payment}
              onChange={(e) => setForm((prev) => ({ ...prev, minimum_payment: e.target.value }))}
              type="text"
              placeholder="Minimum Payment"
              className="mb-3 w-full rounded border p-2"
            />

            <input
              value={form.extra_payment}
              onChange={(e) => setForm((prev) => ({ ...prev, extra_payment: e.target.value }))}
              type="text"
              placeholder="Extra Payment"
              className="mb-3 w-full rounded border p-2"
            />

            <input
              value={form.start_date}
              onChange={(e) => setForm((prev) => ({ ...prev, start_date: e.target.value }))}
              type="date"
              className="mb-3 w-full rounded border p-2"
            />

            {formError && <p className="mb-3 text-sm text-red-600">{formError}</p>}

            <div className="flex justify-between">
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
