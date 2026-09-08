const money = (value: number) => Number(Number(value).toFixed(2));

export function calculateOrderSettlement(budget: number, commissionRate: number, depositRate: number) {
  const depositAmount = money(budget * depositRate);
  const balanceAmount = money(budget - depositAmount);
  const balanceCommissionAmount = money(balanceAmount * commissionRate);
  return {
    depositAmount,
    balanceAmount,
    depositCommissionAmount: 0,
    balanceCommissionAmount,
    platformCommissionAmount: balanceCommissionAmount,
    depositDesignerPayout: depositAmount,
    balanceDesignerPayout: money(balanceAmount - balanceCommissionAmount),
    designerPayout: money(budget - balanceCommissionAmount)
  };
}
