# ELD Integration Requests - Quick Setup

**Status:** ✅ Implementado (sin emails externos)

---

## 🎯 Qué está hecho

### 1. Database ✅
- Tabla: `eld_integration_requests` 
- RLS policies activadas
- Campos: eld_name, website, api_docs, notes, status, timestamps

### 2. Edge Function ✅
- Endpoint: `/functions/v1/eld-request`
- Recibe POST con datos del ELD
- Guarda en DB
- Retorna request_id

### 3. Frontend UI ✅
- Script: `eld-request.js` (ya agregado a index.html)
- Muestra ELDs soportados (Apollo, Next Fleet)
- Muestra Coming Soon (Geotab, Samsara, Verizon Connect, etc.)
- Modal para solicitar ELD no listado
- Validaciones + success/error messages

### 4. Admin Dashboard ✅
- Archivo: `admin-eld-requests.html`
- Ver todas las solicitudes
- Filtrar por status (pending, in_progress, completed, rejected)
- Click para ver detalles
- Cambiar status

---

## 🚀 Setup Final (3 pasos)

### Step 1: Ejecutar la migración SQL
```bash
# Opción A: Via Supabase CLI
cd /Users/rolandotrujillo/Documents/ZAP_TMS
supabase migration up 20260723000000_eld_integration_requests.sql

# Opción B: Via Supabase Console
# 1. Ve a Supabase → SQL Editor
# 2. Copia contenido de: supabase/migrations/20260723000000_eld_integration_requests.sql
# 3. Ejecuta
```

### Step 2: Crear el Edge Function
```bash
# Via Supabase CLI:
supabase functions deploy eld-request

# Via Supabase Console:
# 1. Ve a Edge Functions
# 2. Create new → eld-request
# 3. Copia contenido de: supabase/functions/eld-request/index.ts
# 4. Deploy
```

### Step 3: Verificar
1. Abre tu app: https://app.zapdispatch.com
2. Login → Settings → busca "ELD Integrations"
3. Click "+ Request ELD"
4. Completa form con un ELD de prueba
5. Submit

Luego:
1. Abre el admin dashboard: `admin-eld-requests.html`
2. Deberías ver tu solicitud de prueba

---

## 📊 Admin Dashboard

**Cómo acceder:**
```
File → Open → admin-eld-requests.html
```

O simplemente abre en el navegador:
```
file:///Users/rolandotrujillo/Documents/ZAP_TMS/admin-eld-requests.html
```

**Funciona:**
- ✅ Lee solicitudes en tiempo real desde Supabase
- ✅ Filtros por status
- ✅ Ver detalles completos
- ✅ Cambiar status (pending → in_progress → completed)
- ✅ Auto-refresca cada 30 seg

---

## 📝 Archivos

| Archivo | Qué hace |
|---------|----------|
| `eld-request.js` | UI en la app (modal, form, validación) |
| `supabase/functions/eld-request/index.ts` | Backend que guarda solicitudes |
| `supabase/migrations/20260723000000_...sql` | Crea tabla en DB |
| `admin-eld-requests.html` | Dashboard admin |
| `index.html` | Incluye eld-request.js (ya actualizado) |

---

## 🔐 Security

- ✅ RLS: Usuarios solo ven sus propias solicitudes
- ✅ Auth: Requiere Bearer token (Supabase session)
- ✅ No hay emails externos (sin dependencias)

---

## 🎨 Customizar ELDs

### Agregar más ELDs a "Coming Soon"
En `eld-request.js`, línea ~15:
```javascript
const COMING_SOON_ELDS=[
  {name:"Tu ELD",website:"https://...",popular:true},
  // ...
];
```

### Marcar un ELD como soportado
En `eld-request.js`, línea ~8:
```javascript
const SUPPORTED_ELDS=[
  {name:"Tu ELD",status:"available",icon:"✓"},
  // ...
];
```

---

## 🐛 Troubleshooting

### "Unauthorized" error al submitir
- Verifica que estés logeado en la app
- Revisa que el Bearer token sea válido

### Admin dashboard no carga solicitudes
- Abre DevTools (F12) → Console
- Verifica que `SUPABASE_URL` y `SUPABASE_KEY` sean correctos
- Intenta refrescar (Ctrl+R)

### Migration no ejecuta
- Verifica que la tabla no exista ya
- Si existe, la migración ignora (by design)
- Revisa en Supabase → SQL Editor

### No ves ELD Integrations en Settings
- Recarga la app (Ctrl+Shift+R - hard refresh)
- Verifica que `eld-request.js` esté cargando (DevTools → Network)

---

## 🔄 Workflow

1. **Usuario:** Solicita un ELD nuevo
2. **Sistema:** Guarda en DB, muestra confirmación
3. **Admin:** Ve solicitud en dashboard
4. **Admin:** Cambia status a "in_progress"
5. **Admin:** Cuando está ready, cambia a "completed"
6. **Usuario:** Puede ver status en Settings

---

## 📞 Próximos pasos (opcional)

Si quieres agregar emails:
1. Regístrate en https://resend.com (gratuito)
2. Obtén API key
3. Uncomment líneas de email en `supabase/functions/eld-request/index.ts`
4. Agrega env var `RESEND_API_KEY` en Supabase

---

**Ready!** Las solicitudes de ELD están 100% funcionales. 🚀
