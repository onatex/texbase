/// <reference path="../pb_data/types.d.ts" />
// Ajustes para el despliegue propio (fuera de Hostinger Horizons).
migrate((app) => {
    const settings = app.settings()

    settings.meta.appName = "TexBase"
    if ($os.getenv("PB_APP_URL")) settings.meta.appURL = $os.getenv("PB_APP_URL")
    settings.meta.hideControls = false
    settings.logs.minLevel = 0

    app.save(settings)
})
