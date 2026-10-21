#!/usr/bin/env bash
# Ejecuta un plan de ZAP con el token del perfil indicado (usuario | admin). El token se
# sustituye en una copia temporal del plan, que se borra al terminar.
set -uo pipefail
# Carpeta de trabajo (configurable con la variable GASTOSEGURO_WORK).
SP="${GASTOSEGURO_WORK:-${TMPDIR:-/tmp}/gastoseguro}"
PERFIL="$1"
KEY=$([ "$PERFIL" = "admin" ] && echo admin || echo user)
cd "$SP/zap"
rm -rf "$SP/zap/home-$PERFIL"
node -e "
const fs=require('fs');
const token=require('./tokens.json')['$KEY'];
const plan=fs.readFileSync('plan-$PERFIL.yaml','utf8').replace('\${GS_TOKEN}', token);
fs.writeFileSync('plan-$PERFIL.run.yaml', plan, { mode: 0o600 });"
"$SP/tools/jre/jdk-21.0.12.1+1-jre/bin/java.exe" -Xmx3g -jar "$SP/tools/zap/ZAP_2.17.0/zap-2.17.0.jar" -cmd -silent \
  -dir "$SP/zap/home-$PERFIL" -autorun "$SP/zap/plan-$PERFIL.run.yaml" > "$SP/zap/out/run-$PERFIL.log" 2>&1
status=$?
rm -f "$SP/zap/plan-$PERFIL.run.yaml"
echo "exit=$status" >> "$SP/zap/out/run-$PERFIL.log"
