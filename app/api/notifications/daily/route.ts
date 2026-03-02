import { NextResponse } from "next/server"
import { supabaseAdmin } from "../../../../lib/supabaseAdmin"

type NotificationSetting = {
  user_id: string
  email: string
  timezone: string
  enabled: boolean
}

type ExpenseRow = {
  id: number
  user_id: string
  name: string
  amount: number
  day: number
  month: number
  year: number
  recurring: "none" | "monthly"
  type: "expense" | "income"
}

type RecurringOverrideRow = {
  entry_id: number
  year: number
  month: number
  day: number
}

type RecurringPaidStatusRow = {
  entry_id: number
  year: number
  month: number
  paid: boolean
}

const getDatePartsInTimeZone = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })

  const parts = formatter.formatToParts(date)
  const values: Record<string, string> = {}
  parts.forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value
  })

  const year = Number(values.year)
  const monthIndex = Number(values.month) - 1
  const day = Number(values.day)

  return { year, monthIndex, day }
}

const sendEmail = async (to: string, subject: string, html: string) => {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.NOTIFICATION_EMAIL_FROM

  if (!apiKey) throw new Error("Missing RESEND_API_KEY")
  if (!from) throw new Error("Missing NOTIFICATION_EMAIL_FROM")

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html
    })
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend failed: ${response.status} ${body}`)
  }
}

const buildEmailHtml = (
  dateLabel: string,
  timezone: string,
  dueItems: { name: string; amount: number }[]
) => {
  const total = dueItems.reduce((sum, item) => sum + item.amount, 0)
  const list =
    dueItems.length === 0
      ? `<li>No payments due today.</li>`
      : dueItems
          .map(
            (item) =>
              `<li><strong>${item.name}</strong>: $${item.amount.toLocaleString()}</li>`
          )
          .join("")

  return `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #111;">
      <h2>Daily Payments Due</h2>
      <p><strong>Date:</strong> ${dateLabel}</p>
      <p><strong>Timezone:</strong> ${timezone}</p>
      <ul>${list}</ul>
      <p><strong>Total Due Today:</strong> $${total.toLocaleString()}</p>
    </div>
  `
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, error: "Missing CRON_SECRET" },
      { status: 500 }
    )
  }

  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const { data: settingsData, error: settingsError } = await supabaseAdmin
    .from("notification_settings")
    .select("user_id,email,timezone,enabled")
    .eq("enabled", true)

  if (settingsError) {
    return NextResponse.json(
      { ok: false, error: settingsError.message },
      { status: 500 }
    )
  }

  const settings = (settingsData ?? []) as NotificationSetting[]
  const now = new Date()
  const sent: { user_id: string; email: string; due_count: number }[] = []

  for (const setting of settings) {
    const tz = setting.timezone || "America/New_York"
    const { year, monthIndex, day } = getDatePartsInTimeZone(now, tz)
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "long",
      day: "numeric",
      year: "numeric"
    }).format(now)

    const { data: oneTimeRows, error: oneTimeError } = await supabaseAdmin
      .from("expenses")
      .select("*")
      .eq("user_id", setting.user_id)
      .eq("type", "expense")
      .eq("recurring", "none")
      .eq("year", year)
      .eq("month", monthIndex)
      .eq("day", day)

    if (oneTimeError) {
      return NextResponse.json(
        { ok: false, error: oneTimeError.message },
        { status: 500 }
      )
    }

    const { data: recurringRows, error: recurringError } = await supabaseAdmin
      .from("expenses")
      .select("*")
      .eq("user_id", setting.user_id)
      .eq("type", "expense")
      .eq("recurring", "monthly")

    if (recurringError) {
      return NextResponse.json(
        { ok: false, error: recurringError.message },
        { status: 500 }
      )
    }

    const { data: overrideRows, error: overrideError } = await supabaseAdmin
      .from("recurring_payment_overrides")
      .select("entry_id,year,month,day")
      .eq("user_id", setting.user_id)
      .eq("year", year)
      .eq("month", monthIndex)

    if (overrideError) {
      return NextResponse.json(
        { ok: false, error: overrideError.message },
        { status: 500 }
      )
    }

    const { data: paidRows, error: paidError } = await supabaseAdmin
      .from("recurring_payment_paid_status")
      .select("entry_id,year,month,paid")
      .eq("user_id", setting.user_id)
      .eq("year", year)
      .eq("month", monthIndex)
      .eq("paid", true)

    if (paidError) {
      return NextResponse.json(
        { ok: false, error: paidError.message },
        { status: 500 }
      )
    }

    const oneTime = (oneTimeRows ?? []) as ExpenseRow[]
    const recurring = (recurringRows ?? []) as ExpenseRow[]
    const overrides = (overrideRows ?? []) as RecurringOverrideRow[]
    const paidStatuses = (paidRows ?? []) as RecurringPaidStatusRow[]

    const overrideByEntry = new Map<number, RecurringOverrideRow>()
    overrides.forEach((item) => {
      overrideByEntry.set(item.entry_id, item)
    })

    const paidEntryIds = new Set<number>(paidStatuses.map((item) => item.entry_id))

    const dueRecurring = recurring.filter((entry) => {
      const started =
        entry.year < year || (entry.year === year && entry.month <= monthIndex)
      if (!started) return false

      const effectiveDay = overrideByEntry.get(entry.id)?.day ?? entry.day
      const isDueToday = effectiveDay === day
      if (!isDueToday) return false

      return !paidEntryIds.has(entry.id)
    })

    const dueItems = [...oneTime, ...dueRecurring].map((item) => ({
      name: item.name,
      amount: Number(item.amount)
    }))

    const subject = `Payments Due Today - ${dateLabel}`
    const html = buildEmailHtml(dateLabel, tz, dueItems)
    await sendEmail(setting.email, subject, html)

    sent.push({
      user_id: setting.user_id,
      email: setting.email,
      due_count: dueItems.length
    })
  }

  return NextResponse.json({ ok: true, sent_count: sent.length, sent })
}
