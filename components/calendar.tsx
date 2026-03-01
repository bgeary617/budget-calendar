"use client"

import { useState, useEffect } from "react"
import { supabase } from "../lib/supabaseClient"

type Entry = {
  id?: string
  day: number
  name: string
  amount: number
  recurring: "none" | "monthly"
  type: "expense" | "income"
  month: number
  year: number
}

type CommissionOverride = {
  id?: string
  date: string
  commission_amount: number
}

export default function Calendar() {
  const today = new Date()

  const [currentMonth, setCurrentMonth] = useState(
    new Date(today.getFullYear(), today.getMonth(), 1)
  )

  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()

  const [entries, setEntries] = useState<Entry[]>([])
  const [commissions, setCommissions] = useState<CommissionOverride[]>([])
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)
  const [selectedCommissionDay, setSelectedCommissionDay] = useState<number | null>(null)
  const [commissionInput, setCommissionInput] = useState("")
  const [commissionError, setCommissionError] = useState("")
  const [isSavingCommission, setIsSavingCommission] = useState(false)
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false)
  const [balanceInput, setBalanceInput] = useState("")

  const [name, setName] = useState("")
  const [amount, setAmount] = useState(0)
  const [recurring, setRecurring] = useState<"none" | "monthly">("none")
  const [type, setType] = useState<"expense" | "income">("expense")

  const basePay = 2893
  const paycheckStart = { year: 2026, month: 1, day: 20 }
  const PAYCHECK_INTERVAL = 14
  const defaultStartingBalance = 3000

  const [monthlyStartingBalances, setMonthlyStartingBalances] = useState<
    Record<string, number>
  >({})

  const monthKey = `${year}-${month}`
  const startingBalance =
    monthlyStartingBalances[monthKey] ?? defaultStartingBalance

  const toUtcDayNumber = (targetYear: number, targetMonth: number, targetDay: number) =>
    Math.floor(Date.UTC(targetYear, targetMonth, targetDay) / (1000 * 60 * 60 * 24))

  const getDateKey = (targetYear: number, targetMonth: number, targetDay: number) => {
    const mm = String(targetMonth + 1).padStart(2, "0")
    const dd = String(targetDay).padStart(2, "0")
    return `${targetYear}-${mm}-${dd}`
  }

  useEffect(() => {
    fetchEntries()
    fetchCommissions()
  }, [month, year])

  const fetchEntries = async () => {
    const { data } = await supabase.from("expenses").select("*")
    if (data) setEntries(data as Entry[])
  }

  const fetchCommissions = async () => {
    const { data } = await supabase.from("paychecks").select("*")
    if (data) setCommissions(data as CommissionOverride[])
  }

  const isPaycheckDay = (day: number) => {
    const currentDayNumber = toUtcDayNumber(year, month, day)
    const paycheckStartDayNumber = toUtcDayNumber(
      paycheckStart.year,
      paycheckStart.month,
      paycheckStart.day
    )
    const diff = currentDayNumber - paycheckStartDayNumber

    if (diff < 0) return false
    return diff % PAYCHECK_INTERVAL === 0
  }

  const getCommissionForDate = (day: number) => {
    const isoDate = getDateKey(year, month, day)

    const match = commissions.find((c) =>
      String(c.date).slice(0, 10) === isoDate
    )

    return match ? Number(match.commission_amount) : 0
  }

  const getCommissionRecordForDate = (day: number) => {
    const isoDate = getDateKey(year, month, day)
    return commissions.find((c) =>
      String(c.date).slice(0, 10) === isoDate
    )
  }
  const getMonthlySummary = () => {
  let totalIncome = 0
  let totalExpenses = 0

  // Loop days in month
  for (let d = 1; d <= daysInMonth; d++) {
    if (isPaycheckDay(d)) {
      totalIncome += basePay
      totalIncome += getCommissionForDate(d)
    }

    entries.forEach((e) => {
      const entryStartDate = new Date(e.year, e.month, 1)
      const currentDate = new Date(year, month, 1)

      const applies =
        e.recurring === "monthly"
          ? entryStartDate <= currentDate
          : e.month === month && e.year === year

      if (applies && e.day === d) {
        if (e.type === "income") totalIncome += e.amount
        else totalExpenses += e.amount
      }
    })
  }

  return {
    income: totalIncome,
    expenses: totalExpenses,
    net: totalIncome - totalExpenses
  }
}
  const getBalanceForDay = (day: number) => {
    let running = startingBalance

    for (let d = 1; d <= day; d++) {
      if (isPaycheckDay(d)) {
        running += basePay
        running += getCommissionForDate(d)
      }

      entries.forEach((e) => {
        const entryStartDate = new Date(e.year, e.month, 1)
        const currentDate = new Date(year, month, 1)

        const applies =
          e.recurring === "monthly"
            ? entryStartDate <= currentDate
            : e.month === month && e.year === year

        if (!applies) return

        if (d === e.day) {
          if (e.type === "expense") running -= e.amount
          else running += e.amount
        }
      })
    }
    return running
  }

  const getEntriesForDay = (day: number) => {
    const result: {
      label: string
      amount: number
      type: "income" | "expense"
    }[] = []

    if (isPaycheckDay(day)) {
      result.push({
        label: "Base Pay",
        amount: basePay,
        type: "income"
      })
  
      const commission = getCommissionForDate(day)
      if (commission > 0) {
        result.push({
          label: "Commission",
          amount: commission,
          type: "income"
        })
      }
    }

    entries.forEach((e) => {
      const entryStartDate = new Date(e.year, e.month, 1)
      const currentDate = new Date(year, month, 1)

      const applies =
        e.recurring === "monthly"
          ? entryStartDate <= currentDate
          : e.month === month && e.year === year

      if (applies && e.day === day) {
        result.push({
          label: e.name,
          amount: e.amount,
          type: e.type
        })
      }
    })

    return result
  }
const hasRecurringOnDay = (day: number) => {
   return entries.some((e) => {
      if (e.recurring !== "monthly") return false

      const entryStartDate = new Date(e.year, e.month, 1)
      const currentDate = new Date(year, month, 1)

      const applies = entryStartDate <= currentDate

      return applies && e.day === day
})
}
  const handleSave = async () => {
    if (selectedDay === null || !name || amount <= 0) return

    if (editingEntry) {
      await supabase
        .from("expenses")
        .update({ name, amount, recurring, type })
        .eq("id", editingEntry.id)
    } else {
      await supabase.from("expenses").insert([
        {
          day: selectedDay,
          name,
          amount,
          recurring,
          type,
          month,
          year
        }
      ])
    }

    fetchEntries()
    resetForm()
  }

  const openBalanceModal = () => {
    setBalanceInput(String(startingBalance))
    setIsBalanceModalOpen(true)
  }

  const saveStartingBalance = () => {
    const parsed = Number(balanceInput)
    if (!Number.isFinite(parsed)) return

    setMonthlyStartingBalances((prev) => ({
      ...prev,
      [monthKey]: parsed
    }))
    setIsBalanceModalOpen(false)
  }

  const openCommissionModal = (day: number) => {
    setSelectedCommissionDay(day)
    setCommissionInput(String(getCommissionForDate(day)))
    setCommissionError("")
  }

  const closeCommissionModal = () => {
    setSelectedCommissionDay(null)
    setCommissionInput("")
    setCommissionError("")
  }

  const saveCommission = async () => {
    if (selectedCommissionDay === null) return

    const parsed = Number(commissionInput)
    if (!Number.isFinite(parsed) || parsed < 0) {
      setCommissionError("Enter a valid commission amount of 0 or more.")
      return
    }

    const dateKey = getDateKey(year, month, selectedCommissionDay)
    const existing = getCommissionRecordForDate(selectedCommissionDay)

    setIsSavingCommission(true)
    let error: string | null = null

    if (parsed === 0) {
      if (existing?.id) {
        const { error: deleteError } = await supabase
          .from("paychecks")
          .delete()
          .eq("id", existing.id)
        error = deleteError?.message ?? null
      }
    } else if (existing?.id) {
      const { error: updateError } = await supabase
        .from("paychecks")
        .update({ commission_amount: parsed })
        .eq("id", existing.id)
      error = updateError?.message ?? null
    } else {
      const { error: insertError } = await supabase
        .from("paychecks")
        .insert([
          {
            date: dateKey,
            commission_amount: parsed
          }
        ])
      error = insertError?.message ?? null
    }

    setIsSavingCommission(false)

    if (error) {
      setCommissionError(error)
      return
    }

    await fetchCommissions()
    closeCommissionModal()
  }

  const resetForm = () => {
    setEditingEntry(null)
    setName("")
    setAmount(0)
    setRecurring("none")
    setType("expense")
  }

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingWeekday = firstDay.getDay()
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  return (
    <div className="max-w-5xl mx-auto mt-10">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() =>
            setCurrentMonth(new Date(year, month - 1, 1))
          }
          className="px-3 py-1 bg-gray-200 rounded"
        >
          {"<"}
        </button>

        <h2 className="text-2xl font-semibold">
          {currentMonth.toLocaleString("default", {
            month: "long"
          })}{" "}
          {year}
        </h2>

        <button
          onClick={() =>
            setCurrentMonth(new Date(year, month + 1, 1))
          }
          className="px-3 py-1 bg-gray-200 rounded"
        >
          {">"}
        </button>
      </div>
      <div className="mb-4 flex justify-between items-center">
        <div className="text-sm text-gray-600">
          Starting Balance: ${startingBalance.toLocaleString()}
        </div>
        <button
          onClick={openBalanceModal}
          className="px-3 py-1 bg-white border rounded text-sm"
        >
          Set Starting Balance
        </button>
      </div>
          {(() => {
  const summary = getMonthlySummary()

  return (
    <div className="mb-6 grid grid-cols-3 gap-4 text-center text-sm font-medium">
      <div className="bg-green-50 p-3 rounded">
        <div className="text-gray-500">Income</div>
        <div className="text-green-600">
          ${summary.income.toLocaleString()}
        </div>
      </div>

      <div className="bg-red-50 p-3 rounded">
        <div className="text-gray-500">Expenses</div>
        <div className="text-red-600">
          ${summary.expenses.toLocaleString()}
        </div>
      </div>

      <div className="bg-gray-100 p-3 rounded">
        <div className="text-gray-500">Net</div>
        <div
          className={
            summary.net < 0
              ? "text-red-600"
              : "text-green-600"
          }
        >
          ${summary.net.toLocaleString()}
        </div>
      </div>
    </div>
  )
})()}
      <div className="grid grid-cols-7 text-center font-medium mb-2">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: startingWeekday }).map((_, i) => (
          <div key={i} />
        ))}

        {days.map((day) => {
          const balance = getBalanceForDay(day)
          const payday = isPaycheckDay(day)
            let bgColor = "bg-green-100"

            if (balance < 1000) bgColor = "bg-yellow-100"
            if (balance < 0) bgColor = "bg-red-100"
          return (
            <div
              key={day}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              onClick={() => {
                setSelectedDay(day)
                resetForm()
              }}
              className={`relative p-4 h-24 rounded-xl shadow-sm border cursor-pointer ${bgColor}`}
            >
              <div className="font-semibold text-sm flex items-center gap-1">
  {day}
  {payday && (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openCommissionModal(day)
      }}
      className="rounded border border-green-300 bg-green-50 px-1 text-xs leading-none"
      title="Set commission for this payday"
    >
      $
    </button>
  )}
  {hasRecurringOnDay(day) && <span>R</span>}
</div>

              <div className="text-xs mt-2">
                ${balance.toLocaleString()}
              </div>

              {hoveredDay === day && (
  <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border rounded shadow-lg p-2 text-xs">
    {(() => {
      const items = getEntriesForDay(day)

      if (items.length === 0) {
        return <div className="text-gray-400">No entries</div>
      }

      const net = items.reduce((sum, item) => {
        return item.type === "expense"
          ? sum - item.amount
          : sum + item.amount
      }, 0)

      return (
        <>
          {items.map((item, idx) => (
            <div
              key={idx}
              className={`flex justify-between ${
                item.type === "expense"
                  ? "text-red-600"
                  : "text-green-600"
              }`}
            >
              <span>{item.label}</span>
              <span>
                {item.type === "expense" ? "-" : "+"}$
                {item.amount}
              </span>
            </div>
          ))}

          <div className="border-t mt-2 pt-1 flex justify-between font-semibold">
            <span>Net</span>
            <span
              className={
                net < 0 ? "text-red-600" : "text-green-600"
              }
            >
              {net < 0 ? "-" : "+"}${Math.abs(net)}
            </span>
          </div>
        </>
      )
    })()}
  </div>
)}
            </div>
          )
        })}
      </div>

      {selectedDay !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setSelectedDay(null)}
          />

          <div className="relative bg-white p-6 rounded-xl w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              Add Entry - Day {selectedDay}
            </h3>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name"
              className="w-full border p-2 mb-3 rounded"
            />

            <input
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="Amount"
              type="number"
              className="w-full border p-2 mb-3 rounded"
            />

            <select
              value={type}
              onChange={(e) =>
                setType(e.target.value as "expense" | "income")
              }
              className="w-full border p-2 mb-3 rounded"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>

            <select
              value={recurring}
              onChange={(e) =>
                setRecurring(e.target.value as "none" | "monthly")
              }
              className="w-full border p-2 mb-4 rounded"
            >
              <option value="none">One Time</option>
              <option value="monthly">Monthly Recurring</option>
            </select>

            <div className="flex justify-between">
              <button
                onClick={() => setSelectedDay(null)}
                className="text-gray-500"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {editingEntry ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBalanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsBalanceModalOpen(false)}
          />

          <div className="relative bg-white p-6 rounded-xl w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              Starting Balance for{" "}
              {currentMonth.toLocaleString("default", {
                month: "long"
              })}{" "}
              {year}
            </h3>

            <input
              value={balanceInput}
              onChange={(e) => setBalanceInput(e.target.value)}
              type="number"
              step="0.01"
              className="w-full border p-2 mb-4 rounded"
            />

            <div className="flex justify-between">
              <button
                onClick={() => setIsBalanceModalOpen(false)}
                className="text-gray-500"
              >
                Cancel
              </button>

              <button
                onClick={saveStartingBalance}
                className="bg-black text-white px-4 py-2 rounded"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCommissionDay !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={closeCommissionModal}
          />

          <div className="relative bg-white p-6 rounded-xl w-96 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">
              Commission - Day {selectedCommissionDay}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {currentMonth.toLocaleString("default", { month: "long" })} {year}
            </p>

            <input
              value={commissionInput}
              onChange={(e) => {
                setCommissionInput(e.target.value)
                setCommissionError("")
              }}
              type="number"
              step="0.01"
              min="0"
              className="w-full border p-2 mb-2 rounded"
              placeholder="0.00"
            />

            <p className="text-xs text-gray-500 mb-4">
              Set to 0 to remove commission for this payday.
            </p>

            {commissionError && (
              <p className="text-sm text-red-600 mb-3">{commissionError}</p>
            )}

            <div className="flex justify-between">
              <button
                onClick={closeCommissionModal}
                className="text-gray-500"
              >
                Cancel
              </button>

              <button
                onClick={saveCommission}
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                disabled={isSavingCommission}
              >
                {isSavingCommission ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
