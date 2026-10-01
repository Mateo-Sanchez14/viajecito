"use client";

import { useTranslations } from "next-intl";
import type { VoteTally, VoteValue } from "../api/proposals";
import { useVote } from "../hooks/mutations";
import { useErrorMessage } from "../lib/useErrorMessage";

const OPTIONS = [
  { value: 1, key: "up", count: "up" },
  { value: 0, key: "neutral", count: "neutral" },
  { value: -1, key: "down", count: "down" },
] as const satisfies readonly { value: VoteValue; key: string; count: keyof VoteTally }[];

type VoteButtonsProps = {
  proposalId: string;
  tally: VoteTally;
  /** A discarded proposal is closed to votes. */
  disabled?: boolean;
};

/**
 * +1 / 0 / -1 for the signed-in person. Wired to `useVote`, which updates the tally optimistically;
 * pressing the current choice again removes the vote.
 */
export function VoteButtons({ proposalId, tally, disabled = false }: VoteButtonsProps) {
  const t = useTranslations("proposals.vote");
  const errorMessage = useErrorMessage();
  const vote = useVote(proposalId);

  return (
    <div className="flex flex-col gap-1">
      <div role="group" aria-label={t("label")} className="inline-flex w-full overflow-hidden rounded-xl border border-border">
        {OPTIONS.map(({ value, key, count }) => {
          const active = tally.my_vote === value;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              aria-label={t("aria", { label: t(key), count: tally[count] })}
              disabled={disabled || vote.isPending}
              onClick={() => vote.mutate(active ? null : value)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 px-3 py-2 text-sm font-medium disabled:opacity-60 ${
                active ? "bg-foreground text-background" : "bg-surface text-foreground"
              }`}
            >
              <span>{t(key)}</span>
              <span aria-hidden="true">{tally[count]}</span>
            </button>
          );
        })}
      </div>
      {vote.isError && (
        <p role="alert" className="text-sm text-warn">
          {errorMessage(vote.error)}
        </p>
      )}
    </div>
  );
}
