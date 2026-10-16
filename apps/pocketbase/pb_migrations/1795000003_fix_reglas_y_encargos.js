/// <reference path="../pb_data/types.d.ts" />
// Correcciones de la revisión de errores:
//  1. Usuarios: un admin ya no puede crear, ascender ni modificar superadmins.
//  2. Rol proveedor (externo): sin acceso a las colecciones internas; solo ve
//     sus encargos y las exclusivas/unidades de esos encargos.
//  3. Reglas que impedían acciones legítimas desde la app (borrar artículos o
//     exclusivas como superadmin, editar controles QC, descartar cronómetro).
//  4. encargos_externos.monos era una relación simple: un encargo de N
//     unidades solo guardaba una. Pasa a múltiple y se recuperan las unidades
//     del movimiento de envío.
migrate((app) => {
    const ADMINS = "(@request.auth.rol = 'admin' || @request.auth.rol = 'superadmin')"
    const NO_PROV = "@request.auth.rol != 'proveedor'"
    const RULES = ["listRule", "viewRule", "createRule", "updateRule", "deleteRule"]

    const setRules = (name, rules) => {
        const c = app.findCollectionByNameOrId(name)
        for (const k in rules) c[k] = rules[k]
        app.save(c)
    }

    // 1. Usuarios
    setRules("users", {
        createRule: "@request.auth.rol = 'superadmin' || (@request.auth.rol = 'admin' && @request.body.rol != 'superadmin')",
        updateRule: "(id = @request.auth.id && @request.body.rol:changed = false && @request.body.proveedor_id:changed = false) || @request.auth.rol = 'superadmin' || (@request.auth.rol = 'admin' && rol != 'superadmin' && @request.body.rol != 'superadmin')",
        deleteRule: "@request.auth.rol = 'superadmin' || (@request.auth.rol = 'admin' && rol != 'superadmin')",
        manageRule: "@request.auth.rol = 'superadmin' || (@request.auth.rol = 'admin' && rol != 'superadmin')",
        listRule: "@request.auth.id != '' && (" + NO_PROV + " || id = @request.auth.id)",
        viewRule: "@request.auth.id != '' && (" + NO_PROV + " || id = @request.auth.id)",
    })

    // 2. Proveedor fuera de las colecciones internas abiertas a "cualquier usuario"
    const INTERNAS = [
        "actividad_calidad", "articles", "calendario_laboral", "categories_nc", "checklist_calidad",
        "control_calidad", "controles_qualitat", "controles_qualitat_def", "fases_articulo",
        "fases_externalizadas_exclusiva", "historial_calidad", "historial_cambios_exclusivas",
        "historial_control_calidad", "historial_eliminacions_exclusivas", "historial_fases_externalizadas",
        "historial_pausas", "mensajes_exclusiva", "no_conformitats", "operaciones_libres",
        "operacions_def", "registres", "registro_horario", "rutes", "tiempos_exclusiva",
        "exclusives", "monos",
    ]
    for (const name of INTERNAS) {
        const c = app.findCollectionByNameOrId(name)
        for (const k of RULES) {
            const r = c[k]
            if (r && /@request\.auth\.id\s*!=\s*(''|"")/.test(r) && r.indexOf("proveedor") === -1) {
                c[k] = "(" + r + ") && " + NO_PROV
            }
        }
        app.save(c)
    }
    // El proveedor sí ve las exclusivas y unidades de sus propios encargos.
    const delProveedor = (campo) => "(@request.auth.rol = 'proveedor' && @request.auth.proveedor_id != '' && " +
        "@collection.encargos_externos:pe.proveedor_id ?= @request.auth.proveedor_id && " +
        "@collection.encargos_externos:pe." + campo + " ?= id)"
    setRules("exclusives", {
        listRule: "@request.auth.id != '' && (" + NO_PROV + " || " + delProveedor("exclusiva_id") + ")",
        viewRule: "@request.auth.id != '' && (" + NO_PROV + " || " + delProveedor("exclusiva_id") + ")",
    })

    // 3. Acciones legítimas que fallaban
    setRules("articles", { deleteRule: ADMINS })
    setRules("exclusives", { deleteRule: ADMINS })
    setRules("registres", {
        deleteRule: ADMINS + " || (operari = @request.auth.id && estat != 'finalitzat')",
    })
    setRules("controles_qualitat_def", { createRule: ADMINS, updateRule: ADMINS, deleteRule: ADMINS })
    setRules("chat_calidad_lectura", {
        createRule: "(@request.auth.rol = 'qualitat' || @request.auth.rol = 'superadmin') && @request.auth.id = @request.body.usuari",
        updateRule: "(@request.auth.rol = 'qualitat' || @request.auth.rol = 'superadmin') && @request.auth.id = usuari",
    })

    // 4. encargos_externos.monos → relación múltiple
    const encargos = app.findCollectionByNameOrId("encargos_externos")
    encargos.fields.getByName("monos").maxSelect = 999
    app.save(encargos)

    setRules("monos", {
        listRule: "@request.auth.id != '' && (" + NO_PROV + " || " + delProveedor("monos.id") + ")",
        viewRule: "@request.auth.id != '' && (" + NO_PROV + " || " + delProveedor("monos.id") + ")",
    })

    // Recupera las unidades desde el movimiento de envío inicial.
    const parseUnidades = (raw) => {
        try {
            let v = JSON.parse(String(raw || "[]"))
            if (typeof v === "string") v = JSON.parse(v)
            return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x) : []
        } catch (_) {
            return []
        }
    }
    let recuperados = 0
    for (const enc of app.findAllRecords("encargos_externos")) {
        const actuales = enc.getStringSlice("monos")
        let movs = []
        try {
            movs = app.findRecordsByFilter("movimientos_encargo", "encargo_id = {:id} && tipo = 'envio'", "created", 1, 0, { id: enc.id })
        } catch (_) {}
        if (!movs.length) continue
        const unidades = parseUnidades(movs[0].getString("unidades"))
            .filter((id) => { try { app.findRecordById("monos", id); return true } catch (_) { return false } })
        if (unidades.length > actuales.length) {
            enc.set("monos", unidades)
            app.saveNoValidate(enc)
            recuperados++
        }
    }
    if (recuperados) console.log("encargos_externos: unidades recuperadas en " + recuperados + " encargos")
}, (app) => {
    // Sin vuelta atrás automática: las reglas anteriores tenían agujeros de seguridad.
})
