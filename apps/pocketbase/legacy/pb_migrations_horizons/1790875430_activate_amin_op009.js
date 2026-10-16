/// <reference path="../pb_data/types.d.ts" />

// Activa el operario Amin (OP009) igual que el resto de operarios
// (OP001–OP008), que se siembran vía migración y por tanto existen tanto en
// preview como en producción. Amin fue creado en runtime solo en preview, así
// que no existía en producción ni tenía credenciales conocidas. Esta migración
// lo find-or-create: si ya existe (preview), asegura rol=operari, verified=true
// y una contraseña conocida; si no existe (producción tras publicar), lo crea.
// No toca sus operaciones, monos ni historial existentes.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const AMIN = {
      email: "amin@monos.local",
      codi: "OP009",
      name: "Amin",
      rol: "operari",
      password: "Op009123!",
    };

    let rec = null;
    try {
      rec = app.findAuthRecordByEmail("users", AMIN.email);
    } catch (_) {
      rec = null;
    }
    if (!rec) {
      try {
        rec = app.findFirstRecordByFilter("users", "codi = 'OP009'");
      } catch (_) {
        rec = null;
      }
    }
    if (!rec) rec = new Record(users);

    // Preserva el nombre si el usuario ya le puso uno distinto en runtime;
    // solo lo rellena si está vacío.
    const existingName = rec.get("name");
    rec.setEmail(AMIN.email);
    rec.setPassword(AMIN.password);
    rec.set("verified", true);
    rec.set("rol", AMIN.rol);
    rec.set("codi", AMIN.codi);
    if (!existingName) rec.set("name", AMIN.name);
    app.save(rec);
  },
  (app) => {
    // No borra el usuario (podría tener operaciones/historial asociado).
    // El down solo revierte la activación de contraseña/verified dejando el
    // registro como estaba: no es reversible de forma segura sin conocer el
    // estado previo, así que se deja intencionalmente como no-op.
  },
);
