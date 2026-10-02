"use client";
import { useTranslations } from "next-intl";
import { categoryColors, type Category } from "../lib/places";
export function MapLegend({ categories }: { categories: Category[] }) {
  const t = useTranslations("map");
  return (
    <ul aria-label={t("legend")} className="flex flex-wrap gap-x-5 gap-y-2">
      {categories.map((category) => (
        <li key={category} className="flex items-center gap-2 text-sm">
          <span
            className="size-2.5 rounded-full"
            aria-hidden
            style={{ backgroundColor: categoryColors[category] }}
          />
          {t(`category.${category}`)}
        </li>
      ))}
    </ul>
  );
}
