/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    // 1. categories_nc
    let catCol;
    try {
      catCol = app.findCollectionByNameOrId('categories_nc');
    } catch (_) {
      catCol = new Collection({
        type: 'base',
        name: 'categories_nc',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'qualitat'",
        updateRule: "@request.auth.rol = 'admin' || @request.auth.rol = 'qualitat'",
        deleteRule: "@request.auth.rol = 'admin'",
        fields: [
          { name: 'nom', type: 'text', required: true, max: 200 },
          { name: 'descripcio', type: 'text', max: 1000 },
          { name: 'color', type: 'text', max: 30 },
          { name: 'operacions_relacionades', type: 'json' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      });
      app.save(catCol);
    }

    const exclusivesCol = app.findCollectionByNameOrId('exclusives');
    const monosCol = app.findCollectionByNameOrId('monos');
    const usersCol = app.findCollectionByNameOrId('users');

    try {
      app.findCollectionByNameOrId('no_conformitats');
    } catch (_) {
      const ncCol = new Collection({
        type: 'base',
        name: 'no_conformitats',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: "@request.auth.id != ''",
        updateRule: "@request.auth.id != ''",
        deleteRule: "@request.auth.rol = 'admin'",
        fields: [
          { name: 'codi', type: 'text', max: 30 },
          { name: 'data_nc', type: 'date' },
          { name: 'client', type: 'text', max: 200 },
          { name: 'exclusiva', type: 'relation', collectionId: exclusivesCol.id, maxSelect: 1 },
          { name: 'mono', type: 'relation', collectionId: monosCol.id, maxSelect: 1 },
          { name: 'area', type: 'select', maxSelect: 1, values: ['estampacion', 'confeccio', 'acabats', 'oficina_tecnica', 'logistica'] },
          { name: 'descripcio', type: 'text', max: 3000 },
          { name: 'foto_url', type: 'text', max: 500 },
          { name: 'proposta_millora', type: 'text', max: 2000 },
          { name: 'prioritat', type: 'select', maxSelect: 1, values: ['alta', 'media', 'baixa'] },
          { name: 'estat', type: 'select', maxSelect: 1, values: ['oberta', 'tancada'] },
          { name: 'solucio_implantada', type: 'text', max: 2000 },
          { name: 'accio_preventiva', type: 'text', max: 2000 },
          { name: 'punt_checklist', type: 'text', max: 200 },
          { name: 'resultat_checklist', type: 'select', maxSelect: 1, values: ['aprovat', 'aprovat_obs', 'retreball', 'rebutjat', 'bloquejat'] },
          { name: 'categoria', type: 'relation', collectionId: catCol.id, maxSelect: 1 },
          { name: 'operari_que_detecto', type: 'relation', collectionId: usersCol.id, maxSelect: 1 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      });
      app.save(ncCol);
    }
  },
  (app) => {
    try { app.delete(app.findCollectionByNameOrId('no_conformitats')); } catch (_) {}
    try { app.delete(app.findCollectionByNameOrId('categories_nc')); } catch (_) {}
  }
);
