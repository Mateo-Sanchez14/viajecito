PACKING_TEMPLATE_LABELS = {"generic": "Básica", "border": "Cruce de frontera", "ski": "Ski"}
PACKING_SECTION_LABELS = {
    "documents": "Documentos",
    "money": "Plata",
    "health": "Salud",
    "clothes": "Ropa",
    "tech": "Tecnología",
    "border": "Cruce de frontera",
    "ski": "Ski",
    "custom": "Otros",
}
PACKING_LABELS = {
    "generic": {
        "identity": "DNI o pasaporte",
        "tickets": "Pasajes y reservas",
        "cash": "Efectivo",
        "cards": "Tarjetas",
        "medication": "Medicación",
        "first_aid": "Botiquín",
        "clothes": "Ropa",
        "underwear": "Ropa interior",
        "shoes": "Calzado",
        "phone": "Celular",
        "charger": "Cargador",
        "powerbank": "Batería portátil",
    },
    "border": {
        "border_identity": "DNI o pasaporte vigente",
        "vehicle_permit": "Permiso del auto y cédula verde/azul",
        "vehicle_insurance": "Seguro del auto: carta verde / SOAPEX",
        "sag": "Declaración jurada SAG (Chile)",
        "chains": "Cadenas para nieve",
        "foreign_cash": "Efectivo en la otra moneda",
    },
    "ski": {
        "jacket": "Campera",
        "pants": "Pantalón",
        "base_layer": "Primera capa",
        "gloves": "Guantes",
        "goggles": "Antiparras",
        "helmet": "Casco",
        "neck": "Cuello",
        "sunscreen": "Protector solar y labial",
        "cream": "Crema",
        "backpack": "Mochila chica",
        "equipment": "Ski o tabla (si no alquilás)",
        "boots": "Botas (si no alquilás)",
    },
}
TASKS_HEADER = "📋 Lo que falta para {trip}:"
TASK_LINE = "#{number} {title} — {owner} · {due}"
NO_OWNER = "sin dueño"
NO_TASKS = "No hay nada pendiente 🙌"
TASK_DONE = "✅ Listo: #{number} {title}."
TASK_NOT_FOUND = "No encontré la tarea #{number}. Mandá /viaje tareas para ver la lista."
TASK_ALREADY_DONE = "La #{number} ya estaba hecha 👌"
LISTO_USAGE = "Usalo así: /viaje listo 3"
NAG_HEADER = "⏰ Recordatorio para {trip}:"
NAG_LINE = "{mention} {title} ({due})"
NAG_UNOWNED = "Sin dueño: {titles}. ¿Alguien se lo pone al hombro?"
BOOKING_TASK_TITLE = "Reservar: {title}"
SUGGEST_MARK_BOOKED = 'Si ya está reservada, respondé "reservada" a la tarjeta.'
DUE_TODAY = "vence hoy"
DUE_ON = "vence el {day}"
OVERDUE = "venció hace {days} días"
OVERDUE_ONE = "venció ayer"
NO_DUE = "sin fecha"
HELP_TAREAS = "/viaje tareas — lo que falta hacer"
HELP_LISTO = "/viaje listo <n> — marcar la tarea #n como hecha"
SAFE_PERSON = "alguien"
