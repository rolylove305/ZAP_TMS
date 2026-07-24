# ELD Integration Request System - Setup Guide

## Overview
Sistema completo para que usuarios soliciten integración de nuevos ELDs y que tú (admin) recibas notificaciones y gestiones las solicitudes.

## 📋 What's Included

### 1. Database Migration
- **File:** `supabase/migrations/20260723000000_eld_integration_requests.sql`
- **Creates:** `eld_integration_requests` table con RLS policies
- **Fields:** eld_name, eld_website, api_documentation, notes, status, timestamps

### 2. Edge Function (Backend)
- **File:** `supabase/functions/eld-request/index.ts`
- **Endpoint:** `/functions/v1/eld-request`
- **Does:**
  - Recibe solicitudes POST
  - Encripta y almacena datos
  - Envía email de notificación al admin
  - Envía confirmación al usuario
  
**Requiere env vars:**
```
ADMIN_EMAIL=tu@email.com
RESEND_API_KEY=your_resend_key
```

### 3. Frontend UI (App)
- **File:** `eld-request.js`
- **Shows:**
  - ELDs actualmente soportados (Apollo, Next Fleet)
  - Lista de "Coming Soon" ELDs (Geotab, Samsara, etc.)
  - Modal para solicitar un ELD que no está listado
  
**Add to `index.html`:**
```html
<script src="eld-request.js"></script>
```

### 4. Admin Dashboard
- **File:** `admin-eld-requests.html`
- **Features:**
  - Ver todas las solicitudes
  - Filtrar por estado (pending, in_progress, completed, rejected)
  - Ver detalles de cada solicitud
  - Cambiar estado
  - Auto-refresca cada 30 seg

**Abre en:** `file:///{tu-path}/admin-eld-requests.html`

---

## 🚀 Setup Steps

### Step 1: Run Database Migration
```bash
cd supabase
supabase migration up 20260723000000_eld_integration_requests.sql
# O en la consola de Supabase: copia y pega el SQL
```

### Step 2: Create Edge Function
1. Ve a **Supabase Console → Edge Functions**
2. Crea nueva función: `eld-request`
3. Copia contenido de `supabase/functions/eld-request/index.ts`

### Step 3: Set Environment Variables
En Supabase Console → Project Settings → Edge Functions Secrets:

```
ADMIN_EMAIL = tu@email.com
RESEND_API_KEY = re_xxxxx  (obtén en https://resend.com)
```

**Nota:** Si no tienes Resend, puedes:
- Usar SendGrid, Mailgun, o AWS SES
- O solo guardar en DB sin enviar email (comentar la función sendEmail)

### Step 4: Add Script to App
En `index.html`, agrega antes del cierre `</body>`:
```html
<script src="eld-request.js"></script>
```

### Step 5: Test Admin Dashboard
1. Abre `admin-eld-requests.html` en tu navegador
2. Verás tabla vacía si no hay solicitudes aún
3. Cuando alguien solicite un ELD, aparecerá aquí

---

## 📧 Email Notifications

El sistema envía **dos emails**:

1. **Admin Notification**
   - Para: `ADMIN_EMAIL`
   - Cuando: Nueva solicitud
   - Contiene: ELD name, user email, website, API docs, notes

2. **User Confirmation**
   - Para: Email del usuario
   - Cuando: Solicitud recibida
   - Contiene: Confirmación + request ID

---

## 🔧 Customization

### Agregar más ELDs a "Coming Soon"
En `eld-request.js`, edita:
```javascript
const COMING_SOON_ELDS=[
  {name:"Tu ELD",website:"https://...",popular:true},
  ...
];
```

### Cambiar ELDs soportados
Cuando implementes una nueva integración:
```javascript
const SUPPORTED_ELDS=[
  {name:"Apollo ELD",status:"available",icon:"✓"},
  {name:"Next Fleet ELD",status:"available",icon:"✓"},
  {name:"Tu ELD",status:"available",icon:"✓"}, // ← Agregar aquí
];
```

### Personalizar admin dashboard
`admin-eld-requests.html` puede modificarse:
- Cambiar colores (busca `#d6a62b`)
- Agregar columnas
- Exportar a CSV
- Integrar con tu CRM

---

## 🔐 Security

- ✅ RLS Policies: Usuarios solo ven sus propias solicitudes
- ✅ Datos encriptados en tránsito (HTTPS)
- ✅ Bearer token requerido para POST
- ✅ SQL injection prevenido (prepared statements)

---

## 📊 Database Schema

```sql
eld_integration_requests {
  id: uuid (PK)
  user_id: uuid (FK → auth.users)
  company_id: text
  eld_name: text
  eld_website: text (nullable)
  api_documentation: text (nullable)
  notes: text (nullable)
  status: text ('pending' | 'in_progress' | 'completed' | 'rejected')
  created_at: timestamp
  updated_at: timestamp
}
```

---

## 🐛 Troubleshooting

### Email no se envía
- Verifica `RESEND_API_KEY` en secrets
- Revisa logs en Supabase → Edge Functions
- Prueba con curl: `curl -X POST {endpoint} -H "Authorization: Bearer {token}"`

### Table no existe
- Corre la migración SQL nuevamente
- Verifica en Supabase → SQL Editor que la tabla exista

### Admin dashboard vacío
- Verifica que `SUPABASE_URL` y `SUPABASE_KEY` sean correctos en el HTML
- Abre DevTools (F12) → Console para ver errores
- Verifica que haya solicitudes en la DB

### Emails duplicados
- Por defecto, sistema envía 2 emails
- Si no quieres email al usuario, comenta línea 120 en eld-request/index.ts

---

## 📱 User Flow

1. Usuario abre Settings → ELD Integrations
2. Ve ELDs soportados + Coming Soon
3. Click "+ Request ELD"
4. Completa form con nombre del ELD
5. Submit → recibe confirmación
6. Tú recibes email con detalles
7. Abres admin dashboard → ves solicitud
8. Cambias estado (pending → in_progress → completed)

---

## 📞 Support

Si necesitas ayuda:
- Revisa logs en Supabase Console → Functions → `eld-request`
- Verifica RLS policies: `supabase/migrations/20260723000000_eld_integration_requests.sql`
- Test endpoint: envía POST con Bearer token

---

**Ready?** Implementa paso a paso y avísame si necesitas ajustes.
