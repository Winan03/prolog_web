# PrologWeb 🧠

Intérprete **SWI-Prolog completo** en la nube con colaboración en tiempo real. Diseñado para cursos de Inteligencia Artificial.

## Stack
- **Frontend**: Next.js 14 → Vercel
- **Backend**: FastAPI + SWI-Prolog → Railway (Docker)
- **DB**: Supabase (PostgreSQL)
- **Auth**: JWT + Códigos de invitación

## Características
- ✅ SWI-Prolog completo (`assert/retract`, DCGs, `findall`, módulos)
- ✅ Sandbox de seguridad (bloquea `shell/1`, `process_create/3`, etc.)
- ✅ Editor Monaco con sintaxis Prolog resaltada
- ✅ Colaboración en tiempo real (ambos pueden editar y guardar)
- ✅ Auto-guardado cada 30 segundos
- ✅ Descarga `.pl` en un clic
- ✅ Historial de versiones (últimas 10)
- ✅ Códigos de invitación para control de acceso
- ✅ Panel de administración

## Setup Rápido

### 1. Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com)
2. Ve a SQL Editor y ejecuta `backend/schema.sql`
3. Copia la URL y Service Key de Settings → API

### 2. Backend (Railway)
```bash
# 1. Crea cuenta en railway.app
# 2. New Project → Deploy from GitHub → selecciona la carpeta /backend
# 3. Agrega las variables de entorno:
JWT_SECRET_KEY=<genera con: python -c "import secrets; print(secrets.token_hex(32))">
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ...
FRONTEND_URL=https://tu-app.vercel.app
```

### 3. Frontend (Vercel)
```bash
cd frontend
npm install
# Crea .env.local con:
# NEXT_PUBLIC_API_URL=https://tu-backend.railway.app

# Deploy:
vercel --prod
```

### 4. Crear primer admin
Ejecuta en Supabase SQL Editor (cambia el hash con bcrypt):
```sql
INSERT INTO users (email, username, password_hash, role)
VALUES ('admin@email.com', 'admin', '$2b$12$HASH', 'admin');
```

O usa Python localmente:
```python
from passlib.hash import bcrypt
print(bcrypt.hash("tu_password_aqui"))
```

## Desarrollo Local
```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env  # llena los valores
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env.local  # llena los valores
npm run dev
```

## Seguridad
- Predicados peligrosos bloqueados: `shell/1`, `process_create/3`, `open/3` (escritura)
- Límite de tiempo: 15 segundos por consulta
- Límite de memoria: 128MB stack
- Rate limiting: 20 ejecuciones/minuto por usuario
- JWT expira en 8 horas
- CORS estricto (solo el dominio del frontend)
