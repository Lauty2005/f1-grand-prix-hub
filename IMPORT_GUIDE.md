# 🏁 Guía de Importación de Datos MIAMI

Esta guía te ayudará a cargar los datos de las sesiones de MIAMI de forma rápida, tanto desde el panel admin como desde la terminal.

---

## Opción 1️⃣: Panel Admin (Interfaz Web)

### ✅ Ventajas:
- Visual e intuitivo
- Puedes verificar los datos antes de guardar
- No requiere línea de comandos

### 📋 Pasos:

1. **Inicia la aplicación**
   ```bash
   # Terminal 1: Backend
   cd server
   npm start

   # Terminal 2: Frontend
   cd client
   npm run dev
   ```

2. **Accede al admin panel**
   - Ve a `http://localhost:5173/admin.html`
   - Inicia sesión con tu contraseña admin

3. **Localiza la sección "🚀 Importación Rápida"**
   - Está al final del formulario de Control de Carrera

4. **Elige tu método**

   **Opción A: Cargar CSV**
   - Formato esperado:
     ```
     Piloto,Posición/Tiempo,Estado
     Max Verstappen,1:25.234,
     Charles Leclerc,+0.5s,
     Carlos Sainz,DNF,DNF
     ```
   - Selecciona el archivo CSV
   - Vista previa automática ✨
   - Haz click en "✅ GUARDAR TODO"

   **Opción B: Cargar JSON**
   - Descarga el template haciendo click en "JSON Template"
   - Edítalo con tus datos (ver ejemplo más abajo)
   - Cárgalo en la interfaz
   - Se cargarán todos los datos de una vez

---

## Opción 2️⃣: Script de Terminal (Importación Masiva)

### ✅ Ventajas:
- Más rápido para grandes volúmenes
- Automatizable
- Ideal para datos de múltiples carreras

### 📋 Pasos:

1. **Prepara un archivo JSON**
   ```bash
   # Usa el ejemplo como base
   cp f1_agent/miami-data-example.json f1_agent/mi-carrera.json
   ```

2. **Edita el JSON con tus datos**
   ```json
   {
     "race": "Miami Grand Prix",
     "sessions": [
       {
         "type": "practices",
         "data": [
           { "driver": "Max Verstappen", "p1": "1:27.852", "p2": "1:26.341", "p3": "1:25.934" }
         ]
       },
       {
         "type": "qualifying",
         "data": [
           { "driver": "Max Verstappen", "position": 1, "q1": "1:26.234", "q2": "1:25.678", "q3": "1:24.956" }
         ]
       },
       {
         "type": "race",
         "data": [
           { "driver": "Max Verstappen", "position": 1, "points": 25, "fastest_lap": true }
         ]
       }
     ]
   }
   ```

3. **Ejecuta el script**
   ```bash
   cd f1_agent
   node import-miami-data.js mi-carrera.json
   ```

4. **Verifica la salida**
   ```
   📂 Leyendo archivo...
   🔍 Buscando carrera MIAMI...
   ✅ Carrera encontrada (ID: abc-123)
   📊 Procesando practices...
     ✅ Max Verstappen
     ✅ Charles Leclerc
   ...
   ✅ ¡Importación completada!
   ```

---

## 📊 Estructuras de Datos

### Prácticas (Practices)
```json
{
  "driver": "Max Verstappen",
  "p1": "1:27.852",      // Sesión 1
  "p2": "1:26.341",      // Sesión 2
  "p3": "1:25.934"       // Sesión 3
  // "-" indica sin tiempo
}
```

### Clasificación (Qualifying)
```json
{
  "driver": "Max Verstappen",
  "position": 1,
  "q1": "1:26.234",      // Q1
  "q2": "1:25.678",      // Q2
  "q3": "1:24.956"       // Q3
}
```

### Sprint Shootout (Sprint Qualifying)
```json
{
  "driver": "Max Verstappen",
  "position": 1,
  "sq1": "1:26.234",
  "sq2": "1:25.678",
  "sq3": "1:24.956"
}
```

### Carrera Sprint (Sprint)
```json
{
  "driver": "Max Verstappen",
  "position": 1,
  "points": 8,
  "dnf": false,
  "time_gap": "+0.5s"
}
```

### Carrera Principal (Race)
```json
{
  "driver": "Max Verstappen",
  "position": 1,
  "points": 25,
  "fastest_lap": true,
  "dnf": false,
  "dsq": false,
  "dns": false,
  "dnq": false
}
```

### Estrategia (Strategy)
```json
{
  "driver": "Max Verstappen",
  "final_position": 1,
  "stops": 1,
  "compounds": ["SOFT", "HARD"],  // SOFT, MEDIUM, HARD, INTER, WET
  "total_pit_time": 22.5
}
```

---

## 🛠️ Solución de Problemas

### ❌ "MIAMI no encontrada"
- Verifica que la carrera esté creada en la BD
- Ve a admin → "Nueva Carrera" si no existe

### ❌ "Piloto no encontrado"
- Asegúrate de escribir correctamente el nombre
- Usa exactamente como aparece en la BD

### ❌ "JSON inválido"
- Valida el JSON en [jsonlint.com](https://jsonlint.com)
- Verifica que los nombres de drivers coincidan

---

## 💡 Tips de Productividad

### Para cargar todo rápido:
1. **Descarga el template JSON** desde el admin
2. **Copia-pega tus datos** en el JSON
3. **Cárgalo en el admin** para verificar
4. **Guarda en lote** con un click

### Para múltiples carreras:
1. Usa el **script de terminal**
2. Prepara **un JSON por carrera**
3. **Automatiza** con `for` loop:
   ```bash
   for file in *.json; do
     node import-miami-data.js "$file"
   done
   ```

---

## 📞 Soporte

Si tienes problemas:
1. Revisa los **logs de la consola** (F12 en el navegador)
2. Verifica que **MIAMI esté en la BD**
3. Confirma que los **pilotos existan**
4. Valida que el **JSON sea válido**

¡Éxito! 🚀
