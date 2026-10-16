/// <reference path="../pb_data/types.d.ts" />

// ─────────────────────────────────────────────────────────────────────────────
// Módulo unificado de proveedores externos — «encargos_externos».
//
// PROBLEMA (discrepancia investigada): existían DOS circuitos paralelos sin
// reconciliar:
//   A) `proveedores` + `fases_externalizadas_exclusiva`  (usado por ProviderPage,
//      ProveedoresExternalizados, ExclusivaDetall). Vinculado a auth (users.proveedor_id).
//   B) `proveedores_externos` + `fases_externalizadas`  (usado por FasesExternalizadas).
//      Colección separada, NO vinculada a auth.
// Por eso una exclusiva podía mostrar el proveedor Yinsy (circuito B) mientras
// «Proveedores» y el selector mostraban Confecciones Demo S.L. (circuito A), y
// los costes/estados no cuadraban.
//
// SOLUCIÓN: se crea un circuito UNIFICADO `encargos_externos` sobre `proveedores`
// (el vinculado a auth), que vincula proveedor + exclusiva + unidades (monos)
// + fases reales + precio + fechas + estado + validación. Es la única fuente de
// verdad para el trabajo externo. Los circuitos antiguos se conservan (migración
// conservadora: no se borra ni se duplica) y se marcan para revisión interna.
//
// Colecciones nuevas:
//   - encargos_externos      (el encargo / orden de trabajo externo)
//   - movimientos_encargo     (envío, recepción, listo, recogida, llegada, validación)
//   - incidencias_externas   (incidencias sobre un encargo, con respuesta)
//
// Aislamiento proveedor: las reglas list/view/update filtran por
// `@request.auth.proveedor_id = proveedor_id`. Un hook (pb_hooks) impide que el
// proveedor modifique campos privilegiados (precio, fechas comprometidas,
// validación). El proveedor solo ve y actúa sobre sus encargos.
// ─────────────────────────────────────────────────────────────────────────────
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    const proveedores = app.findCollectionByNameOrId("proveedores");
    const exclusives = app.findCollectionByNameOrId("exclusives");
    const monos = app.findCollectionByNameOrId("monos");

    // Regla compartida: internos (admin/superadmin/produccio/externalitzacio)
    // ven todo; el proveedor solo los suyos.
    const readRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || @request.auth.proveedor_id = proveedor_id)";
    const writeInternal =
      "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio'";

    // ── 1. encargos_externos ──────────────────────────────────────────────
    let enc;
    try { enc = app.findCollectionByNameOrId("encargos_externos"); } catch (_) {
      enc = new Collection({
        type: "base",
        name: "encargos_externos",
        listRule: readRule,
        viewRule: readRule,
        createRule: writeInternal,
        // El proveedor puede actualizar el suyo (transiciones de estado que le
        // corresponden); el hook bloquea campos privilegiados.
        updateRule: readRule,
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "proveedor_id", type: "relation", required: true, maxSelect: 1, collectionId: proveedores.id, cascadeDelete: true },
          { name: "exclusiva_id", type: "relation", required: true, maxSelect: 1, collectionId: exclusives.id, cascadeDelete: false },
          { name: "monos", type: "relation", maxSelect: 0, collectionId: monos.id, cascadeDelete: false },
          { name: "fases", type: "json", maxSize: 20000 },
          { name: "tipo_precio", type: "select", maxSelect: 1, values: ["por_fase", "paquete"] },
          { name: "precio_unitario", type: "number" },
          { name: "precio_total_acordado", type: "number" },
          { name: "importe_encargado", type: "number" },
          { name: "importe_validado", type: "number" },
          { name: "descripcion", type: "text", max: 2000 },
          { name: "fecha_salida", type: "date" },
          { name: "fecha_devolucion_comprometida", type: "date" },
          { name: "fecha_envio_real", type: "date" },
          { name: "albaran", type: "text", max: 80 },
          { name: "documento", type: "file", maxSelect: 5, maxSize: 52428800, mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"] },
          {
            name: "estado",
            type: "select",
            maxSelect: 1,
            values: [
              "preparado", "enviado", "recibido", "en_confeccion", "listo_recoger",
              "recogido", "llegada_onatex", "validado", "parcialmente_validado",
              "con_incidencias", "reparacion", "cerrado",
            ],
          },
          { name: "fecha_recepcion", type: "date" },
          { name: "discrepancias_recepcion", type: "text", max: 2000 },
          { name: "fecha_listo", type: "date" },
          { name: "fecha_recogida", type: "date" },
          { name: "fecha_llegada", type: "date" },
          { name: "fecha_validacion", type: "date" },
          { name: "validado_por", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: false },
          { name: "unidades_aceptadas", type: "json", maxSize: 20000 },
          { name: "unidades_rechazadas", type: "json", maxSize: 20000 },
          { name: "observaciones_validacion", type: "text", max: 2000 },
          { name: "es_reparacion", type: "bool" },
          { name: "created_by", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: false },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_enc_prov ON encargos_externos (proveedor_id)",
          "CREATE INDEX idx_enc_exc ON encargos_externos (exclusiva_id)",
          "CREATE INDEX idx_enc_estat ON encargos_externos (estado)",
        ],
      });
      app.save(enc);
    }
    // encargo_origen es auto-referencial: añadirlo tras crear la colección.
    try {
      enc.fields.getByName("encargo_origen");
    } catch (_) {
      enc.fields.add(new RelationField({ name: "encargo_origen", maxSelect: 1, collectionId: enc.id, cascadeDelete: false }));
      app.save(enc);
    }

    // ── 2. movimientos_encargo ───────────────────────────────────────────
    let mov;
    try { mov = app.findCollectionByNameOrId("movimientos_encargo"); } catch (_) {
      mov = new Collection({
        type: "base",
        name: "movimientos_encargo",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || encargo_id.proveedor_id = @request.auth.proveedor_id)",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || encargo_id.proveedor_id = @request.auth.proveedor_id)",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio'",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "encargo_id", type: "relation", required: true, maxSelect: 1, collectionId: enc.id, cascadeDelete: true },
          { name: "tipo", type: "select", maxSelect: 1, values: ["envio", "recepcion", "listo", "recogida", "llegada", "validacion", "reenvio", "reparacion"] },
          { name: "fecha", type: "date" },
          { name: "usuario_id", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: false },
          { name: "unidades", type: "json", maxSize: 20000 },
          { name: "notas", type: "text", max: 2000 },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_mov_enc ON movimientos_encargo (encargo_id)",
        ],
      });
      app.save(mov);
    }

    // ── 3. incidencias_externas ──────────────────────────────────────────
    let inc;
    try { inc = app.findCollectionByNameOrId("incidencias_externas"); } catch (_) {
      inc = new Collection({
        type: "base",
        name: "incidencias_externas",
        listRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || encargo_id.proveedor_id = @request.auth.proveedor_id)",
        viewRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || encargo_id.proveedor_id = @request.auth.proveedor_id)",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || encargo_id.proveedor_id = @request.auth.proveedor_id)",
        deleteRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'",
        fields: [
          { name: "encargo_id", type: "relation", required: true, maxSelect: 1, collectionId: enc.id, cascadeDelete: true },
          { name: "mono_id", type: "relation", maxSelect: 1, collectionId: monos.id, cascadeDelete: false },
          { name: "fase", type: "text", max: 200 },
          { name: "descripcion", type: "text", max: 2000 },
          { name: "fotos", type: "file", maxSelect: 10, maxSize: 10485760, mimeTypes: ["image/jpeg", "image/png", "image/webp"] },
          { name: "estado", type: "select", maxSelect: 1, values: ["abierta", "respondida", "reparacion", "cerrada"] },
          { name: "respuesta", type: "text", max: 2000 },
          { name: "fecha_respuesta", type: "date" },
          { name: "creado_por", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: false },
          { name: "created", type: "autodate", onCreate: true, onUpdate: false },
          { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE INDEX idx_inc_enc ON incidencias_externas (encargo_id)",
          "CREATE INDEX idx_inc_estat ON incidencias_externas (estado)",
        ],
      });
      app.save(inc);
    }

    // ── 4. Abrir `proveedores` al rol proveedor (vee su propia ficha) ───
    // Sin esto el proveedor no puede resolver su nombre en el dashboard.
    try {
      const p = app.findCollectionByNameOrId("proveedores");
      p.listRule = "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || @request.auth.proveedor_id = id)";
      p.viewRule = "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || @request.auth.proveedor_id = id)";
      app.save(p);
    } catch (_) {}

    // ── 5. Marcar el circuito antiguo `fases_externalizadas` para revisión ─
    // No se borra ni se migra automáticamente (migración conservadora).
    // Se añade un flag `reconciliado` (bool) para que el equipo interno revise
    // cada registro y lo vincule manualmente al nuevo circuito si procede.
    try {
      const old = app.findCollectionByNameOrId("fases_externalizadas");
      if (!old.fields.getByName("reconciliado")) {
        old.fields.add(new BoolField({ name: "reconciliado" }));
        app.save(old);
      }
    } catch (_) {}
  },
  (app) => {
    for (const name of ["incidencias_externas", "movimientos_encargo", "encargos_externos"]) {
      try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) {}
    }
    try {
      const old = app.findCollectionByNameOrId("fases_externalizadas");
      old.fields.removeByName("reconciliado");
      app.save(old);
    } catch (_) {}
  },
);
