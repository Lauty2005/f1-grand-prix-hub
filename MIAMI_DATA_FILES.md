# 📊 MIAMI 2026 - Archivos de Datos Disponibles

Archivos listos para importar en el admin panel o mediante el script de terminal.

---

## 📁 Archivos JSON Creados

### 1️⃣ **miami-practice-2026.json** ✅
- **Contenido:** Practice 1 (Única sesión de práctica libre - Circuito con Sprint)
- **Datos:** 22 pilotos
- **Estructura:** `{ "results": [{driver, time, status}, ...] }`
- **Uso:** Panel Admin (Importación Rápida)
- **Estado:** Verificado y listo

### 2️⃣ **miami-sprint-qualifying-2026.json** ✅
- **Contenido:** Sprint Qualifying (SQ)
- **Datos:** 21 pilotos clasificados
- **Estructura:** `{ "sessions": [{"type": "sprint-qualifying", "data": [...]}] }`
- **Uso:** Script terminal: `node import-miami-data.js miami-sprint-qualifying-2026.json`
- **Estado:** Listo para importar

### 3️⃣ **miami-qualifying-2026.json** ✅
- **Contenido:** Qualifying (Q1, Q2, Q3)
- **Datos:** 22 pilotos (incluyendo DNQ y DQ)
- **Estructura:** `{ "sessions": [{"type": "qualifying", "data": [...]}] }`
- **Uso:** Script terminal: `node import-miami-data.js miami-qualifying-2026.json`
- **Estado:** Listo para importar

### 4️⃣ **miami-complete-2026.json** ⭐
- **Contenido:** TODOS los datos en un archivo (Practice, Sprint Qualifying, Qualifying)
- **Datos:** 3 sesiones completas
- **Estructura:** Multi-sesión
- **Uso:** Script terminal: `node import-miami-data.js miami-complete-2026.json`
- **Ventaja:** Importación en lote de todas las sesiones
- **Estado:** Listo para importar

---

## 🚀 Cómo Importar los Datos

### **Opción A: Panel Admin (Archivo Individual)**

1. Ve a `http://localhost:5173/admin.html`
2. Inicia sesión
3. Busca la sección **"🚀 Importación Rápida"**
4. Usa: **miami-practice-2026.json** (archivo para admin con estructura de `results`)

```bash
# O directamente, copia el contenido del archivo
```

### **Opción B: Terminal (Recomendado para Múltiples Sesiones)**

```bash
cd f1_agent

# Importar Sprint Qualifying
node import-miami-data.js miami-sprint-qualifying-2026.json

# Importar Qualifying
node import-miami-data.js miami-qualifying-2026.json

# O importar TODOS en una pasada
node import-miami-data.js miami-complete-2026.json
```

---

## 📋 Datos Incluidos por Sesión

### **Practice 1** (22 pilotos)
- Charles Leclerc: 1:29.310 (fastest)
- Max Verstappen: +0.297s
- Oscar Piastri: +0.448s
- ... y 19 más

### **Sprint Qualifying** (21 pilotos)
- Lando Norris: 1:27.869 (P1)
- Kimi Antonelli: 1:28.091 (P2)
- Oscar Piastri: 1:28.108 (P3)
- ... y 18 más

### **Qualifying** (22 pilotos)
- Kimi Antonelli: 1:27.798 (P1)
- Max Verstappen: 1:27.964 (P2)
- Charles Leclerc: 1:28.143 (P3)
- ... y 19 más (incluyendo 8 DNQ y 1 DQ)

---

## ✅ Verificación

Después de importar:

1. **Panel Admin:**
   - Ve a cada sesión
   - Verifica que los datos se hayan guardado correctamente
   - Comprueba posiciones, tiempos y estados

2. **Base de Datos:**
   ```bash
   # Verifica en PostgreSQL
   SELECT * FROM practices WHERE race_id = (SELECT id FROM races WHERE name ILIKE '%MIAMI%');
   SELECT * FROM sprint_qualifying WHERE race_id = (SELECT id FROM races WHERE name ILIKE '%MIAMI%');
   SELECT * FROM qualifying WHERE race_id = (SELECT id FROM races WHERE name ILIKE '%MIAMI%');
   ```

---

## 📊 Estructura de Cada Tipo de Sesión

### Practice
```json
{ "driver": "Charles Leclerc", "p1": "1:29.310", "p2": "-", "p3": "-" }
```

### Sprint Qualifying
```json
{ "driver": "Lando Norris", "position": 1, "sq1": "1:27.869", "sq2": "-", "sq3": "-" }
```

### Qualifying
```json
{ "driver": "Kimi Antonelli", "position": 1, "q1": "1:27.123", "q2": "1:27.045", "q3": "1:27.798" }
```

### DNQ/DSQ (No Clasificado/Descalificado)
```json
{ "driver": "Isack Hadjar", "position": 22, "q1": "-", "q2": "-", "q3": "-", "dsq": true }
```

---

## 💡 Tips

- **Usar `miami-complete-2026.json`** es más eficiente que importar archivos individuales
- Los archivos individuales son útiles si necesitas importar sesiones en momentos diferentes
- Siempre verifica los datos después de importar
- Los tiempos están en formato `MM:SS.mmm` (minutos:segundos.milisegundos)
- El estado `-` indica que no hay tiempo registrado

---

## 📞 Pendiente

Los siguientes datos aún deben ser extraídos:
- ❌ **Sprint Race** (resultados de la carrera sprint)
- ❌ **Race** (carrera principal)
- ❌ **Strategy** (estrategia de paradas)

