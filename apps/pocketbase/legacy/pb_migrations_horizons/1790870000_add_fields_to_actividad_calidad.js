/// <reference path="../pb_data/types.d.ts" />

// Añade los campos que faltan a `actividad_calidad`.
//
// PROBLEMA (raíz de "los operarios de Calidad no aparecen en el Dashboard en
// vivo"): la colección `actividad_calidad` fue creada vía dashboard ANTES de
// que corriera 1790162000_create_actividad_calidad.js. Esa migración hace
// `findCollectionByNameOrId('actividad_calidad'); return;` si ya existe, así
// que NUNCA añadió los campos. La delta 1790200000 solo corrigió las reglas
// de acceso, no los campos.
//
// Resultado: la colección existe con reglas correctas pero SIN campos. Cuando
// ChecklistQC / CalidadSimplificada crean una sesión heartbeat
// ({operari, exclusiva, mono, operacio, estado}), PocketBase descarta esos
// campos (no existen en el schema) y guarda un registro vacío (solo id). El
// Dashboard en vivo luego hace:
//     const opId = a.expand?.operari?.id || a.operari || null;
//     if (!opId) continue;
// → todos los registros se saltan → NINGÚN operario de Calidad aparece.
//
// Esta migración añade los campos previstos originalmente de forma idempotente
// (solo añade los que falten). No toca reglas ni datos existentes.
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('actividad_calidad');

    const usersCol = app.findCollectionByNameOrId('users');
    const exCol = app.findCollectionByNameOrId('exclusives');
    const monosCol = app.findCollectionByNameOrId('monos');

    const has = (name) => {
      try { col.fields.getByName(name); return true; } catch (_) { return false; }
    };

    if (!has('operari')) {
      col.fields.add(new RelationField({
        name: 'operari',
        maxSelect: 1,
        collectionId: usersCol.id,
        required: true,
        cascadeDelete: false,
      }));
    }
    if (!has('exclusiva')) {
      col.fields.add(new RelationField({
        name: 'exclusiva',
        maxSelect: 1,
        collectionId: exCol.id,
        cascadeDelete: false,
      }));
    }
    if (!has('mono')) {
      col.fields.add(new RelationField({
        name: 'mono',
        maxSelect: 1,
        collectionId: monosCol.id,
        cascadeDelete: false,
      }));
    }
    if (!has('unidad_numero')) {
      col.fields.add(new NumberField({ name: 'unidad_numero', onlyInt: true }));
    }
    if (!has('operacio')) {
      col.fields.add(new TextField({ name: 'operacio', max: 200 }));
    }
    if (!has('estado')) {
      col.fields.add(new SelectField({
        name: 'estado',
        maxSelect: 1,
        values: ['en_proceso', 'en_retrabajo'],
      }));
    }
    if (!has('created')) {
      col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }));
    }
    if (!has('updated')) {
      col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }));
    }

    // Nota: no añadimos índices aquí. PocketBase falla al crear índices sobre
    // columnas recién añadidas en la misma migración ("no such column"). Los
    // índices no son necesarios para la funcionalidad del dashboard; los
    // campos sí lo son. Si se quieren índices, añadirlos en una migración
    // posterior separada.

    app.save(col);
  },
  (app) => {
    // No-op: los campos son los previstos originalmente. No los eliminamos.
  },
);
