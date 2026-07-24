# Carmina Store

SPA instalable (PWA sin precache) para catálogo, proveedores, usuarios y cotización con Gemini + fotos en WebDAV.

## Requisitos

- Node.js 18+
- MySQL accesible con las credenciales del `.env`

## Variables de entorno (`.env`)

```
DB_HOST=
DB_NAME=
DB_USER=
DB_PASSWORD=
STORE_HOST=
STORE_USER=
STORE_PASS=
GEMINI_API_KEY=
PORT=3000
```

## Instalación

```bash
npm install
npm start
```

Abre `http://localhost:3000`

Las tablas `PROVEEDORES`, `PRODUCTOS` y `USUARIOS` se crean automáticamente al iniciar.

## Acceso inicial

- Usuario: `ALEXIS`
- Contraseña: `2410201415082017`
- Tipo: `ADMINISTRADOR`

## Módulos

1. **Catálogo** — CRUD de productos, foto en WebDAV, modal de perfil, cotización Gemini (botón robot / modal)
2. **Proveedores** — CRUD; no elimina si hay productos asociados
3. **Usuarios** — CRUD (solo ADMINISTRADOR)

## Scripts

- `npm start` — producción
- `npm run dev` — nodemon
- `npm run init-db` — solo crear/actualizar tablas
