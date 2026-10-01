"use client";

import { useTranslations } from "next-intl";
import { Skeleton } from "@/ui/atoms/Skeleton";
import { CommentForm } from "../components/CommentForm";
import { CommentItem } from "../components/CommentItem";
import { useComments } from "../hooks/queries";
import { useAddComment, useDeleteComment } from "../hooks/mutations";
import { useErrorMessage } from "../lib/useErrorMessage";

/** Container: the proposal's comment thread plus the box to add one. */
export function CommentThread({ proposalId }: { proposalId: string }) {
  const t = useTranslations("proposals.comments");
  const errorMessage = useErrorMessage();
  const comments = useComments(proposalId);
  const add = useAddComment(proposalId);
  const remove = useDeleteComment();
  const error = add.error ?? remove.error;

  return (
    <section aria-labelledby={`comments-${proposalId}`} className="flex flex-col gap-3">
      <h2 id={`comments-${proposalId}`} className="text-lg font-semibold">
        {t("title")}
      </h2>

      {comments.isPending && <Skeleton className="h-16" />}
      {comments.isError && (
        <p role="alert" className="text-sm text-warn">
          {t("failed")}
        </p>
      )}
      {comments.data && comments.data.length === 0 && <p className="text-sm text-muted">{t("empty")}</p>}
      {comments.data && comments.data.length > 0 && (
        <ul aria-label={t("title")} className="flex flex-col gap-2">
          {comments.data.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              deleting={remove.isPending && remove.variables === comment.id}
              onDelete={(target) => remove.mutate(target.id)}
            />
          ))}
        </ul>
      )}

      <CommentForm
        onSubmit={(body) => add.mutateAsync(body)}
        pending={add.isPending}
        error={error ? errorMessage(error) : null}
      />
    </section>
  );
}
