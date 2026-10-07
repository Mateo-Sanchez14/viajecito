"use client";

import { useTranslations } from "next-intl";
import { MinusIcon, ThumbsDownIcon, ThumbsUpIcon } from "@/ui/icons";
import type { VoteTally, VoteValue } from "../api/proposals";
import { useVote } from "../hooks/mutations";
import { useErrorMessage } from "../lib/useErrorMessage";

const OPTIONS = [
  { value: 1, key: "up", count: "up", Icon: ThumbsUpIcon },
  { value: 0, key: "neutral", count: "neutral", Icon: MinusIcon },
  { value: -1, key: "down", count: "down", Icon: ThumbsDownIcon },
] as const satisfies readonly { value: VoteValue; key: string; count: keyof VoteTally; Icon: typeof MinusIcon }[];

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
      <div
        role="group"
        aria-label={t("label")}
        className="inline-flex w-full gap-1 rounded-[var(--radius-control)] bg-surface-sunken p-1"
      >
        {OPTIONS.map(({ value, key, count, Icon }) => {
          const active = tally.my_vote === value;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              aria-label={t("aria", { label: t(key), count: tally[count] })}
              disabled={disabled || vote.isPending}
              onClick={() => vote.mutate(active ? null : value)}
              className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[calc(var(--radius-control)-4px)] px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                active ? "bg-accent-soft font-semibold text-accent" : "bg-transparent text-foreground hover:bg-surface"
              }`}
            >
              <Icon size={18} weight={active ? "fill" : "regular"} aria-hidden="true" />
              <span>{t(key)}</span>
              <span aria-hidden="true" className="ui-tabular">
                {tally[count]}
              </span>
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
