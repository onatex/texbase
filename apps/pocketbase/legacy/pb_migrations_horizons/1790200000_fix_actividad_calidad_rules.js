/// <reference path="../pb_data/types.d.ts" />

// Corrige las reglas de acceso de `actividad_calidad`.
//
// Problema: la colección existía (creada vía dashboard) ANTES de que corriera
// 1790162000_create_actividad_calidad.js, cuyo `up` hace `findCollectionByNameOrId`
// y `return` temprano si ya existe. Por eso las reglas quedaron como venían de
// dashboard: createRule=null y viewRule=null. Con createRule=null, el
// CalidadSimplificada no puede crear la sesión "heartbeat" (POST devuelve 403
// silenciosamente capturado), y por tanto los operarios de Calidad que están
// revisando una unidad NUNCA aparecen en el Dashboard "En vivo" ni en el Kanban
// (sección "Operarios de Calidad"). Solo aparecían los que tenían un
// controles_qualitat en retrabajo (respaldo).
//
// Esta migración delta restaura las reglas previstas originalmente:
// cualquier usuario autenticado puede crear/actualizar/eliminar sus sesiones
// (marcador efímero de presencia) y list/view abiertos a autenticados para que
// los dashboards los lean en tiempo real. No toca campos ni datos.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('actividad_calidad');
    col.listRule = '@request.auth.id != ""';
    col.viewRule = '@request.auth.id != ""';
    col.createRule = '@request.auth.id != ""';
    col.updateRule = '@request.auth.id != ""';
    col.deleteRule = '@request.auth.id != ""';
    app.save(col);
  },
  (app) => {
    // No-op: las reglas previas eran las incorrectas (null). No restauramos null.
  },
);
