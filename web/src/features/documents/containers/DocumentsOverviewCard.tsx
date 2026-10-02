"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/ui/atoms/Card";
import { useDocuments } from "../hooks/useDocuments";
export function DocumentsOverviewCard({
  tripId,
  crewId,
}: {
  tripId: string;
  crewId: string;
}) {
  const t = useTranslations("documents");
  const documents = useDocuments(tripId);
  const next = documents.data
    ?.map((document) => document.valid_until)
    .filter((date): date is string => !!date)
    .sort()[0];
  return (
    <Card as="section">
      <h3>
        <Link href={`/crews/${crewId}/trips/${tripId}/documents`}>
          {t("title")}
        </Link>
      </h3>
      {documents.isError && <p role="alert">{t("errors.invalid_request")}</p>}
      {documents.data && <p>{t("overview", { n: documents.data.length })}</p>}
      {next && <p>{t("validUntil", { date: next })}</p>}
    </Card>
  );
}
