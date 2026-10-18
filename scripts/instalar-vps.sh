#!/usr/bin/env bash
# Instala la versión de prueba de TexBase en un servidor Ubuntu/Debian.
# Uso (como root, desde una carpeta con pocketbase, pb_public, pb_migrations,
# pb_hooks y, opcionalmente, pb_data):
#   bash instalar-vps.sh prueba.texbase.es tu@email.com contraseña-del-panel
# Se puede volver a ejecutar para actualizar: conserva los datos existentes.
set -euo pipefail

DOMINIO="${1:?Falta el dominio (ej. prueba.texbase.es)}"
EMAIL="${2:?Falta el email del superusuario}"
PASSWORD="${3:?Falta la contraseña del superusuario (mínimo 10 caracteres)}"
DEST=/opt/texbase
ORIGEN="$(cd "$(dirname "$0")" && pwd)"

[ "$(id -u)" -eq 0 ] || { echo "Ejecuta el script como root (sudo)."; exit 1; }

echo "==> Copiando la aplicación a $DEST"
systemctl stop texbase 2>/dev/null || true
mkdir -p "$DEST"
cp -r "$ORIGEN/pocketbase" "$ORIGEN/pb_public" "$ORIGEN/pb_migrations" "$ORIGEN/pb_hooks" "$DEST/"
if [ -f "$DEST/pb_data/data.db" ]; then
	echo "    (ya había datos en $DEST/pb_data; se conservan)"
elif [ -d "$ORIGEN/pb_data" ]; then
	cp -r "$ORIGEN/pb_data" "$DEST/"
else
	mkdir -p "$DEST/pb_data"
fi
chmod +x "$DEST/pocketbase"
id texbase >/dev/null 2>&1 || useradd --system --home "$DEST" --shell /usr/sbin/nologin texbase
chown -R texbase:texbase "$DEST"

echo "==> Migraciones y superusuario del panel (/_/)"
runuser -u texbase -- "$DEST/pocketbase" migrate up --dir="$DEST/pb_data" --migrationsDir="$DEST/pb_migrations" --hooksDir="$DEST/pb_hooks"
runuser -u texbase -- "$DEST/pocketbase" superuser upsert "$EMAIL" "$PASSWORD" --dir="$DEST/pb_data" --migrationsDir="$DEST/pb_migrations"

echo "==> Servicio systemd"
cat > /etc/systemd/system/texbase.service <<EOF
[Unit]
Description=TexBase (PocketBase)
After=network.target

[Service]
User=texbase
WorkingDirectory=$DEST
Environment=TZ=Europe/Madrid
Environment=PB_APP_URL=https://$DOMINIO
ExecStart=$DEST/pocketbase serve --http=127.0.0.1:8090 --dir=$DEST/pb_data --migrationsDir=$DEST/pb_migrations --hooksDir=$DEST/pb_hooks --publicDir=$DEST/pb_public
Restart=always
RestartSec=3
LimitNOFILE=4096

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable texbase
systemctl restart texbase

echo "==> HTTPS con Caddy"
if ! command -v caddy >/dev/null; then
	apt-get update -qq
	apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https curl gnupg
	curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
	apt-get update -qq && apt-get install -y -qq caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
$DOMINIO {
	reverse_proxy 127.0.0.1:8090
}
EOF
systemctl reload caddy || systemctl restart caddy

if command -v ufw >/dev/null && ufw status | grep -q active; then
	ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

sleep 3
if curl -fsS http://127.0.0.1:8090/api/health >/dev/null; then
	echo
	echo "Listo: https://$DOMINIO"
	echo "Panel de administración: https://$DOMINIO/_/  ($EMAIL)"
	echo "(El certificado HTTPS puede tardar un minuto la primera vez.)"
else
	echo "La aplicación no responde. Revisa: journalctl -u texbase -n 50"
	exit 1
fi
