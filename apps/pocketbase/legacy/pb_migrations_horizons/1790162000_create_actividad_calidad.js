// Crea una colección ligera `actividad_calidad` para registrar las sesiones
// de control de calidad ACTIVAS (unidades en revisión en este momento).
//
// Motivo: el Control de calidad simplificado (CalidadSimplificada) lleva el
// cronómetro en el navegador y solo persiste el resultado al guardar (en
// `control_calidad`). Mientras la revisión está en curso no había ningún
// registro servidor, por lo que los operarios de Calidad nunca aparecían en
// el Dashboard "En vivo" ni en el Kanban.
//
// Esta colección sirve de "heartbeat" de sesión activa: se crea al abrir una
// unidad pendiente, se actualiza mientras se revisa y se elimina al cerrar/
// guardar. No sustituye a `control_calidad` ni a `controles_qualitat`: es un
// marcador efímero de presencia. Cualquier usuario autenticado puede
// crear/actualizar/eliminar sus propias sesiones; list/view abiertos a
// autenticados para que los dashboards los lean en tiempo real.
migrate(
  (app) => {
    try { app.findCollectionByNameOrId('actividad_calidad'); return; } catch (_) {}

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
        new RelationField({ name: 'operari', maxSelect: 1, collectionId: usersCol.id, required: true }),
        new RelationField({ name: 'exclusiva', maxSelect: 1, collectionId: exCol.id }),
        new RelationField({ name: 'mono', maxSelect: 1, collectionId: monosCol.id }),
        new NumberField({ name: 'unidad_numero', onlyInt: true }),
        new TextField({ name: 'operacio', max: 200 }),
        new SelectField({
          name: 'estado',
          maxSelect: 1,
          values: ['en_proceso', 'en_retrabajo'],
        }),
        new AutodateField({ name: 'created', onCreate: true, onUpdate: false }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
      ],
      indexes: [
        'CREATE INDEX idx_actcal_operari ON actividad_calidad (operari)',
        'CREATE INDEX idx_actcal_exclusiva ON actividad_calidad (exclusiva)',
      ],
    });
    app.save(col);
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId('actividad_calidad')); } catch (_) {}
  },
);
