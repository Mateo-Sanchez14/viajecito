"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
      className="flex flex-col gap-3 rounded-xl border p-4"
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
      <h2>{t("fx.title")}</h2>
      <p>
        {t("fx.help", {
          currency: currency || "…",
          tripCurrency: budget.currency,
        })}
      </p>
      <label>
        {t("fx.currency")}
        <input
          className="block min-h-11 rounded border p-2"
          maxLength={3}
          required
          pattern="[A-Z]{3}"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
        />
      </label>
      <label>
        {t("fx.rate")}
        <input
          className="block min-h-11 rounded border p-2"
          inputMode="decimal"
          required
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
      </label>
      {(error || save.isError) && <p role="alert">{t("fx.invalid")}</p>}
      {save.isSuccess && <p role="status">{t("fx.saved")}</p>}
      <button
        className="min-h-11 rounded border px-3"
        type="submit"
        disabled={save.isPending}
      >
        {t("fx.save")}
      </button>
      <dl>
        {Object.entries(budget.fx_rates).map(([code, value]) => (
          <div key={code}>
            <dt>{code}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </form>
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
  const budget = useBudget(tripId);
  const data = budget.data;
  return (
    <div className="flex flex-col gap-5" data-crew-id={crewId}>
      <h2 className="text-2xl font-semibold">{t("title")}</h2>
      {budget.isPending && <p role="status">{t("loading")}</p>}
      {budget.isError && <p role="alert">{t("loadFailed")}</p>}
      {data && (
        <>
          <p className="text-xl font-semibold">
            <MoneyAmount amount={data.per_person} currency={data.currency} />{" "}
            {t("perPersonSuffix")}
          </p>
          <p>{t("participants", { n: data.participants })}</p>
          {data.participants_basis !== "in" && (
            <p>{t("participantsAssumed")}</p>
          )}
          <dl>
            <dt>{t("committed")}</dt>
            <dd>
              <MoneyAmount amount={data.committed} currency={data.currency} />
            </dd>
            <dt>{t("expected")}</dt>
            <dd>
              <MoneyAmount amount={data.expected} currency={data.currency} />
            </dd>
            <dt>{t("total")}</dt>
            <dd>
              <MoneyAmount amount={data.total} currency={data.currency} />
            </dd>
          </dl>
          <p>
            {t("remainderPrefix")}{" "}
            <MoneyAmount amount={data.remainder} currency={data.currency} />
          </p>
          {!data.lines.length &&
            !data.unconverted.length &&
            !data.missing_price.length && <p>{t("empty")}</p>}
          {Object.entries(data.by_category).map(([category, total]) => (
            <section key={category}>
              <h2>
                {t(`category.${category}`)}:{" "}
                <MoneyAmount amount={total} currency={data.currency} />
              </h2>
              <ul>
                {data.lines
                  .filter((line) => line.category === category)
                  .map((line) => (
                    <li className="py-2" key={line.proposal_id}>
                      {line.title} ·{" "}
                      {line.amount !== null && (
                        <MoneyAmount
                          amount={line.amount}
                          currency={data.currency}
                        />
                      )}{" "}
                      · {t(line.status === "booked" ? "committed" : "expected")}
                      {line.nights_assumed && (
                        <span> · {t("nightsAssumed")}</span>
                      )}
                    </li>
                  ))}
              </ul>
            </section>
          ))}
          {data.unconverted.map((line) => (
            <p role="status" key={line.proposal_id}>
              {t("unconverted", { currency: line.original_currency })}
            </p>
          ))}
          {data.missing_price.length > 0 && (
            <p>
              {t("missingPrice", {
                titles: data.missing_price.map((line) => line.title).join(", "),
              })}
            </p>
          )}
          <FxRatesForm tripId={tripId} budget={data} />
          {data.gastito_url && /^https:\/\//.test(data.gastito_url) && (
            <a href={data.gastito_url} rel="noopener noreferrer">
              {t("gastito")}
            </a>
          )}
        </>
      )}
    </div>
  );
}
