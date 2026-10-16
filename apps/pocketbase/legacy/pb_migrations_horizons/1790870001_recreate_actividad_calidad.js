/// <reference path="../pb_data/types.d.ts" />

// Recrea la colección `actividad_calidad` con todos sus campos.
//
// PROBLEMA: la migración anterior (1790870000) se marcó como aplicada pero los
// campos NO se añadieron realmente. La colección fue creada vía dashboard sin
// campos, y `fields.getByName()` no lanza cuando el campo no existe en este
// estado corrupto (metadata vs columnas SQL desincronizadas), así que el
// guardado no añadía nada. Resultado: los registros siguen guardándose vacíos
// (solo id), y el Dashboard en vivo ignora todas las sesiones de Calidad
// (`if (!opId) continue;`).
//
// Solución definitiva: como `actividad_calidad` solo contiene marcadores
// efímeros de presencia (sesiones heartbeat creadas al inspeccionar y
// eliminadas al cerrar) y ningún registro tiene datos útiles (todos vacíos),
// eliminamos la colección corrupta y la recreamos desde cero con todos los
// campos y reglas previstos. No hay colecciones que apunten a ella (es
// autónoma), así que el borrado es seguro.
migrate(
  (app) => {
    // 1) Eliminar la colección corrupta existente (si existe).
    try {
      const old = app.findCollectionByNameOrId('actividad_calidad');
      app.delete(old);
    } catch (_) {
      // no existía, nada que borrar
    }

    // 2) Recrear desde cero con todos los campos.
    const usersCol = app.findCollectionByNameOrId('users');
    const exCol = app.findCollectionByNameOrId('exclusives');
    const monosCol = app.findCollectionByNameOrId('monos');

    const col = new Collection({
      type: 'base',
      name: 'actividad_calidad',
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id != ""',
      deleteRule: '@request.auth.id != ""',
      fields: [
        {
          name: 'operari',
          type: 'relation',
          maxSelect: 1,
          collectionId: usersCol.id,
          required: true,
          cascadeDelete: false,
        },
        {
          name: 'exclusiva',
          type: 'relation',
          maxSelect: 1,
          collectionId: exCol.id,
          cascadeDelete: false,
        },
        {
          name: 'mono',
          type: 'relation',
          maxSelect: 1,
          collectionId: monosCol.id,
          cascadeDelete: false,
        },
        { name: 'unidad_numero', type: 'number', onlyInt: true },
        { name: 'operacio', type: 'text', max: 200 },
        {
          name: 'estado',
          type: 'select',
          maxSelect: 1,
          values: ['en_proceso', 'en_retrabajo'],
        },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
    });
    app.save(col);
  },
  (app) => {
    // down: eliminar la colección recreada.
    try {
      app.delete(app.findCollectionByNameOrId('actividad_calidad'));
    } catch (_) {}
  },
);
