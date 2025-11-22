# 🎉 Neza Browser v2.2.0 - Actualización Mayor

## ✨ Nuevas Características

### 🖱️ Middle-Click (Click Central)
- **Abre enlaces en nueva pestaña** con click central del mouse
- Compatible con YouTube y sitios dinámicos
- Detección inteligente hasta 10 niveles de elementos padre

### 📌 Pestañas Fijadas Mejoradas
- Diseño **compacto (50px)** con solo favicon visible
- **No se pueden cerrar** accidentalmente
- Ordenadas automáticamente al inicio
- Captura automática de favicon mediante `page-favicon-updated`

### 🎨 Sidebar Completamente Reconstruida
- **600+ líneas de código legacy eliminadas**
- Diseño limpio y moderno
- Expandible: 60px ↔ 240px
- Toggle desde Ajustes para ocultar/mostrar
- Estado persistente en localStorage
- Animaciones suaves con `transform` (sin `display:none`)

## 🔧 Mejoras

### 🔒 Barra de Direcciones
- `about:blank` **nunca visible** para el usuario
- Protección mientras escribes (no se sobrescribe el texto)
- Focus/blur events optimizados
- `getDomainFromUrl()` filtra correctamente

### 🎯 Interfaz
- Cursor `pointer` en pestañas (antes `move`)
- Transiciones `cubic-bezier` suaves
- Sin conflictos de espaciado

## 🐛 Correcciones

### ✅ Espaciado Extra RESUELTO
- Eliminado **doble margin-left** en:
  - `navigation-bar`
  - `tab-bar` 
  - `content-area`
- Body ajusta correctamente según estado de sidebar
- Sin espacio vacío cuando sidebar oculta

### 🛡️ Pestañas Fijadas
- No se pueden cerrar con el botón X
- Menú contextual muestra "Desfijar" cuando está fijada
- Forzar cierre solo con confirmación

## 📦 Instalación

### Para Nuevos Usuarios
1. Descarga `Neza-GX-Pro-Setup-2.2.0.exe`
2. Ejecuta el instalador
3. ¡Disfruta las mejoras!

### 🔄 Para Usuarios de Versiones Anteriores
La actualización se descargará **automáticamente** la próxima vez que abras Neza Browser.
Solo haz click en "Actualizar" cuando aparezca la notificación.

---

**Full Changelog**: https://github.com/H1C0d3/Neza-GX-Pro/compare/v2.1.0...v2.2.0
