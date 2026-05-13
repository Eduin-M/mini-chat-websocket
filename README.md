# Mini Chat 💬

Chat en tiempo real con salas dinámicas, WebSocket y autenticación JWT.

## Características
- Registro e inicio de sesión seguros con bcrypt y JWT
- Comunicación en tiempo real usando WebSocket
- Salas múltiples (tipo Discord)
- Indicador de escritura y notificaciones de conexión/desconexión
- Historial persistente con SQLite

## Requisitos
- Node.js 18+

## Instalación
```bash
npm install
```

## Configuración
Define estas variables de entorno antes de iniciar:

- `JWT_SECRET`: clave para firmar tokens JWT (obligatoria en producción)
- `PORT` (opcional): puerto HTTP, por defecto `8080`

Ejemplo en PowerShell:

```powershell
$env:JWT_SECRET="cambia-esta-clave"
$env:PORT="8080"
npm start
```

## Ejecución
```bash
npm start
```

Luego abre `http://localhost:8080`.
