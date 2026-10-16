/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
    const email = $os.getenv("PB_SUPERUSER_EMAIL")
    const password = $os.getenv("PB_SUPERUSER_PASSWORD")

    // Sin credenciales en el entorno no se crea nada: el superusuario se puede
    // crear después con `./pocketbase superuser upsert EMAIL PASSWORD`.
    if (!email || !password) {
        return
    }

    // The migration re-runs after a backup restore; creating the already existing
    // superuser again fails the whole PocketBase boot and crash-loops the sandbox.
    // Find-or-create, then always set the password, so a re-run converges on the
    // current credentials instead of keeping stale ones.
    let record

    try {
        record = app.findAuthRecordByEmail("_superusers", email)
    } catch {
        record = new Record(app.findCollectionByNameOrId("_superusers"))
        record.set("email", email)
    }

    record.set("password", password)

    app.save(record)
})
