export interface FeeBreakdown {
  gross_amount: number;
  fee_percent: number;
  fee_amount: number;
  net_amount: number;
}

export function getPlatformFeePercent(amountTon: number): number {
  if (amountTon === 5) return 15;
  if (amountTon > 5 && amountTon < 10) return 10;
  if (amountTon >= 10 && amountTon < 25) return 7;
  if (amountTon >= 25 && amountTon < 100) return 5;
  if (amountTon >= 100 && amountTon < 300) return 4;
  if (amountTon >= 300) return 3;
  return 15;
}

export function calculateFeeBreakdown(amountTon: number): FeeBreakdown {
  const gross = Number(amountTon.toFixed(4));
  const feePercent = getPlatformFeePercent(gross);
  const feeAmount = Number((gross * feePercent / 100).toFixed(4));
  const netAmount = Number((gross - feeAmount).toFixed(4));
  return {
    gross_amount: gross,
    fee_percent: feePercent,
    fee_amount: feeAmount,
    net_amount: netAmount,
  };
}
