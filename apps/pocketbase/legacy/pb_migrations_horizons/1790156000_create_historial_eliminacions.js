/// <reference path="../pb_data/types.d.ts" />

// Historial consultable de exclusivas futuras eliminadas al desaparecer de
// una nueva carga masiva. Se registra ANTES de eliminar la exclusiva y se
// conserva aunque el registro activo ya no exista. Por eso los datos de la
// exclusiva se guardan como texto/número (no como relación que cascadaría).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    let hist;
    try {
      hist = app.findCollectionByNameOrId("historial_eliminacions_exclusivas");
    } catch (_) {
      hist = new Collection({
        type: "base",
        name: "historial_eliminacions_exclusivas",
        // Trazabilidad: cualquier usuario autenticado puede consultar;
        // la escritura la realiza el flujo de carga masiva (admin/produccio).
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "exclusiva_codi", type: "text", required: true, max: 80 },
          { name: "exclusiva_id", type: "text", max: 60 },
          { name: "referencia", type: "text", max: 100 },
          { name: "article", type: "text", max: 120 },
          { name: "marca", type: "text", max: 120 },
          { name: "unitats", type: "number", onlyInt: true },
          { name: "monos_count", type: "number", onlyInt: true },
          { name: "ruta_nom", type: "text", max: 200 },
          { name: "estat_anterior", type: "text", max: 40 },
          {
            name: "motiu",
            type: "select",
            maxSelect: 1,
            required: true,
            values: [
              "desapareguda_carrega",
              "no_aparece_nueva_carga",
              "manual",
            ],
          },
          { name: "motiu_descripcio", type: "text", max: 2000 },
          { name: "origen_carrega", type: "text", max: 300 },
          { name: "origen_nom_fitxer", type: "text", max: 300 },
          {
            name: "usuario_id",
            type: "relation",
            maxSelect: 1,
            collectionId: users.id,
            cascadeDelete: false,
          },
          { name: "usuario_email", type: "text", max: 200 },
          { name: "fecha_eliminacion", type: "date", required: true },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_hist_elim_codi ON historial_eliminacions_exclusivas (exclusiva_codi)",
          "CREATE INDEX idx_hist_elim_fecha ON historial_eliminacions_exclusivas (fecha_eliminacion)",
        ],
      });
      app.save(hist);
    }
  },
  (app) => {
    try {
      const hist = app.findCollectionByNameOrId("historial_eliminacions_exclusivas");
      app.delete(hist);
    } catch (_) {}
  },
);
