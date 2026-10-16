/// <reference path="../pb_data/types.d.ts" />

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // Allow superadmin to create / update / delete users (in addition to admin).
    // list/view stay "any logged-in user" as before.
    users.createRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    users.updateRule =
      "@request.auth.id = id || @request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";
    users.deleteRule = "@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin'";

    // Operario profile fields (optional, used only for operaris).
    if (!users.fields.getByName("especialitats")) {
      users.fields.add(new JSONField({ name: "especialitats", maxSize: 5000 }));
    }
    if (!users.fields.getByName("maquines")) {
      users.fields.add(new JSONField({ name: "maquines", maxSize: 5000 }));
    }
    if (!users.fields.getByName("disponibilitat")) {
      users.fields.add(new TextField({ name: "disponibilitat", max: 500 }));
    }
    if (!users.fields.getByName("cognom")) {
      users.fields.add(new TextField({ name: "cognom", max: 120 }));
    }

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.createRule = "@request.auth.rol = 'admin'";
    users.updateRule = "@request.auth.id = id || @request.auth.rol = 'admin'";
    users.deleteRule = "@request.auth.rol = 'admin'";
    ["especialitats", "maquines", "disponibilitat", "cognom"].forEach((n) => {
      try { users.fields.removeByName(n); } catch (_) {}
    });
    app.save(users);
  },
);
