/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "forecast_recursos",
      listRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'",
      viewRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'",
      createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'",
      updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
      deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
      fields: [
        { name: "fecha_analisis", type: "text", max: 40 },
        { name: "rango_fechas", type: "text", max: 200 },
        { name: "exclusivas_pendientes", type: "number", onlyInt: true },
        { name: "minutos_totales_necesarios", type: "number" },
        { name: "horas_totales_necesarias", type: "number" },
        { name: "operarios_disponibles", type: "number", onlyInt: true },
        { name: "horas_dia", type: "number" },
        { name: "dias_laborables", type: "number", onlyInt: true },
        { name: "capacidad_actual_horas", type: "number" },
        { name: "diferencia_horas", type: "number" },
        { name: "propuesta_seleccionada", type: "text", max: 200 },
        { name: "coste_estimado", type: "number" },
        { name: "estado", type: "select", values: ["a_tiempo", "en_riesgo", "critico"], maxSelect: 1 },
        { name: "notas", type: "text", max: 2000 },
        { name: "created", type: "autodate", onCreate: true },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
    });
    app.save(collection);
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId("forecast_recursos");
      app.delete(col);
    } catch (_) {}
  },
);
