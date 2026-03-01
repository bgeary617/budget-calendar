"use client"

import { useEffect, useMemo, useState } from "react"
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

type StartingBalance = {
  id?: string
  month: number
  year: number
  amount: number
}

type PayrollSettings = {
  basePay: number
  paycheckStartDate: string
  paycheckIntervalDays: number
}

const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  basePay: 2893,
  paycheckStartDate: "2026-02-20",
  paycheckIntervalDays: 14
}

const DEFAULT_STARTING_BALANCE = 3000
const PAYROLL_STORAGE_KEY = "payroll-settings-v1"

const getDateKey = (targetYear: number, targetMonth: number, targetDay: number) => {
  const mm = String(targetMonth + 1).padStart(2, "0")
  const dd = String(targetDay).padStart(2, "0")
  return `${targetYear}-${mm}-${dd}`
}

const toUtcDayNumber = (targetYear: number, targetMonth: number, targetDay: number) =>
  Math.floor(Date.UTC(targetYear, targetMonth, targetDay) / (1000 * 60 * 60 * 24))

const parseDateKey = (dateKey: string) => {
  const [yearStr, monthStr, dayStr] = dateKey.split("-")
  const parsedYear = Number(yearStr)
  const parsedMonth = Number(monthStr)
  const parsedDay = Number(dayStr)

  if (
    !Number.isFinite(parsedYear) ||
    !Number.isFinite(parsedMonth) ||
    !Number.isFinite(parsedDay)
  ) {
    return null
  }

  return {
    year: parsedYear,
    month: parsedMonth - 1,
    day: parsedDay
  }
}

const entryAppliesToMonth = (entry: Entry, targetYear: number, targetMonth: number) => {
  const entryStartDate = new Date(entry.year, entry.month, 1)
  const currentDate = new Date(targetYear, targetMonth, 1)

  if (entry.recurring === "monthly") return entryStartDate <= currentDate
  return entry.month === targetMonth && entry.year === targetYear
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
  const [startingBalances, setStartingBalances] = useState<StartingBalance[]>([])
  const [hoveredDay, setHoveredDay] = useState<number | null>(null)

  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null)

  const [selectedCommissionDay, setSelectedCommissionDay] = useState<number | null>(null)
  const [commissionInput, setCommissionInput] = useState("")
  const [commissionError, setCommissionError] = useState("")
  const [isSavingCommission, setIsSavingCommission] = useState(false)

  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false)
  const [balanceInput, setBalanceInput] = useState("")
  const [balanceError, setBalanceError] = useState("")
  const [isSavingBalance, setIsSavingBalance] = useState(false)

  const [name, setName] = useState("")
  const [amount, setAmount] = useState(0)
  const [recurring, setRecurring] = useState<"none" | "monthly">("none")
  const [type, setType] = useState<"expense" | "income">("expense")

  const [showMonthlyReport, setShowMonthlyReport] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS)
  const [payrollDraft, setPayrollDraft] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS)
  const [settingsMessage, setSettingsMessage] = useState("")
  const [settingsError, setSettingsError] = useState("")

  const adminEmails = useMemo(() => {
    return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "bgeary617@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  }, [])

  const isAdmin = currentUserEmail ? adminEmails.includes(currentUserEmail) : false

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser()
      setCurrentUserEmail(data.user?.email?.toLowerCase() ?? null)
    }

    const raw = localStorage.getItem(PAYROLL_STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as PayrollSettings
        if (
          typeof parsed.basePay === "number" &&
          typeof parsed.paycheckStartDate === "string" &&
          typeof parsed.paycheckIntervalDays === "number"
        ) {
          setPayrollSettings(parsed)
          setPayrollDraft(parsed)
        }
      } catch {
        // Ignore invalid local storage payload.
      }
    }

    loadUser()
  }, [])

  useEffect(() => {
    fetchEntries()
    fetchCommissions()
    fetchStartingBalances()
  }, [month, year])

  const fetchEntries = async () => {
    const { data } = await supabase.from("expenses").select("*")
    if (data) setEntries(data as Entry[])
  }

  const fetchCommissions = async () => {
    const { data } = await supabase.from("paychecks").select("*")
    if (data) setCommissions(data as CommissionOverride[])
  }

  const fetchStartingBalances = async () => {
    const { data } = await supabase.from("starting_balances").select("*")
    if (data) setStartingBalances(data as StartingBalance[])
  }

  const isPaycheckDayForDate = (targetYear: number, targetMonth: number, targetDay: number) => {
    const startParts = parseDateKey(payrollSettings.paycheckStartDate)
    if (!startParts) return false

    const interval = Math.floor(payrollSettings.paycheckIntervalDays)
    if (!Number.isFinite(interval) || interval <= 0) return false

    const currentDayNumber = toUtcDayNumber(targetYear, targetMonth, targetDay)
    const startDayNumber = toUtcDayNumber(startParts.year, startParts.month, startParts.day)
    const diff = currentDayNumber - startDayNumber

    if (diff < 0) return false
    return diff % interval === 0
  }

  const isPaycheckDay = (day: number) => isPaycheckDayForDate(year, month, day)

  const getCommissionForDateKey = (dateKey: string) => {
    const match = commissions.find((commission) => String(commission.date).slice(0, 10) === dateKey)
    return match ? Number(match.commission_amount) : 0
  }

  const getCommissionForDate = (day: number) => {
    return getCommissionForDateKey(getDateKey(year, month, day))
  }

  const getCommissionRecordForDate = (day: number) => {
    const targetDateKey = getDateKey(year, month, day)
    return commissions.find((commission) => String(commission.date).slice(0, 10) === targetDateKey)
  }

  const currentStartingBalanceRecord = startingBalances.find(
    (record) => record.month === month && record.year === year
  )

  const startingBalance = currentStartingBalanceRecord?.amount ?? DEFAULT_STARTING_BALANCE

  const calculateMonthSummary = (targetYear: number, targetMonth: number) => {
    const daysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate()
    let income = 0
    let expenses = 0
    let commissionTotal = 0

    for (let day = 1; day <= daysInTargetMonth; day++) {
      if (isPaycheckDayForDate(targetYear, targetMonth, day)) {
        income += payrollSettings.basePay
        const commission = getCommissionForDateKey(getDateKey(targetYear, targetMonth, day))
        income += commission
        commissionTotal += commission
      }

      entries.forEach((entry) => {
        const applies = entryAppliesToMonth(entry, targetYear, targetMonth)
        if (!applies || entry.day !== day) return

        if (entry.type === "income") income += entry.amount
        else expenses += entry.amount
      })
    }

    return {
      income,
      expenses,
      commission: commissionTotal,
      net: income - expenses
    }
  }

  const getBalanceForDay = (day: number) => {
    let running = startingBalance

    for (let currentDay = 1; currentDay <= day; currentDay++) {
      if (isPaycheckDay(currentDay)) {
        running += payrollSettings.basePay
        running += getCommissionForDate(currentDay)
      }

      entries.forEach((entry) => {
        const applies = entryAppliesToMonth(entry, year, month)
        if (!applies || entry.day !== currentDay) return

        if (entry.type === "expense") running -= entry.amount
        else running += entry.amount
      })
    }

    return running
  }

  const getEntriesForDay = (day: number) => {
    const result: { label: string; amount: number; type: "income" | "expense" }[] = []

    if (isPaycheckDay(day)) {
      result.push({ label: "Base Pay", amount: payrollSettings.basePay, type: "income" })
      const commission = getCommissionForDate(day)
      if (commission > 0) result.push({ label: "Commission", amount: commission, type: "income" })
    }

    entries.forEach((entry) => {
      const applies = entryAppliesToMonth(entry, year, month)
      if (!applies || entry.day !== day) return
      result.push({ label: entry.name, amount: entry.amount, type: entry.type })
    })

    return result
  }

  const getEditableEntriesForDay = (day: number) => {
    return entries.filter((entry) => entryAppliesToMonth(entry, year, month) && entry.day === day)
  }

  const hasRecurringOnDay = (day: number) => {
    return entries.some((entry) => {
      if (entry.recurring !== "monthly") return false
      return entryAppliesToMonth(entry, year, month) && entry.day === day
    })
  }

  const handleSaveEntry = async () => {
    if (selectedDay === null || !name || amount <= 0) return

    if (editingEntry?.id) {
      const { error } = await supabase
        .from("expenses")
        .update({ name, amount, recurring, type })
        .eq("id", editingEntry.id)
      if (error) return
    } else {
      const { error } = await supabase.from("expenses").insert([
        { day: selectedDay, name, amount, recurring, type, month, year }
      ])
      if (error) return
    }

    await fetchEntries()
    resetEntryForm()
  }

  const handleDeleteEntry = async (entry: Entry) => {
    if (!entry.id) return
    const confirmed = window.confirm(`Delete "${entry.name}"?`)
    if (!confirmed) return

    await supabase.from("expenses").delete().eq("id", entry.id)
    await fetchEntries()
    if (editingEntry?.id === entry.id) resetEntryForm()
  }

  const resetEntryForm = () => {
    setEditingEntry(null)
    setName("")
    setAmount(0)
    setRecurring("none")
    setType("expense")
  }

  const openEntryEditor = (entry: Entry) => {
    setEditingEntry(entry)
    setName(entry.name)
    setAmount(entry.amount)
    setRecurring(entry.recurring)
    setType(entry.type)
  }

  const openBalanceModal = () => {
    setBalanceInput(String(startingBalance))
    setBalanceError("")
    setIsBalanceModalOpen(true)
  }

  const saveStartingBalance = async () => {
    const parsed = Number(balanceInput)
    if (!Number.isFinite(parsed)) {
      setBalanceError("Enter a valid number.")
      return
    }

    setIsSavingBalance(true)

    if (currentStartingBalanceRecord?.id) {
      const { error } = await supabase
        .from("starting_balances")
        .update({ amount: parsed })
        .eq("id", currentStartingBalanceRecord.id)

      if (error) {
        setBalanceError(error.message)
        setIsSavingBalance(false)
        return
      }
    } else {
      const { error } = await supabase
        .from("starting_balances")
        .insert([{ year, month, amount: parsed }])

      if (error) {
        setBalanceError(error.message)
        setIsSavingBalance(false)
        return
      }
    }

    await fetchStartingBalances()
    setIsSavingBalance(false)
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
        .insert([{ date: dateKey, commission_amount: parsed }])
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

  const savePayrollSettings = () => {
    setSettingsMessage("")
    setSettingsError("")

    const basePay = Number(payrollDraft.basePay)
    const interval = Number(payrollDraft.paycheckIntervalDays)
    const startDate = payrollDraft.paycheckStartDate

    if (!Number.isFinite(basePay) || basePay < 0) {
      setSettingsError("Base pay must be a number 0 or greater.")
      return
    }

    if (!Number.isFinite(interval) || interval <= 0) {
      setSettingsError("Paycheck interval must be greater than 0.")
      return
    }

    if (!parseDateKey(startDate)) {
      setSettingsError("Paycheck start date must be a valid date.")
      return
    }

    const normalized: PayrollSettings = {
      basePay,
      paycheckStartDate: startDate,
      paycheckIntervalDays: Math.floor(interval)
    }

    setPayrollSettings(normalized)
    setPayrollDraft(normalized)
    localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(normalized))
    setSettingsMessage("Saved payroll settings on this device.")
  }

  const resetPayrollSettings = () => {
    setPayrollSettings(DEFAULT_PAYROLL_SETTINGS)
    setPayrollDraft(DEFAULT_PAYROLL_SETTINGS)
    setSettingsError("")
    setSettingsMessage("Reset to defaults.")
    localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(DEFAULT_PAYROLL_SETTINGS))
  }

  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingWeekday = firstDay.getDay()
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1)
  const summary = calculateMonthSummary(year, month)

  const monthlyReport = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthSummary = calculateMonthSummary(year, monthIndex)
    return { month: monthIndex, ...monthSummary }
  })

  const selectedDayEntries = selectedDay === null ? [] : getEditableEntriesForDay(selectedDay)

  return (
    <div className="max-w-5xl mx-auto mt-10">
      <div className="flex justify-between items-center mb-6">
        <button
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}
          className="px-3 py-1 bg-gray-200 rounded"
        >
          {"<"}
        </button>

        <h2 className="text-2xl font-semibold">
          {currentMonth.toLocaleString("default", { month: "long" })} {year}
        </h2>

        <button
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}
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

      {isAdmin && (
        <div className="mb-6 flex justify-end">
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="px-3 py-2 rounded border bg-white text-sm"
          >
            Admin Payroll Settings
          </button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-4 gap-4 text-center text-sm font-medium">
        <div className="bg-green-50 p-3 rounded">
          <div className="text-gray-500">Income</div>
          <div className="text-green-600">${summary.income.toLocaleString()}</div>
        </div>

        <div className="bg-blue-50 p-3 rounded">
          <div className="text-gray-500">Commission</div>
          <div className="text-blue-600">${summary.commission.toLocaleString()}</div>
        </div>

        <div className="bg-red-50 p-3 rounded">
          <div className="text-gray-500">Expenses</div>
          <div className="text-red-600">${summary.expenses.toLocaleString()}</div>
        </div>

        <div className="bg-gray-100 p-3 rounded">
          <div className="text-gray-500">Net</div>
          <div className={summary.net < 0 ? "text-red-600" : "text-green-600"}>
            ${summary.net.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowMonthlyReport((prev) => !prev)}
          className="px-3 py-1 rounded border bg-white text-sm"
        >
          {showMonthlyReport ? "Hide Monthly Report" : `Show Monthly Report (${year})`}
        </button>
      </div>

      {showMonthlyReport && (
        <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Month</th>
                <th className="py-2">Income</th>
                <th className="py-2">Commission</th>
                <th className="py-2">Expenses</th>
                <th className="py-2">Net</th>
              </tr>
            </thead>
            <tbody>
              {monthlyReport.map((row) => (
                <tr key={row.month} className="border-b last:border-b-0">
                  <td className="py-2">
                    {new Date(year, row.month, 1).toLocaleString("default", { month: "long" })}
                  </td>
                  <td className="py-2 text-green-700">${row.income.toLocaleString()}</td>
                  <td className="py-2 text-blue-700">${row.commission.toLocaleString()}</td>
                  <td className="py-2 text-red-700">${row.expenses.toLocaleString()}</td>
                  <td className={`py-2 ${row.net < 0 ? "text-red-700" : "text-green-700"}`}>
                    ${row.net.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid grid-cols-7 text-center font-medium mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((dayName) => (
          <div key={dayName}>{dayName}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {Array.from({ length: startingWeekday }).map((_, index) => (
          <div key={index} />
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
                resetEntryForm()
              }}
              className={`relative p-4 h-24 rounded-xl shadow-sm border cursor-pointer ${bgColor}`}
            >
              <div className="font-semibold text-sm flex items-center gap-1">
                {day}
                {payday && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
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

              <div className="text-xs mt-2">${balance.toLocaleString()}</div>

              {hoveredDay === day && (
                <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white border rounded shadow-lg p-2 text-xs">
                  {(() => {
                    const items = getEntriesForDay(day)

                    if (items.length === 0) {
                      return <div className="text-gray-400">No entries</div>
                    }

                    const net = items.reduce((sum, item) => {
                      return item.type === "expense" ? sum - item.amount : sum + item.amount
                    }, 0)

                    return (
                      <>
                        {items.map((item, index) => (
                          <div
                            key={`${item.label}-${index}`}
                            className={`flex justify-between ${
                              item.type === "expense" ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            <span>{item.label}</span>
                            <span>
                              {item.type === "expense" ? "-" : "+"}${item.amount}
                            </span>
                          </div>
                        ))}

                        <div className="border-t mt-2 pt-1 flex justify-between font-semibold">
                          <span>Net</span>
                          <span className={net < 0 ? "text-red-600" : "text-green-600"}>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedDay(null)} />

          <div className="relative bg-white p-6 rounded-xl w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Entries - Day {selectedDay}</h3>

            <div className="mb-4 space-y-2">
              {selectedDayEntries.length === 0 ? (
                <p className="text-sm text-gray-500">No entries yet.</p>
              ) : (
                selectedDayEntries.map((entry) => (
                  <div key={entry.id} className="rounded border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium">{entry.name}</div>
                        <div className="text-xs text-gray-500">
                          {entry.type} | {entry.recurring} | ${entry.amount}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => openEntryEditor(entry)}
                          className="px-2 py-1 rounded border text-xs"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(entry)}
                          className="px-2 py-1 rounded border text-xs text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <h4 className="text-sm font-semibold mb-2">
              {editingEntry ? "Edit Entry" : "Add Entry"}
            </h4>

            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Name"
              className="w-full border p-2 mb-3 rounded"
            />

            <input
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              placeholder="Amount"
              type="number"
              className="w-full border p-2 mb-3 rounded"
            />

            <select
              value={type}
              onChange={(event) => setType(event.target.value as "expense" | "income")}
              className="w-full border p-2 mb-3 rounded"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>

            <select
              value={recurring}
              onChange={(event) => setRecurring(event.target.value as "none" | "monthly")}
              className="w-full border p-2 mb-4 rounded"
            >
              <option value="none">One Time</option>
              <option value="monthly">Monthly Recurring</option>
            </select>

            <div className="flex justify-between">
              <button onClick={() => setSelectedDay(null)} className="text-gray-500">
                Close
              </button>

              <button
                onClick={handleSaveEntry}
                className="bg-black text-white px-4 py-2 rounded"
              >
                {editingEntry ? "Update" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBalanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsBalanceModalOpen(false)} />

          <div className="relative bg-white p-6 rounded-xl w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">
              Starting Balance for {currentMonth.toLocaleString("default", { month: "long" })} {year}
            </h3>

            <input
              value={balanceInput}
              onChange={(event) => {
                setBalanceInput(event.target.value)
                setBalanceError("")
              }}
              type="number"
              step="0.01"
              className="w-full border p-2 mb-3 rounded"
            />

            {balanceError && <p className="text-sm text-red-600 mb-3">{balanceError}</p>}

            <div className="flex justify-between">
              <button onClick={() => setIsBalanceModalOpen(false)} className="text-gray-500">
                Cancel
              </button>

              <button
                onClick={saveStartingBalance}
                className="bg-black text-white px-4 py-2 rounded disabled:opacity-60"
                disabled={isSavingBalance}
              >
                {isSavingBalance ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCommissionDay !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/40" onClick={closeCommissionModal} />

          <div className="relative bg-white p-6 rounded-xl w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Commission - Day {selectedCommissionDay}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {currentMonth.toLocaleString("default", { month: "long" })} {year}
            </p>

            <input
              value={commissionInput}
              onChange={(event) => {
                setCommissionInput(event.target.value)
                setCommissionError("")
              }}
              type="number"
              step="0.01"
              min="0"
              className="w-full border p-2 mb-2 rounded"
              placeholder="0.00"
            />

            <p className="text-xs text-gray-500 mb-3">Set to 0 to remove commission for this payday.</p>

            {commissionError && <p className="text-sm text-red-600 mb-3">{commissionError}</p>}

            <div className="flex justify-between">
              <button onClick={closeCommissionModal} className="text-gray-500">
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

      {isAdmin && isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsSettingsModalOpen(false)}
          />

          <div className="relative bg-white p-6 rounded-xl w-full max-w-2xl shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Admin Payroll Settings</h3>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="text-xs text-gray-600">Base Pay</label>
                <input
                  type="number"
                  step="0.01"
                  value={payrollDraft.basePay}
                  onChange={(event) =>
                    setPayrollDraft((prev) => ({ ...prev, basePay: Number(event.target.value) }))
                  }
                  className="mt-1 w-full border rounded p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Paycheck Start Date</label>
                <input
                  type="date"
                  value={payrollDraft.paycheckStartDate}
                  onChange={(event) =>
                    setPayrollDraft((prev) => ({ ...prev, paycheckStartDate: event.target.value }))
                  }
                  className="mt-1 w-full border rounded p-2 text-sm"
                />
              </div>

              <div>
                <label className="text-xs text-gray-600">Interval (Days)</label>
                <input
                  type="number"
                  min="1"
                  value={payrollDraft.paycheckIntervalDays}
                  onChange={(event) =>
                    setPayrollDraft((prev) => ({
                      ...prev,
                      paycheckIntervalDays: Number(event.target.value)
                    }))
                  }
                  className="mt-1 w-full border rounded p-2 text-sm"
                />
              </div>
            </div>

            {settingsError && <p className="mt-3 text-sm text-red-600">{settingsError}</p>}
            {settingsMessage && <p className="mt-3 text-sm text-green-600">{settingsMessage}</p>}

            <div className="mt-4 flex justify-between">
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="text-gray-500"
              >
                Close
              </button>

              <div className="flex gap-2">
                <button
                  onClick={resetPayrollSettings}
                  className="px-3 py-2 rounded border text-sm"
                >
                  Reset Defaults
                </button>
                <button
                  onClick={savePayrollSettings}
                  className="px-3 py-2 rounded bg-black text-white text-sm"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
