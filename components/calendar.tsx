"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { supabase } from "../lib/supabaseClient"
import { isPaycheckDayUtc, parseCurrencyInput, parseDayInput, roundCurrency } from "../lib/financeUtils"

type Entry = {
  id?: number
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

type RecurringDayOverride = {
  id?: string
  entry_id: number
  year: number
  month: number
  day: number
}

type RecurringPaidStatus = {
  id?: string
  entry_id: number
  year: number
  month: number
  paid: boolean
}

type Toast = {
  id: number
  message: string
  type: "error" | "success"
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
  const [recurringDayOverrides, setRecurringDayOverrides] = useState<RecurringDayOverride[]>([])
  const [recurringPaidStatuses, setRecurringPaidStatuses] = useState<RecurringPaidStatus[]>([])
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
  const [showRecurringPayments, setShowRecurringPayments] = useState(false)
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false)
  const [recurringDayDrafts, setRecurringDayDrafts] = useState<Record<string, string>>({})
  const [recurringDayMessage, setRecurringDayMessage] = useState("")
  const [recurringDayError, setRecurringDayError] = useState("")
  const [savingRecurringEntryId, setSavingRecurringEntryId] = useState<number | null>(null)
  const [savingPaidEntryId, setSavingPaidEntryId] = useState<number | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])

  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null)
  const [payrollSettings, setPayrollSettings] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS)
  const [payrollDraft, setPayrollDraft] = useState<PayrollSettings>(DEFAULT_PAYROLL_SETTINGS)
  const [settingsMessage, setSettingsMessage] = useState("")
  const [settingsError, setSettingsError] = useState("")
  const [adminCommissionDrafts, setAdminCommissionDrafts] = useState<Record<number, string>>({})
  const [adminCommissionMessage, setAdminCommissionMessage] = useState("")
  const [adminCommissionError, setAdminCommissionError] = useState("")
  const [savingCommissionDay, setSavingCommissionDay] = useState<number | null>(null)

  const adminEmails = useMemo(() => {
    return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "bgeary617@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  }, [])

  const isAdmin = currentUserEmail ? adminEmails.includes(currentUserEmail) : false

  const pushToast = (message: string, type: "error" | "success" = "error") => {
    const id = Date.now() + Math.floor(Math.random() * 10000)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id))
    }, 3500)
  }

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
    fetchRecurringDayOverrides()
    fetchRecurringPaidStatuses()
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

  const fetchRecurringDayOverrides = async () => {
    const { data } = await supabase.from("recurring_payment_overrides").select("*")
    if (data) setRecurringDayOverrides(data as RecurringDayOverride[])
  }

  const fetchRecurringPaidStatuses = async () => {
    const { data } = await supabase.from("recurring_payment_paid_status").select("*")
    if (data) setRecurringPaidStatuses(data as RecurringPaidStatus[])
  }

  const isPaycheckDayForDate = (targetYear: number, targetMonth: number, targetDay: number) => {
    return isPaycheckDayUtc(
      payrollSettings.paycheckStartDate,
      payrollSettings.paycheckIntervalDays,
      targetYear,
      targetMonth,
      targetDay
    )
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

  const getRecurringOverrideForEntry = (entryId: number, targetYear: number, targetMonth: number) => {
    return recurringDayOverrides.find(
      (override) =>
        override.entry_id === entryId &&
        override.year === targetYear &&
        override.month === targetMonth
    )
  }

  const getRecurringPaidStatusForEntry = (
    entryId: number,
    targetYear: number,
    targetMonth: number
  ) => {
    return recurringPaidStatuses.find(
      (status) =>
        status.entry_id === entryId &&
        status.year === targetYear &&
        status.month === targetMonth
    )
  }

  const getEffectiveEntryDay = (entry: Entry, targetYear: number, targetMonth: number) => {
    if (entry.recurring !== "monthly" || !entry.id) return entry.day
    const override = getRecurringOverrideForEntry(entry.id, targetYear, targetMonth)
    return override?.day ?? entry.day
  }

  const isRecurringPaid = (entry: Entry) => {
    if (entry.recurring !== "monthly" || entry.id == null) return false
    return !!getRecurringPaidStatusForEntry(entry.id, year, month)?.paid
  }

  const currentStartingBalanceRecord = startingBalances.find(
    (record) => record.month === month && record.year === year
  )

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
        const effectiveDay = getEffectiveEntryDay(entry, targetYear, targetMonth)
        if (!applies || effectiveDay !== day) return

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

  const getManualStartingBalance = (targetYear: number, targetMonth: number) => {
    const match = startingBalances.find(
      (record) => record.year === targetYear && record.month === targetMonth
    )
    return match?.amount
  }

  const getComputedStartingBalance = (targetYear: number, targetMonth: number) => {
    const memo = new Map<string, number>()

    const compute = (yearValue: number, monthValue: number, depth: number): number => {
      const key = `${yearValue}-${monthValue}`
      const cached = memo.get(key)
      if (cached !== undefined) return cached

      const manual = getManualStartingBalance(yearValue, monthValue)
      if (manual !== undefined) {
        memo.set(key, manual)
        return manual
      }

      if (depth > 240) {
        memo.set(key, DEFAULT_STARTING_BALANCE)
        return DEFAULT_STARTING_BALANCE
      }

      const prevMonth = monthValue === 0 ? 11 : monthValue - 1
      const prevYear = monthValue === 0 ? yearValue - 1 : yearValue
      const prevStarting = compute(prevYear, prevMonth, depth + 1)
      const prevSummary = calculateMonthSummary(prevYear, prevMonth)
      const computed = prevStarting + prevSummary.net

      memo.set(key, computed)
      return computed
    }

    return compute(targetYear, targetMonth, 0)
  }

  const startingBalance = getComputedStartingBalance(year, month)

  const getBalanceForDay = (day: number) => {
    let running = startingBalance

    for (let currentDay = 1; currentDay <= day; currentDay++) {
      if (isPaycheckDay(currentDay)) {
        running += payrollSettings.basePay
        running += getCommissionForDate(currentDay)
      }

      entries.forEach((entry) => {
        const applies = entryAppliesToMonth(entry, year, month)
        const effectiveDay = getEffectiveEntryDay(entry, year, month)
        if (!applies || effectiveDay !== currentDay) return

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
      const effectiveDay = getEffectiveEntryDay(entry, year, month)
      if (!applies || effectiveDay !== day) return
      result.push({ label: entry.name, amount: entry.amount, type: entry.type })
    })

    return result
  }

  const getEditableEntriesForDay = (day: number) => {
    return entries.filter((entry) => {
      return entryAppliesToMonth(entry, year, month) && getEffectiveEntryDay(entry, year, month) === day
    })
  }

  const hasRecurringOnDay = (day: number) => {
    return entries.some((entry) => {
      if (entry.recurring !== "monthly") return false
      return (
        entryAppliesToMonth(entry, year, month) &&
        getEffectiveEntryDay(entry, year, month) === day
      )
    })
  }

  const hasMortgageOnDay = (day: number) => {
    return entries.some((entry) => {
      const applies = entryAppliesToMonth(entry, year, month)
      if (!applies || entry.type !== "expense") return false
      const effectiveDay = getEffectiveEntryDay(entry, year, month)
      return effectiveDay === day && /mortgage/i.test(entry.name)
    })
  }

  const hasIncomeOnDay = (day: number) => {
    return getEntriesForDay(day).some((item) => item.type === "income")
  }

  const hasExpenseOnDay = (day: number) => {
    return getEntriesForDay(day).some((item) => item.type === "expense")
  }

  const handleSaveEntry = async () => {
    const normalizedAmount = roundCurrency(amount)
    if (selectedDay === null || !name.trim() || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      pushToast("Entry needs a name and amount greater than 0.")
      return
    }

    if (editingEntry?.id) {
      const { error } = await supabase
        .from("expenses")
        .update({ name: name.trim(), amount: normalizedAmount, recurring, type })
        .eq("id", editingEntry.id)
      if (error) {
        pushToast(error.message)
        return
      }
    } else {
      const { error } = await supabase.from("expenses").insert([
        { day: selectedDay, name: name.trim(), amount: normalizedAmount, recurring, type, month, year }
      ])
      if (error) {
        pushToast(error.message)
        return
      }
    }

    await fetchEntries()
    resetEntryForm()
    pushToast("Entry saved.", "success")
  }

  const handleDeleteEntry = async (entry: Entry) => {
    if (entry.id == null) return
    const confirmed = window.confirm(`Delete "${entry.name}"?`)
    if (!confirmed) return

    const { error } = await supabase.from("expenses").delete().eq("id", entry.id)
    if (error) {
      pushToast(error.message)
      return
    }
    await fetchEntries()
    if (editingEntry?.id === entry.id) resetEntryForm()
    pushToast("Entry deleted.", "success")
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
    const parsed = parseCurrencyInput(balanceInput)
    if (parsed === null) {
      setBalanceError("Enter a valid number.")
      pushToast("Starting balance must be a valid number.")
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
        pushToast(error.message)
        setIsSavingBalance(false)
        return
      }
    } else {
      const { error } = await supabase
        .from("starting_balances")
        .insert([{ year, month, amount: parsed }])

      if (error) {
        setBalanceError(error.message)
        pushToast(error.message)
        setIsSavingBalance(false)
        return
      }
    }

    await fetchStartingBalances()
    setIsSavingBalance(false)
    setIsBalanceModalOpen(false)
    pushToast("Starting balance saved.", "success")
  }

  const saveRecurringPaymentDay = async (entry: Entry) => {
    if (entry.id == null) return

    setRecurringDayError("")
    setRecurringDayMessage("")

    const parsedDay = parseDayInput(recurringDayDrafts[String(entry.id)] ?? "", 1, daysInMonth)
    if (parsedDay === null) {
      setRecurringDayError(`Day must be between 1 and ${daysInMonth}.`)
      pushToast(`Day must be between 1 and ${daysInMonth}.`)
      return
    }

    const existingOverride = getRecurringOverrideForEntry(entry.id, year, month)
    setSavingRecurringEntryId(entry.id)

    let errorMessage: string | null = null

    if (parsedDay === entry.day) {
      if (existingOverride?.id) {
        const { error } = await supabase
          .from("recurring_payment_overrides")
          .delete()
          .eq("id", existingOverride.id)
        errorMessage = error?.message ?? null
      }
    } else if (existingOverride?.id) {
      const { error } = await supabase
        .from("recurring_payment_overrides")
        .update({ day: parsedDay })
        .eq("id", existingOverride.id)
      errorMessage = error?.message ?? null
    } else {
      const { error } = await supabase
        .from("recurring_payment_overrides")
        .insert([
          {
            entry_id: entry.id,
            year,
            month,
            day: parsedDay
          }
        ])
      errorMessage = error?.message ?? null
    }

    setSavingRecurringEntryId(null)

    if (errorMessage) {
      setRecurringDayError(errorMessage)
      pushToast(errorMessage)
      return
    }

    await fetchRecurringDayOverrides()
    await fetchEntries()
    setRecurringDayMessage(`Saved ${entry.name} for day ${parsedDay}.`)
    pushToast(`${entry.name} moved to day ${parsedDay}.`, "success")
  }

  const toggleRecurringPaidStatus = async (entry: Entry, nextPaid: boolean) => {
    if (entry.id == null) return

    const existing = getRecurringPaidStatusForEntry(entry.id, year, month)
    setSavingPaidEntryId(entry.id)

    let errorMessage: string | null = null

    if (!nextPaid) {
      if (existing?.id) {
        const { error } = await supabase
          .from("recurring_payment_paid_status")
          .delete()
          .eq("id", existing.id)
        errorMessage = error?.message ?? null
      }
    } else if (existing?.id) {
      const { error } = await supabase
        .from("recurring_payment_paid_status")
        .update({ paid: true })
        .eq("id", existing.id)
      errorMessage = error?.message ?? null
    } else {
      const { error } = await supabase
        .from("recurring_payment_paid_status")
        .insert([
          {
            entry_id: entry.id,
            year,
            month,
            paid: true
          }
        ])
      errorMessage = error?.message ?? null
    }

    setSavingPaidEntryId(null)

    if (errorMessage) {
      pushToast(errorMessage)
      return
    }

    await fetchRecurringPaidStatuses()
    pushToast(nextPaid ? `${entry.name} marked paid.` : `${entry.name} marked unpaid.`, "success")
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

  const saveCommissionForDay = async (day: number, parsed: number) => {
    const dateKey = getDateKey(year, month, day)
    const existing = getCommissionRecordForDate(day)

    if (parsed === 0) {
      if (existing?.id) {
        const { error } = await supabase
          .from("paychecks")
          .delete()
          .eq("id", existing.id)
        return error?.message ?? null
      }
      return null
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("paychecks")
        .update({ commission_amount: parsed })
        .eq("id", existing.id)
      return error?.message ?? null
    }

    const { error } = await supabase
      .from("paychecks")
      .insert([{ date: dateKey, commission_amount: parsed }])
    return error?.message ?? null
  }

  const saveCommission = async () => {
    if (selectedCommissionDay === null) return

    const parsed = parseCurrencyInput(commissionInput)
    if (parsed === null || parsed < 0) {
      setCommissionError("Enter a valid commission amount of 0 or more.")
      pushToast("Commission must be 0 or greater.")
      return
    }

    setIsSavingCommission(true)
    const error = await saveCommissionForDay(selectedCommissionDay, parsed)
    setIsSavingCommission(false)

    if (error) {
      setCommissionError(error)
      pushToast(error)
      return
    }

    await fetchCommissions()
    closeCommissionModal()
    pushToast("Commission saved.", "success")
  }

  const openSettingsModal = () => {
    const drafts: Record<number, string> = {}
    for (let day = 1; day <= daysInMonth; day++) {
      if (!isPaycheckDay(day)) continue
      drafts[day] = String(getCommissionForDate(day))
    }
    setAdminCommissionDrafts(drafts)
    setAdminCommissionMessage("")
    setAdminCommissionError("")
    setIsSettingsModalOpen(true)
  }

  const saveAdminCommissionForDay = async (day: number) => {
    setAdminCommissionMessage("")
    setAdminCommissionError("")

    const parsed = parseCurrencyInput(adminCommissionDrafts[day] ?? "")
    if (parsed === null || parsed < 0) {
      setAdminCommissionError("Commission must be a number 0 or greater.")
      pushToast("Commission must be 0 or greater.")
      return
    }

    setSavingCommissionDay(day)
    const error = await saveCommissionForDay(day, parsed)
    setSavingCommissionDay(null)

    if (error) {
      setAdminCommissionError(error)
      pushToast(error)
      return
    }

    await fetchCommissions()
    setAdminCommissionMessage(
      `Saved commission for ${currentMonth.toLocaleString("default", { month: "short" })} ${day}.`
    )
    pushToast("Commission saved.", "success")
  }

  const savePayrollSettings = () => {
    setSettingsMessage("")
    setSettingsError("")

    const basePay = parseCurrencyInput(payrollDraft.basePay)
    const interval = Number(payrollDraft.paycheckIntervalDays)
    const startDate = payrollDraft.paycheckStartDate

    if (basePay === null || basePay < 0) {
      setSettingsError("Base pay must be a number 0 or greater.")
      pushToast("Base pay must be 0 or greater.")
      return
    }

    if (!Number.isFinite(interval) || interval <= 0) {
      setSettingsError("Paycheck interval must be greater than 0.")
      pushToast("Paycheck interval must be greater than 0.")
      return
    }

    if (!parseDateKey(startDate)) {
      setSettingsError("Paycheck start date must be a valid date.")
      pushToast("Paycheck start date must be a valid date.")
      return
    }

    const normalized: PayrollSettings = {
      basePay: roundCurrency(basePay),
      paycheckStartDate: startDate,
      paycheckIntervalDays: Math.floor(interval)
    }

    setPayrollSettings(normalized)
    setPayrollDraft(normalized)
    localStorage.setItem(PAYROLL_STORAGE_KEY, JSON.stringify(normalized))
    setSettingsMessage("Saved payroll settings on this device.")
    pushToast("Payroll settings saved.", "success")
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
  const paydayDaysInMonth = days.filter((day) => isPaycheckDay(day))
  const summary = calculateMonthSummary(year, month)

  const monthlyReport = Array.from({ length: 12 }, (_, monthIndex) => {
    const monthSummary = calculateMonthSummary(year, monthIndex)
    return { month: monthIndex, ...monthSummary }
  })
  const recurringPaymentsForMonth = entries
    .filter((entry) => {
      return (
        entry.type === "expense" &&
        entry.recurring === "monthly" &&
        entryAppliesToMonth(entry, year, month)
      )
    })
    .sort((a, b) => {
      const dayA = getEffectiveEntryDay(a, year, month)
      const dayB = getEffectiveEntryDay(b, year, month)
      return dayA - dayB || a.name.localeCompare(b.name)
    })
  const recurringSubtotal = recurringPaymentsForMonth.reduce(
    (sum, entry) => sum + entry.amount,
    0
  )

  const selectedDayEntries = selectedDay === null ? [] : getEditableEntriesForDay(selectedDay)

  useEffect(() => {
    const drafts: Record<string, string> = {}
    entries.forEach((entry) => {
      if (
        entry.type === "expense" &&
        entry.recurring === "monthly" &&
        entryAppliesToMonth(entry, year, month) &&
        entry.id
      ) {
        const override = recurringDayOverrides.find(
          (item) =>
            item.entry_id === entry.id &&
            item.year === year &&
            item.month === month
        )
        drafts[String(entry.id)] = String(override?.day ?? entry.day)
      }
    })
    setRecurringDayDrafts(drafts)
  }, [entries, recurringDayOverrides, year, month])

  return (
    <div className="max-w-5xl mx-auto mt-10">
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[70] space-y-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-md px-3 py-2 text-sm shadow ${
                toast.type === "error"
                  ? "bg-red-600 text-white"
                  : "bg-green-600 text-white"
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

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
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/mobile-entry"
          className="px-3 py-2 rounded border bg-white text-sm"
        >
          Open Mobile Expense Entry
        </Link>
        <Link
          href="/debts"
          className="px-3 py-2 rounded border bg-white text-sm"
        >
          Open Debts
        </Link>
        <button
          onClick={openBalanceModal}
          className="px-3 py-2 rounded border bg-white text-sm"
        >
          Set Starting Balance
        </button>
        <button
          onClick={() => setShowRecurringPayments((prev) => !prev)}
          className="px-3 py-2 rounded border bg-white text-sm"
        >
          {showRecurringPayments
            ? "Hide Month's Recurring Payments"
            : "Show Month's Recurring Payments"}
        </button>
        <button
          onClick={() => setShowMonthlyReport((prev) => !prev)}
          className="px-3 py-2 rounded border bg-white text-sm"
        >
          {showMonthlyReport ? "Hide Monthly Report" : `Show Monthly Report (${year})`}
        </button>
        {isAdmin && (
          <button
            onClick={openSettingsModal}
            className="px-3 py-2 rounded border bg-white text-sm"
          >
            Admin Payroll Settings
          </button>
        )}
      </div>

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

      {showRecurringPayments && (
        <div className="mb-6 rounded-xl border bg-white p-4 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-semibold mb-3">
            Recurring Payments - {currentMonth.toLocaleString("default", { month: "long" })} {year}
          </h3>

          {recurringPaymentsForMonth.length === 0 ? (
            <p className="text-sm text-gray-500">No recurring payments this month.</p>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2">Date</th>
                    <th className="py-2">Name</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Paid Day</th>
                    <th className="py-2">Paid</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringPaymentsForMonth.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-b last:border-b-0 ${
                        isRecurringPaid(entry) ? "bg-gray-50 text-gray-500" : ""
                      }`}
                    >
                      <td className="py-2">
                        {currentMonth.toLocaleString("default", { month: "short" })}{" "}
                        {getEffectiveEntryDay(entry, year, month)}
                      </td>
                      <td className={`py-2 ${isRecurringPaid(entry) ? "line-through" : ""}`}>
                        {entry.name}
                      </td>
                      <td
                        className={`py-2 ${
                          isRecurringPaid(entry) ? "line-through text-gray-500" : "text-red-700"
                        }`}
                      >
                        ${entry.amount.toLocaleString()}
                      </td>
                      <td className="py-2">
                        {entry.id ? (
                          <input
                            type="number"
                            min="1"
                            max={daysInMonth}
                            value={
                              recurringDayDrafts[String(entry.id)] ??
                              String(getEffectiveEntryDay(entry, year, month))
                            }
                            onChange={(event) =>
                              setRecurringDayDrafts((prev) => ({
                                ...prev,
                                [String(entry.id)]: event.target.value
                              }))
                            }
                            className="w-20 border rounded p-1 text-xs"
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2">
                        {entry.id ? (
                          <input
                            type="checkbox"
                            checked={isRecurringPaid(entry)}
                            onChange={(event) => toggleRecurringPaidStatus(entry, event.target.checked)}
                            disabled={savingPaidEntryId === entry.id}
                            className="h-4 w-4"
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          {entry.id && (
                            <button
                              onClick={() => saveRecurringPaymentDay(entry)}
                              className="px-2 py-1 rounded border text-xs"
                              disabled={savingRecurringEntryId === entry.id}
                            >
                              {savingRecurringEntryId === entry.id ? "Saving..." : "Save Day"}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedDay(getEffectiveEntryDay(entry, year, month))
                              openEntryEditor(entry)
                            }}
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
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 text-right text-sm font-semibold">
                Subtotal: ${recurringSubtotal.toLocaleString()}
              </div>
              {recurringDayError && (
                <p className="mt-2 text-sm text-red-600">{recurringDayError}</p>
              )}
              {recurringDayMessage && (
                <p className="mt-2 text-sm text-green-600">{recurringDayMessage}</p>
              )}
            </>
          )}
        </div>
      )}

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
          const hasIncome = hasIncomeOnDay(day)
          const hasExpense = hasExpenseOnDay(day)

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
              className={`relative p-2 sm:p-4 h-20 sm:h-24 rounded-xl shadow-sm border cursor-pointer overflow-hidden ${bgColor}`}
            >
              <div className="font-semibold text-[11px] sm:text-sm flex items-center gap-0.5 sm:gap-1 whitespace-nowrap overflow-hidden">
                {day}
                {payday && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      openCommissionModal(day)
                    }}
                    className="rounded border border-green-300 bg-green-50 px-0.5 sm:px-1 text-[10px] sm:text-xs leading-none"
                    title="Set commission for this payday"
                  >
                    $
                  </button>
                )}
                {hasRecurringOnDay(day) && <span className="text-[10px] sm:text-xs leading-none">R</span>}
                {hasMortgageOnDay(day) && <span className="text-[10px] sm:text-xs leading-none">🏠</span>}
                {hasIncome && <span className="text-green-700 text-[10px] sm:text-xs leading-none">↑</span>}
                {hasExpense && <span className="text-red-700 text-[10px] sm:text-xs leading-none">↓</span>}
              </div>

              <div className="text-[10px] sm:text-xs mt-1 sm:mt-2 leading-tight truncate">
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

          <div className="relative bg-white p-6 rounded-xl w-full max-w-2xl shadow-xl max-h-[85vh] overflow-y-auto">
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

            <div className="mt-6 border-t pt-4">
              <h4 className="text-sm font-semibold mb-3">
                Commissions - {currentMonth.toLocaleString("default", { month: "long" })} {year}
              </h4>

              {paydayDaysInMonth.length === 0 ? (
                <p className="text-sm text-gray-500">No paydays in this month.</p>
              ) : (
                <div className="space-y-2">
                  {paydayDaysInMonth.map((day) => (
                    <div
                      key={day}
                      className="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
                    >
                      <div className="text-sm text-gray-700">
                        {currentMonth.toLocaleString("default", { month: "short" })} {day}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={adminCommissionDrafts[day] ?? "0"}
                        onChange={(event) =>
                          setAdminCommissionDrafts((prev) => ({
                            ...prev,
                            [day]: event.target.value
                          }))
                        }
                        className="w-full border rounded p-2 text-sm"
                      />
                      <button
                        onClick={() => saveAdminCommissionForDay(day)}
                        className="px-3 py-2 rounded border text-sm"
                        disabled={savingCommissionDay === day}
                      >
                        {savingCommissionDay === day ? "Saving..." : "Save"}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {adminCommissionError && (
                <p className="mt-3 text-sm text-red-600">{adminCommissionError}</p>
              )}
              {adminCommissionMessage && (
                <p className="mt-3 text-sm text-green-600">{adminCommissionMessage}</p>
              )}
            </div>

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
