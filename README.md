# TexBase

Gestión de producción de Onatex: exclusivas, rutas y operaciones, registro de tiempos de operarios, calidad (controles, no conformidades, retrabajos), externalización, proveedores, nóminas, costes y forecast.

Este repositorio parte del código exportado de Hostinger Horizons, sin las dependencias de Horizons, para poder mantenerlo y alojarlo de forma independiente.

## Arquitectura

```
apps/
  web/          Frontend: React 18 + Vite + Tailwind (shadcn/ui), react-router
  pocketbase/   Backend: PocketBase 0.40 (SQLite, auth, archivos, tiempo real)
    pb_migrations/   Esquema de la base de datos
    pb_hooks/        Lógica de servidor (JS)
    pb_public/       Frontend compilado (lo genera `npm run build`)
    legacy/          Historial de migraciones de Horizons (solo referencia, no se ejecuta)
scripts/        Utilidades (importar copia de seguridad de Horizons)
```

En producción, **un único proceso de PocketBase** sirve la API (`/api/`), el panel de administración (`/_/`) y la aplicación web (el resto de rutas).

### Roles y rutas

| Ruta | Rol |
|---|---|
| `/operario` | operari |
| `/produccio` | produccio |
| `/qualitat` | qualitat |
| `/externalitzacio` | externalitzacio |
| `/proveedor` | proveedor |
| `/cliente` | panel público de cliente |
| `/admin` | admin |
| `/superadmin` | superadmin |

### Hooks de servidor (`apps/pocketbase/pb_hooks`)

- `auto-close-paused-delivered.pb.js`: revisa las operaciones pausadas cuando la exclusiva ya está entregada.
- `auto-pendiente-calidad.pb.js`: pasa la exclusiva a Calidad cuando todas sus unidades han terminado confección y no quedan retrabajos.
- `cliente-stats.pb.js`: endpoint público `GET /api/cliente/stats` del panel de cliente.
- `encargos_proteccion.pb.js`: impide crear encargos externos activos que se solapen (mismo proveedor, exclusiva, fase y unidades).
- `retrabajos-notifications.pb.js`: notificaciones de retrabajos (en la app y por email; el email requiere SMTP).

## Desarrollo local

Requisitos: Node 22 y `unzip`.

```bash
npm run setup            # instala dependencias y descarga PocketBase
cp .env.example .env     # opcional: superusuario inicial
npm run dev              # PocketBase en :8090 + Vite en :3000
```

Abre http://localhost:3000. Vite reenvía `/api` y `/_` a PocketBase.

La primera vez, crea el superusuario de PocketBase para entrar en http://localhost:8090/_/:

```bash
cd apps/pocketbase && ./pocketbase superuser upsert tu@email.com tu-contraseña
```

Otros comandos: `npm run lint`, `npm run build` (compila a `apps/pocketbase/pb_public`).

## Despliegue

### Con Docker (recomendado)

```bash
cp .env.example .env      # rellena las variables
docker compose up -d --build
```

La app queda en el puerto 8090; los datos, en `apps/pocketbase/pb_data`. Delante pon un proxy con HTTPS (Caddy, Nginx o el panel de Hostinger VPS) apuntando a `localhost:8090`. Ejemplo con Caddy:

```
texbase.es {
    reverse_proxy localhost:8090
}
```

### En un VPS (Ubuntu), sin Docker

`scripts/instalar-vps.sh` deja la app como servicio systemd con HTTPS (Caddy). Se ejecuta como root desde una carpeta con `pocketbase`, `pb_public` (compilado), `pb_migrations`, `pb_hooks` y opcionalmente `pb_data`:

```bash
bash instalar-vps.sh prueba.texbase.es tu@email.com contraseña-del-panel
```

### Sin Docker (manual)

```bash
npm run setup && npm run build
cd apps/pocketbase && ./pocketbase serve --http=0.0.0.0:8090
```

Para dejarlo como servicio, usa systemd (ver la [documentación de PocketBase](https://pocketbase.io/docs/going-to-production/)).

### Copias de seguridad

Desde el panel `/_/` → Settings → Backups puedes programar copias automáticas (y enviarlas a S3). Como mínimo, copia periódicamente la carpeta `pb_data`.

## Migrar los datos desde Horizons

1. Entra en el panel de PocketBase de Horizons: https://texbase.es/hcgi/platform/ (credenciales de superusuario de Horizons).
2. Settings → Backups → crea una copia y descárgala (`.zip`).
3. En el servidor nuevo, con PocketBase parado:

   ```bash
   npm run importar-backup -- ruta/al/backup.zip
   ```

   El script copia los datos y archivos a `apps/pocketbase/pb_data` y elimina los ajustes cifrados de Horizons (no tenemos su clave). Los usuarios y sus contraseñas se conservan.
4. Arranca PocketBase (aplica las migraciones nuevas) y crea tu superusuario con `./pocketbase superuser upsert`.
5. Configura el SMTP en `/_/` → Settings → Mail settings. En Horizons los emails salían por un servicio interno de Hostinger que ya no se usa; sin SMTP, los avisos por email de retrabajos no se envían (los avisos dentro de la app sí).
6. Cambia el DNS de `texbase.es` al servidor nuevo.

## Notas sobre el esquema

`pb_migrations/1795000000_baseline_schema.js` contiene el esquema completo de las 59 colecciones, generado desde la base de datos exportada. Sustituye a las ~95 migraciones de Horizons (en `legacy/`), que incluían datos de demostración y no se podían reproducir sobre una base vacía. Es idempotente: sobre una base de datos que ya tiene el esquema no cambia nada.

Para cambiar el esquema, edítalo desde `/_/` en local: PocketBase genera automáticamente el archivo de migración en `pb_migrations/`. Haz commit de ese archivo y se aplicará en producción al arrancar.
