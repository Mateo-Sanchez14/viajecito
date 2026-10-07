"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/ui/atoms/Badge";
import { Button } from "@/ui/atoms/Button";
import { ButtonLink } from "@/ui/atoms/ButtonLink";
import { Card } from "@/ui/atoms/Card";
import { Input } from "@/ui/atoms/Input";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { ArrowSquareOutIcon, WarningCircleIcon } from "@/ui/icons";
import { EmptyArt } from "@/ui/illustrations/EmptyArt";
import { EmptyState } from "@/ui/molecules/EmptyState";
import { InlineError } from "@/ui/molecules/InlineError";
import { useBudget } from "../hooks/useBudget";
import { setFxRates, type Budget } from "../api/budget";
import { MoneyAmount } from "../components/MoneyAmount";

export function FxRatesForm({
  tripId,
  budget,
}: {
  tripId: string;
  budget: Budget;
}) {
  const t = useTranslations("budget");
  const cache = useQueryClient();
  const [currency, setCurrency] = useState("");
  const [rate, setRate] = useState("");
  const [error, setError] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      setFxRates(tripId, { rates: { ...budget.fx_rates, [currency]: rate } }),
    onSuccess: async () => {
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["budget", tripId] }),
        cache.invalidateQueries({ queryKey: ["trips", tripId] }),
      ]);
    },
  });
  return (
    <form
      className="ui-card ui-form bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const valid =
          /^[A-Z]{3}$/.test(currency) &&
          currency !== budget.currency &&
          /^\d+(\.\d{1,6})?$/.test(rate) &&
          Number(rate) > 0 &&
          (currency in budget.fx_rates ||
            Object.keys(budget.fx_rates).length < 10);
        setError(!valid);
        if (valid) save.mutate();
      }}
    >
      <h3 className="ui-form-title">{t("fx.title")}</h3>
      <p className="ui-hint">
        {t("fx.help", {
          currency: currency || "…",
          tripCurrency: budget.currency,
        })}
      </p>
      <div className="ui-field-grid">
        <label className="ui-field">
          {t("fx.currency")}
          <Input
            maxLength={3}
            required
            pattern="[A-Z]{3}"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          />
        </label>
        <label className="ui-field">
          {t("fx.rate")}
          <Input
            inputMode="decimal"
            required
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
        </label>
      </div>
      {(error || save.isError) && <InlineError message={t("fx.invalid")} />}
      {save.isSuccess && (
        <p role="status" className="ui-hint">
          {t("fx.saved")}
        </p>
      )}
      <div className="ui-form-actions">
        <Button type="submit" className="ui-button-auto" disabled={save.isPending}>
          {t("fx.save")}
        </Button>
      </div>
      {Object.keys(budget.fx_rates).length > 0 && (
        <dl className="ui-chip-list">
          {Object.entries(budget.fx_rates).map(([code, value]) => (
            <div key={code} className="ui-chip">
              <dt>{code}</dt>
              <dd className="ui-tabular">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </form>
  );
}

/** Shaped like the loaded view: one hero block, then rows. */
function BudgetSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      <Skeleton className="loading-hero" />
      <Skeleton className="loading-row" />
      <Skeleton className="loading-row" />
      <Skeleton className="loading-row" />
    </div>
  );
}

export function BudgetView({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("budget");
  const ui = useTranslations("ui");
  const budget = useBudget(tripId);
  const data = budget.data;
  const empty =
    data &&
    !data.lines.length &&
    !data.unconverted.length &&
    !data.missing_price.length;
  return (
    <div className="ui-stack" data-crew-id={crewId}>
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      {budget.isPending && <BudgetSkeleton label={t("loading")} />}
      {budget.isError && (
        <InlineError
          message={t("loadFailed")}
          retryLabel={ui("retry")}
          onRetry={() => void budget.refetch()}
        />
      )}
      {data && (
        <>
          {empty ? (
            <EmptyState
              art={<EmptyArt scene="coins" />}
              title={t("emptyTitle")}
              description={t("empty")}
            />
          ) : (
            <>
              <Card as="section" className="budget-hero">
                <p className="budget-per-person">
                  <MoneyAmount amount={data.per_person} currency={data.currency} />{" "}
                  {t("perPersonSuffix")}
                </p>
                <p className="text-sm text-muted">
                  {t("participants", { n: data.participants })}
                </p>
                {data.participants_basis !== "in" && (
                  <p className="ui-hint">{t("participantsAssumed")}</p>
                )}
              </Card>
              <dl className="budget-totals">
                {(
                  [
                    ["committed", data.committed],
                    ["expected", data.expected],
                    ["total", data.total],
                  ] as const
                ).map(([key, amount]) => (
                  <Card key={key} className="budget-total">
                    <dt>{t(key)}</dt>
                    <dd>
                      <MoneyAmount amount={amount} currency={data.currency} />
                    </dd>
                  </Card>
                ))}
              </dl>
              <p className="ui-hint">
                {t("remainderPrefix")}{" "}
                <MoneyAmount amount={data.remainder} currency={data.currency} />
              </p>
            </>
          )}
          {Object.entries(data.by_category).map(([category, total]) => (
            <Card as="section" key={category}>
              <h3 className="budget-category-head">
                <span>{t(`category.${category}`)}</span>
                <MoneyAmount amount={total} currency={data.currency} />
              </h3>
              <ul className="ui-list" style={{ gap: 0 }}>
                {data.lines
                  .filter((line) => line.category === category)
                  .map((line) => (
                    <li className="budget-line" key={line.proposal_id}>
                      <span className="budget-line-title">{line.title}</span>
                      {line.amount !== null && (
                        <MoneyAmount
                          amount={line.amount}
                          currency={data.currency}
                        />
                      )}
                      <Badge variant={line.status === "booked" ? "ok" : "neutral"}>
                        {t(line.status === "booked" ? "committed" : "expected")}
                      </Badge>
                      {line.nights_assumed && (
                        <Badge variant="degraded">{t("nightsAssumed")}</Badge>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          ))}
          {data.unconverted.map((line) => (
            <p role="status" className="ui-notice" key={line.proposal_id}>
              <WarningCircleIcon size={18} aria-hidden="true" />
              {t("unconverted", { currency: line.original_currency })}
            </p>
          ))}
          {data.missing_price.length > 0 && (
            <p className="ui-notice">
              <WarningCircleIcon size={18} aria-hidden="true" />
              {t("missingPrice", {
                titles: data.missing_price.map((line) => line.title).join(", "),
              })}
            </p>
          )}
          <FxRatesForm tripId={tripId} budget={data} />
          {data.gastito_url && /^https:\/\//.test(data.gastito_url) && (
            <div>
              <ButtonLink
                href={data.gastito_url}
                rel="noopener noreferrer"
                variant="secondary"
              >
                {t("gastito")}
                <ArrowSquareOutIcon size={18} aria-hidden="true" />
              </ButtonLink>
            </div>
          )}
        </>
      )}
    </div>
  );
}
