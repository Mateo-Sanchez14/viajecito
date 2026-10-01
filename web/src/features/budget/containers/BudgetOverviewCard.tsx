"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import { useBudget } from "../hooks/useBudget";
import { MoneyAmount } from "../components/MoneyAmount";
export function BudgetOverviewCard({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("budget");
  const budget = useBudget(tripId);
  return (
    <Card as="section">
      <h3>
        <Link href={`/crews/${crewId}/trips/${tripId}/budget`}>
          {t("title")}
        </Link>
      </h3>
      {budget.isError && <p role="alert">{t("loadFailed")}</p>}
      {budget.data && (
        <p>
          <MoneyAmount
            currency={budget.data.currency}
            amount={budget.data.per_person}
          />{" "}
          {t("perPersonSuffix")}
        </p>
      )}
    </Card>
  );
}
