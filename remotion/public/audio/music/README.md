# Música de fondo para reels

Coloca aquí los archivos `.mp3` que quieras usar como música de fondo (2–3
pistas está bien). Luego agrega el nombre exacto del archivo a
`MUSIC_TRACKS` en `remotion/audio-tracks.ts`.

Requisitos:
- Formato `.mp3`, nombre sin espacios (usa `-` o `_`).
- Idealmente instrumental / sin voz, para no competir con el texto en pantalla.
- Debes tener los derechos para usarla en contenido comercial de terceros
  (se publica en las redes sociales de los clientes de Kefy).

Después de agregar o quitar pistas hay que re-desplegar el sitio de Remotion:

```bash
npx tsx scripts/deploy-remotion-lambda.ts
```
