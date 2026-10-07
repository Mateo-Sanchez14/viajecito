const minorUnits: Record<string, number> = {
  ARS: 0,
  CLP: 0,
  PYG: 0,
  UYU: 0,
  USD: 2,
  EUR: 2,
  BRL: 2,
};
export function MoneyAmount({
  amount,
  currency,
}: {
  amount: string;
  currency: string;
}) {
  const digits = minorUnits[currency] ?? 2;
  return (
    <span className="ui-tabular">
      {new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency,
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(Number(amount))}
    </span>
  );
}
