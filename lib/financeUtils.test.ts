import { describe, expect, it } from "vitest"
import {
  isPaycheckDayUtc,
  parseCurrencyInput,
  parseDayInput,
  roundCurrency
} from "./financeUtils"

describe("financeUtils", () => {
  it("rounds currency to two decimals", () => {
    expect(roundCurrency(12.345)).toBe(12.35)
    expect(roundCurrency(12.344)).toBe(12.34)
  })

  it("parses currency input strings with formatting", () => {
    expect(parseCurrencyInput("$1,234.567")).toBe(1234.57)
    expect(parseCurrencyInput(" 98.1 ")).toBe(98.1)
    expect(parseCurrencyInput("")).toBeNull()
    expect(parseCurrencyInput("abc")).toBeNull()
  })

  it("parses day input with bounds", () => {
    expect(parseDayInput("14", 1, 31)).toBe(14)
    expect(parseDayInput("0", 1, 31)).toBeNull()
    expect(parseDayInput("32", 1, 31)).toBeNull()
    expect(parseDayInput("7.5", 1, 31)).toBeNull()
  })

  it("detects paycheck days with UTC-safe math", () => {
    expect(isPaycheckDayUtc("2026-02-20", 14, 2026, 2, 6)).toBe(true)
    expect(isPaycheckDayUtc("2026-02-20", 14, 2026, 2, 20)).toBe(true)
    expect(isPaycheckDayUtc("2026-02-20", 14, 2026, 2, 13)).toBe(false)
  })
})
