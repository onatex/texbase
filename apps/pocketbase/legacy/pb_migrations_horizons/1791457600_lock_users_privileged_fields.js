/// <reference path="../pb_data/types.d.ts" />

// Bloquea la escalada de privilegios en la colección auth `users`.
//
// Antes, `updateRule` era:
//   "@request.auth.id = id || @request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'"
// lo que permitía a cualquier usuario modificar SU PROPIO registro sin
// restricciones, incluyendo el campo privilegiado `rol`. Un operario podía
// hacer PATCH { "rol": "admin" } sobre su propia cuenta y escalar a
// administrador (verificado en pruebas). Lo mismo aplicaba a `proveedor_id`,
// lo que permitiría a un usuario autoasignarse a un proveedor y ver datos
// acotados por proveedor (forecast_proveedor, encargos_externos, etc.).
//
// Esta migración añade `:changed = false` para `rol` y `proveedor_id` en la
// rama de auto-actualización, manteniendo el acceso total de admin/superadmin.
// No altera datos de usuarios ni otros campos; solo endurece la regla.
//
// Patrón: pocketbase/references/ACCESS_RULES.md → "Auth collection with a
// privileged field". `:changed` disponible desde v0.34 (sandbox 0.39.8).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.updateRule =
      "(id = @request.auth.id && @request.body.rol:changed = false && @request.body.proveedor_id:changed = false) || @request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.updateRule =
      "@request.auth.id = id || @request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    app.save(users);
  },
);
