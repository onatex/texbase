/// <reference path="../pb_data/types.d.ts" />

// Permite a admin/superadmin cambiar la contraseña de cualquier usuario sin
// conocer la contraseña anterior.
//
// PocketBase exige `oldPassword` al actualizar el campo `password` a través de
// la API de registros (/api/collections/users/records/{id}) a menos que el
// solicitante sea superusuario del sistema o coincida con el `manageRule` de
// la colección auth. Los administradores de esta app se autentican contra la
// colección `users` (no son superusuarios del sistema), por lo que el flujo de
// "Contraseñas de usuarios" (Contrasenyes.jsx), que envía solo `password` y
// `passwordConfirm`, fallaba con `oldPassword: Cannot be blank` (HTTP 400).
//
// Esto impedía resetear la contraseña de cuentas recién creadas (p. ej. Bilal):
// el admin no podía asignarles una contraseña utilizable y la cuenta quedaba
// inaccesible. Definir `manageRule` resuelve el reseteo sin debilitar los
// permisos existentes: `updateRule` ya permite a admin/superadmin actualizar
// usuarios, y `manageRule` solo añade la capacidad de cambiar la contraseña
// sin la anterior (mecanismo documentado de PocketBase para gestores).
//
// No altera `rol`, reglas existentes ni datos de usuarios.

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.manageRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.manageRule = null;
    app.save(users);
  },
);
