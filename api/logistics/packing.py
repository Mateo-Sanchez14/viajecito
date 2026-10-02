from dataclasses import dataclass


@dataclass(frozen=True)
class PackingItem:
    key: str
    per_person: bool = True
    default_quantity: int | None = None


@dataclass(frozen=True)
class PackingSection:
    key: str
    items: tuple[PackingItem, ...]


@dataclass(frozen=True)
class PackingTemplate:
    key: str
    sections: tuple[PackingSection, ...]


def section(key, *items):
    return PackingSection(key, tuple(PackingItem(item) for item in items))


TEMPLATES = {
    "generic": PackingTemplate(
        "generic",
        (
            section("documents", "identity", "tickets"),
            section("money", "cash", "cards"),
            section("health", "medication", "first_aid"),
            section("clothes", "clothes", "underwear", "shoes"),
            section("tech", "phone", "charger", "powerbank"),
        ),
    ),
    "border": PackingTemplate(
        "border",
        (
            section(
                "border",
                "border_identity",
                "vehicle_permit",
                "vehicle_insurance",
                "sag",
                "chains",
                "foreign_cash",
            ),
        ),
    ),
    "ski": PackingTemplate(
        "ski",
        (
            section(
                "ski",
                "jacket",
                "pants",
                "base_layer",
                "gloves",
                "goggles",
                "helmet",
                "neck",
                "sunscreen",
                "cream",
                "backpack",
                "equipment",
                "boots",
            ),
        ),
    ),
}
