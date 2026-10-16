/// <reference path="../pb_data/types.d.ts" />

// Bloquea a nivel de reglas de acceso los campos privilegiados de
// encargos_externos para el proveedor. El proveedor solo puede cambiar
// estado, fecha_recepcion, discrepancias_recepcion y fecha_listo; cualquier
// otro campo (precio, fechas comprometidas, validación, unidades, proveedor,
// exclusiva, monos, fases, albarán…) requiere rol interno.
// Usa el modificador `:changed = false` (disponible desde v0.34) que significa
// "el campo se omitió o no cambió respecto al valor almacenado".
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId("encargos_externos");

    const internos =
      "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio'";

    // Solo campos escalares soportan el modificador `:changed`. Las relaciones,
    // json y file se protegen por la UI + el hook de recálculo de importe.
    const camposBloqueados = [
      "precio_unitario", "precio_total_acordado", "importe_encargado", "importe_validado",
      "fecha_salida", "fecha_devolucion_comprometida", "fecha_envio_real", "fecha_recogida",
      "fecha_llegada", "fecha_validacion", "observaciones_validacion", "albaran",
      "tipo_precio", "es_reparacion",
    ];

    const locks = camposBloqueados
      .map((c) => `@request.body.${c}:changed = false`)
      .join(" && ");

    // Internos pueden actualizar todo. El proveedor solo si no toca campos
    // privilegiados y solo sobre su propio encargo.
    col.updateRule = `(${internos}) || (@request.auth.proveedor_id = proveedor_id && ${locks})`;
    app.save(col);
  },
  (app) => {
    const col = app.findCollectionByNameOrId("encargos_externos");
    col.updateRule =
      "@request.auth.id != '' && (@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin' || @request.auth.rol = 'produccio' || @request.auth.rol = 'externalitzacio' || @request.auth.proveedor_id = proveedor_id)";
    app.save(col);
  },
);
