"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/ui/atoms/Avatar";
import type { ProposalComment } from "../api/proposals";

type CommentItemProps = {
  comment: ProposalComment;
  onDelete: (comment: ProposalComment) => void;
  deleting?: boolean;
};

/** One comment: author, time, body (plain text) and a delete button only when the api allows it. */
export function CommentItem({ comment, onDelete, deleting = false }: CommentItemProps) {
  const t = useTranslations("proposals.comments");
  const format = useFormatter();

  return (
    <li className="flex gap-3 rounded-xl border border-border bg-surface px-4 py-3">
      <Avatar name={comment.author.display_name} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{comment.author.display_name}</span>
          <time dateTime={comment.created_at} className="text-muted">
            {format.dateTime(new Date(comment.created_at), { dateStyle: "short", timeStyle: "short" })}
          </time>
          {comment.source === "whatsapp" && <span className="text-muted">{t("viaWhatsapp")}</span>}
        </p>
        <p className="whitespace-pre-wrap break-words">{comment.body}</p>
        {comment.can_delete && (
          <button
            type="button"
            disabled={deleting}
            onClick={() => onDelete(comment)}
            className="min-h-11 self-start text-sm text-muted underline underline-offset-2 disabled:opacity-60"
          >
            {t("delete")}
          </button>
        )}
      </div>
    </li>
  );
}
