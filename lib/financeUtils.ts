export const roundCurrency = (value: number) => {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export const parseCurrencyInput = (value: string | number) => {
  const raw = String(value).replace(/[$,\s]/g, "")
  if (!raw) return null

  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return roundCurrency(parsed)
}

export const parseDayInput = (value: string | number, min: number, max: number) => {
  const parsed = Number(String(value).trim())
  if (!Number.isInteger(parsed)) return null
  if (parsed < min || parsed > max) return null
  return parsed
}

export const isPaycheckDayUtc = (
  paycheckStartDate: string,
  intervalDays: number,
  year: number,
  month: number,
  day: number
) => {
  const [startYear, startMonth, startDay] = paycheckStartDate.split("-").map(Number)
  if (!startYear || !startMonth || !startDay) return false
  if (!Number.isFinite(intervalDays) || intervalDays <= 0) return false

  const toUtcDayNumber = (targetYear: number, targetMonth: number, targetDay: number) =>
    Math.floor(Date.UTC(targetYear, targetMonth, targetDay) / (1000 * 60 * 60 * 24))

  const currentDayNumber = toUtcDayNumber(year, month, day)
  const startDayNumber = toUtcDayNumber(startYear, startMonth - 1, startDay)
  const diff = currentDayNumber - startDayNumber

  return diff >= 0 && diff % Math.floor(intervalDays) === 0
}
