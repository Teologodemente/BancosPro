# 🏦 BANCOS STARK Pro

> **PWA profesional para el seguimiento de retiros de efectivo, cheques y pagos con tarjeta.**
> Rápida, offline y diseñada para usarse en iPhone.

![PWA](https://img.shields.io/badge/PWA-Offline_ready-00d4ff) ![Vanilla JS](https://img.shields.io/badge/JavaScript-Vanilla-f7df1e) ![Sin dependencias](https://img.shields.io/badge/Sin%20dependencias-0%20npm-22c55e)

---

## 📖 Descripción

**BANCOS STARK Pro** es una aplicación web progresiva (PWA) pensada para equipos que manejan
retiros de efectivo en varios bancos y necesitan control total del día en una sola pantalla:
cuánto falta por retirar, con qué método se hizo (efectivo, cheque o tarjeta), en qué banco y
a qué hora cierra. Todo con estética "hologram / Iron Man" y asistente tipo **JARVIS** que
reporta el estado de la operación.

La app funciona **100% offline** (service worker con caché), se instala en el home screen del
iPhone y se sincroniza sola cuando hay cambios.

---

## ✨ Características

### 📊 Panel de control
- Resumen general: total a retirar, total retirado y saldo pendiente.
- Tarjetas de estado por banco: **Pendiente** (rojo), **Parcial** (naranja), **Completado** (verde).
- Barra de progreso y temporizador de cierre de cada banco.
- Mensajes de asistente **JARVIS** con frases dinámicas según el estado del día.

### 💰 Registro de retiros (flujo rápido)
- **Efectivo**: se registra en un toque y aparece como concepto editable en la lista.
- **Cheques**: número, nombre del cliente, alias/sucursal y notas — todo en línea, sin modales extra.
- **Tarjetas**: marca (Visa / Mastercard / Amex / Otra) + últimos 4 dígitos, con notas opcionales.
- Montos rápidos predefinidos (500, 1k, 2k, 5k, 10k).

### ✏️ Edición completa
- Modal de edición idéntico al de registro: **cada dato en su propia casilla** —
  número de cheque, monto, nombre/cliente, alias/sucursal y notas.
- Aplica a cheques, efectivo y tarjetas; el total retirado se recalcula automáticamente.
- Edición de monto total y notas del banco.

### 📅 Historial y archivado
- Al cerrar el día, se archiva el resumen completo por empresa y banco.
- Detalle del día: totales, efectivo, cheques, tarjetas y notas.
- Edición de registros archivados y eliminación del día.

### 📱 Móvil primero
- Diseño optimizado para **iPhone**: safe areas (notch y home indicator), modales con botones
  fijos al pie, altura en `dvh`.
- Arranque súper rápido: splash corto y precarga del service worker.
- Soporte de instalar como app (standalone) vía `manifest.json`.

---

## 🗂️ Estructura

```
bank-tracker-pwa/
├── index.html      # UI, modales y formularios
├── app.js          # Lógica principal (render, retiros, edición, historial)
├── style.css       # Estilos, tema hologram y safe areas de iPhone
├── sw.js           # Service Worker (caché offline + versionado)
├── manifest.json   # Manifest PWA (nombre, iconos, colores)
├── icon-192x192.png
├── icon-512x512.png
└── .nojekyll       # Para GitHub Pages
```

---

## 🚀 Uso

### Opción 1 — GitHub Pages (recomendada)
1. Hazle **fork** a este repositorio.
2. En *Settings → Pages*, selecciona la rama `main` y guarda.
3. Abre la URL `https://<tu-usuario>.github.io/<repo>/` desde el iPhone.
4. Compartir → **Agregar a pantalla de inicio** para instalarla como app.

### Opción 2 — Local
```bash
# Servir con cualquier servidor estático, por ejemplo:
python3 -m http.server 8080
# o
npx serve .
```
Abre `http://localhost:8080` en el navegador.

> 💡 **Sin builds ni dependencias**: es HTML + CSS + JavaScript puro. No hay `npm install`.

---

## 🧰 Tecnologías

| Capa | Tecnología |
|------|------------|
| Estructura | HTML5 semántico |
| Estilos | CSS3 (custom properties, flexbox, `env(safe-area-inset-*)`, `dvh`) |
| Lógica | JavaScript ES6+ vanilla |
| Persistencia | `localStorage` (bancos + archivo por día) |
| Offline | Service Worker con `CACHE_NAME` versionado |
| Instalable | Web App Manifest |

---

## 🗃️ Claves de almacenamiento

- `banktracker_banks` — bancos y retiros del día en curso.
- `banktracker_day_YYYY-MM-DD` — archivo histórico por día.

---

## 📝 Rutas a futuro

- [ ] Exportar el resumen del día a CSV / PDF.
- [ ] Sincronización multi-dispositivo.
- [ ] Modo oscuro / claro conmutable.
- [ ] Notificaciones de cierre de banco.

---

## 📄 Licencia

Uso interno. © BANCOS STARK Pro.
