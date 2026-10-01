import { useTranslations } from "next-intl";
import { GEAR_ITEMS, type GearItem } from "../api/ski";

type RentalRollupProps = {
  rentCounts: Partial<Record<GearItem, number>>;
  sizes: {
    person: { person_id: string; display_name: string };
    boot_size_eu: number | null;
    height_cm: number | null;
    weight_kg: number | null;
  }[];
  sizesHidden: number;
};

/** Presentational: what the crew will rent, plus the sizes people agreed to share. */
export function RentalRollup({ rentCounts, sizes, sizesHidden }: RentalRollupProps) {
  const t = useTranslations("ski.gear");
  const parts = GEAR_ITEMS.filter((item) => (rentCounts[item] ?? 0) > 0).map((item) =>
    t("rollupItem", { item: t(`item.${item}`), count: rentCounts[item] ?? 0 }),
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">
        {parts.length > 0 ? t("rollup", { summary: parts.join(", ") }) : t("nothingToRent")}
      </p>
      {sizes.length > 0 && (
        <ul aria-label={t("sizes")} className="flex flex-col gap-1">
          {sizes.map((size) => (
            <li key={size.person.person_id} className="text-sm">
              <span className="font-medium">{size.person.display_name}</span>
              {size.boot_size_eu !== null && <> · {t("boot", { value: size.boot_size_eu })}</>}
              {size.height_cm !== null && <> · {t("height", { value: size.height_cm })}</>}
              {size.weight_kg !== null && <> · {t("weight", { value: size.weight_kg })}</>}
            </li>
          ))}
        </ul>
      )}
      {sizesHidden > 0 && <p className="text-sm text-muted">{t("sizesHidden", { n: sizesHidden })}</p>}
    </div>
  );
}
