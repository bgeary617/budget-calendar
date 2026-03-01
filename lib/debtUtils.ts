export type DebtInput = {
  current_balance: number
  apr: number
  minimum_payment: number
  extra_payment?: number | null
}

export type DebtPayoff = {
  monthsToPayoff: number | null
  totalInterest: number
  payoffDate: Date | null
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

export const getMonthlyPayment = (debt: DebtInput) => {
  return round2(debt.minimum_payment + (debt.extra_payment ?? 0))
}

export const calculateDebtPayoff = (
  debt: DebtInput,
  startDate = new Date(),
  maxMonths = 1200
): DebtPayoff => {
  let balance = round2(Math.max(0, debt.current_balance))
  const monthlyRate = Math.max(0, debt.apr) / 100 / 12
  const payment = getMonthlyPayment(debt)
  let months = 0
  let totalInterest = 0

  if (balance === 0) {
    return {
      monthsToPayoff: 0,
      totalInterest: 0,
      payoffDate: new Date(startDate)
    }
  }

  if (payment <= 0) {
    return { monthsToPayoff: null, totalInterest: 0, payoffDate: null }
  }

  while (balance > 0 && months < maxMonths) {
    const interest = round2(balance * monthlyRate)
    totalInterest = round2(totalInterest + interest)

    const principalPaid = round2(payment - interest)
    if (principalPaid <= 0) {
      return { monthsToPayoff: null, totalInterest, payoffDate: null }
    }

    balance = round2(Math.max(0, balance - principalPaid))
    months += 1
  }

  if (balance > 0) {
    return { monthsToPayoff: null, totalInterest, payoffDate: null }
  }

  const payoffDate = new Date(startDate)
  payoffDate.setMonth(payoffDate.getMonth() + months)

  return {
    monthsToPayoff: months,
    totalInterest,
    payoffDate
  }
}
