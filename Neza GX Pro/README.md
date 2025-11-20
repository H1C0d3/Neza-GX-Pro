# Neza Browser# Neza Browser



Un navegador web moderno construido con Electron y tecnologías web, diseñado para ofrecer una experiencia de navegación rápida, segura y personalizable con funcionalidades avanzadas.Neza is a modern web browser built with Electron and React, featuring a sleek dark theme interface and innovative web navigation capabilities.



## 🚀 Características Principales## Features



### 🌐 Navegación Avanzada- **Modern Dark Theme UI**: Beautiful, clean interface optimized for comfortable browsing

- Sistema de pestañas completo con soporte para múltiples sitios web- **Efficient Web Navigation**: Fast and reliable browsing experience with webview support

- **Ventanas independientes**: Nueva Ventana y Neza Stealth Mode en ventanas separadas- **Integrated Search**: Powerful search functionality with smart URL detection

- Barra de direcciones inteligente con detección automática de URLs- **Quick Actions**: Fast access to Favorites, BitNote, Apps, and Weather

- Navegación fluida con botones Atrás, Adelante y Actualizar- **Custom Window Controls**: macOS-style colored buttons (minimize, maximize, close)

- Soporte completo para páginas web modernas- **Brand Integration**: Official Neza logos and color scheme throughout the interface

- Diseño responsive optimizado para múltiples resoluciones- **Multi-tab Support**: Full tabbed browsing experience

- **Responsive Design**: Optimized for different screen sizes

### 🔍 Búsqueda Inteligente

- Integración con múltiples motores de búsqueda## Technology Stack

- Búsqueda directa desde la página de inicio

- Detección automática de consultas vs URLs- **Electron**: Cross-platform desktop application framework

- Sugerencias de búsqueda en tiempo real- **React**: Modern JavaScript library for building user interfaces

- **CSS3**: Advanced styling with modern features

### ⭐ Sistema de Favoritos- **Node.js**: JavaScript runtime for the main process

- Guardar y organizar sitios web favoritos

- Acceso rápido desde la barra de herramientas## Getting Started

- Interfaz intuitiva para gestión de marcadores

### Prerequisites

### 🎵 Control de Música Avanzado

- Detección automática de audio en pestañas- Node.js (version 14 or higher)

- Control de reproducción sin interrumpir la navegación- npm (comes with Node.js)

- Panel de control de música integrado con progreso visual

- Soporte para múltiples fuentes de audio### Installation

- Indicadores visuales de pestañas con audio

1. Clone the repository:

### 🛡️ Modo Stealth Mejorado   ```bash

- **Ventanas independientes** con aislamiento completo   git clone <repository-url>

- Navegación privada avanzada con múltiples capas   cd Neza

- Tres niveles de protección: Básico, Shield y Ghost   ```

- Interfaz especializada para navegación anónima

- Protección avanzada de privacidad y datos2. Install dependencies:

   ```cmd

### 🆘 Sistema de Soporte Integrado   npm install

- **Neza Support Center** con múltiples opciones de ayuda   ```

- Centro de Feedback para reportar problemas y sugerencias

- Contacto directo con soporte técnico3. Start the development server:

- Documentación y comunidad integrada   ```cmd

- Formularios de feedback con validación automática   npm start

   ```

### ⚙️ Configuraciones Avanzadas

- Panel de configuraciones completo y organizado### Building for Production

- Personalización de motor de búsqueda

- Configuraciones de privacidad y seguridad avanzadasTo build the application for distribution:

- Gestión de descargas y comportamiento del navegador

- **Auto-actualizador integrado** con GitHub releases```cmd

npm run build

### 🔄 Sistema de Actualizaciones```

- Auto-actualizador automático usando electron-updater

- Verificación de actualizaciones desde GitHub releases## Project Structure

- Instalación automática de nuevas versiones

- Changelog integrado con historial de versiones```

- Notificaciones de actualización no intrusivasNeza/

├── src/

## 📦 Distribución y Packaging│   ├── components/          # React components

│   │   ├── HomePage.js      # Main landing page

### Construcción para Producción│   │   ├── NavigationBar.js # Browser navigation

```bash│   │   ├── TitleBar.js      # Window title bar

# Instalar dependencias│   │   └── WebView.js       # Web content display

npm install│   ├── electron/            # Electron main process

│   │   └── main.js          # Main application entry

# Construir para todas las plataformas│   ├── styles/              # CSS stylesheets

npm run build│   └── App.js               # Main React application

├── public/                  # Static assets

# Construir solo para Windows└── package.json             # Project configuration

npm run build:win```



# Construir solo para Linux## Development

npm run build:linux

### Available Scripts

# Construir solo para macOS

npm run build:mac- `npm start` - Start development server with hot reload

```- `npm run build` - Build for production

- `npm test` - Run tests

### Publicación de Releases- `npm run electron` - Start Electron app

```bash- `npm run electron-pack` - Package the app

# Publicar nueva versión (automáticamente construye y sube a GitHub)

npm run release### Future Enhancements



# Publicar versión específicaThe Neza Browser is designed to be extensible with many innovative features planned:

npm version patch && npm run release

```- **BitNote Integration**: Built-in note-taking application

- **Weather App**: Integrated weather information

## 🛠️ Tecnologías Utilizadas- **Enhanced Tab Management**: Advanced tab organization

- **Bookmark Sync**: Cross-device bookmark synchronization

- **Framework**: Electron 32.0.0+- **Extensions Support**: Custom extension ecosystem

- **Frontend**: HTML5, CSS3, JavaScript ES6+- **Performance Optimization**: Enhanced browsing speed

- **Auto-updater**: electron-updater con GitHub releases- **Security Features**: Advanced privacy and security tools

- **Builder**: electron-builder para packaging multiplataforma

- **Diseño**: Interfaz moderna con tema oscuro## Contributing

- **Componentes**: Sistema modular y escalable

This project is in active development. More features and improvements will be added continuously.

## 🚀 Instalación y Desarrollo

## License

### Requisitos Previos

- Node.js 16+ [Add your license information here]

- npm 7+

- Git## Contact



### Configuración del Proyecto[Add your contact information here]
```bash
# Clonar el repositorio
git clone https://github.com/hicode/Neza-browser.git
cd Neza-browser

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm start

# O usar el script batch (Windows)
start-Neza.bat
```

### Desarrollo
```bash
# Ejecutar en modo desarrollo con recarga automática
npm run dev

# Construir para pruebas
npm run build:dev
```

## 📁 Estructura del Proyecto

```
Neza-browser/
├── main.js                    # Proceso principal de Electron
├── Neza-app.html             # Aplicación principal (renderer)
├── package.json              # Configuración del proyecto y dependencias
├── electron.config.js        # Configuración de Electron Builder
├── start-Neza.bat           # Script de inicio rápido (Windows)
├── resourse/                # Recursos y assets
│   ├── Neza_Logo_Completo_PNG.png
│   ├── Neza_Icono_PNG.png
│   └── icons/              # Iconos para diferentes plataformas
├── user-data/              # Datos de usuario (cache, configuraciones)
├── public/                 # Archivos públicos estáticos
└── src/                   # Código fuente modular
    ├── components/        # Componentes React (futuro)
    └── electron/         # Configuraciones de Electron
```

## 🔧 Configuración Avanzada

### Variables de Entorno
```bash
# Desarrollo
NODE_ENV=development

# Producción
NODE_ENV=production

# Configuración de GitHub para auto-updater
GH_TOKEN=your_github_token
```

### Configuración de Auto-updater
El sistema de actualizaciones está configurado para usar GitHub releases. Asegúrate de:

1. Configurar `GH_TOKEN` en las variables de entorno
2. Tener releases públicos en el repositorio de GitHub
3. Usar versioning semántico (semver) en package.json

## 🚀 Funcionalidades Avanzadas

### Sistema de Ventanas
- **Ventana Principal**: Navegación estándar con todas las funcionalidades
- **Nueva Ventana**: Ventana independiente para sesiones múltiples
- **Neza Stealth Mode**: Ventana completamente aislada para navegación privada

### Panel de Soporte
- **Centro de Feedback**: Formulario completo para reportar problemas
- **Documentación**: Acceso directo a guías y documentación
- **Comunidad**: Enlaces a Discord, redes sociales y GitHub
- **Soporte Técnico**: Contacto directo con el equipo de Hi Code

### Control de Audio
- Detección inteligente de medios en todas las pestañas
- Control de reproducción global sin interrumpir la navegación
- Indicadores visuales de pestañas con contenido multimedia
- Barra de progreso de reproducción integrada

### Configuraciones Personalizables
- Motor de búsqueda personalizable (Google, Bing, DuckDuckGo, etc.)
- Configuraciones de privacidad avanzadas
- Modo Guardian con protección adicional
- Bloqueador de anuncios y anti-seguimiento integrado
- Configuraciones de descarga y almacenamiento

## 🔒 Seguridad y Privacidad

### 🛡️ Seguridad Mejorada (v2.1.0)
**Neza Browser implementa las mejores prácticas de seguridad de la industria:**

- ✅ **Sandbox Completo**: Aislamiento total de procesos
- ✅ **Context Isolation**: Separación entre contextos web y Node.js
- ✅ **Content Security Policy**: Protección contra XSS y ataques de inyección
- ✅ **Validación de URLs**: Bloqueo de URLs maliciosas y protocolos peligrosos
- ✅ **SSL/TLS Verificación**: Certificados validados (protección MITM)
- ✅ **Same-Origin Policy**: Aislamiento entre sitios web
- ✅ **Sin Node Integration**: Renderer sin acceso directo a Node.js

**Nivel de Seguridad:** 🟢 9/10 (Excelente)

Consulta [SECURITY.md](./SECURITY.md) para detalles completos.

### Neza Stealth Mode
- **Nivel Básico**: Navegación privada estándar + protecciones de seguridad
- **Nivel Shield**: Protección avanzada con bloqueadores + sesión aislada
- **Nivel Ghost**: Máxima protección con aislamiento completo + limpieza automática

### Protecciones Integradas
- Bloqueador de anuncios nativo
- Protección anti-seguimiento
- Modo Guardian para sitios web maliciosos
- Validación automática de URLs
- Sanitización de contenido web
- Limpieza automática al cerrar (opcional)

## 🤝 Contribución

¡Las contribuciones son bienvenidas! Para contribuir:

1. Fork el repositorio
2. Crea una rama para tu feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit tus cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crea un Pull Request

### Reportar Problemas
Usa el **Neza Support Center** integrado en la aplicación o:
- Crea un issue en GitHub
- Usa el Centro de Feedback de la aplicación
- Contacta al soporte técnico directamente

## 📋 Roadmap

### Próximas Versiones
- [ ] Neza Store (sistema de extensiones)
- [ ] Temas personalizados avanzados
- [ ] Sincronización en la nube
- [ ] Modo desarrollador con herramientas DevTools
- [ ] Integración con servicios web populares
- [ ] VPN integrada opcional
- [ ] Sistema de pestañas con grupos
- [ ] Marcadores sincronizados

### En Desarrollo
- [x] Sistema de actualizaciones automáticas
- [x] Neza Support Center integrado
- [x] Ventanas independientes para Stealth Mode
- [x] Panel de control de música avanzado
- [x] Sistema de feedback y soporte

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Consulta el archivo LICENSE para más detalles.

## 🆘 Soporte y Contacto

### Soporte Técnico
- **Email**: support@hicode.tech
- **Web**: https://hicode.tech
- **Horarios**: Lun-Vie 9:00-18:00 (GMT-5)
- **Respuesta promedio**: 2-4 horas

### Comunidad
- **Discord**: Hi Code Community
- **Twitter**: @HiCodeTech
- **GitHub**: github.com/hicode
- **Facebook**: Hi Code

### Centro de Feedback Integrado
Usa el **Neza Support Center** directamente desde la aplicación (F1 o menú) para:
- Reportar bugs y problemas
- Sugerir nuevas funcionalidades
- Obtener ayuda técnica especializada
- Acceder a documentación y recursos

---

## 🆕 Novedades en v2.2.0

### 🔄 Sistema de Actualizaciones Completo

El nuevo sistema de actualizaciones de Neza Browser conecta directamente con GitHub para buscar, descargar e instalar actualizaciones de forma automática.

**Características principales:**
- ✅ Verificación automática desde GitHub Releases
- ✅ Ventana emergente moderna con animaciones y progreso visual
- ✅ Descarga e instalación con un solo clic
- ✅ Comparación inteligente de versiones (semver)
- ✅ Changelog interactivo mostrando novedades
- ✅ Opciones de reinicio: ahora o en el próximo arranque
- ✅ Manejo de errores con opciones de reintento
- ✅ Instalación silenciosa en segundo plano (Windows)

**Estados visuales en tiempo real:**
1. 🔍 **Checking** - Consultando GitHub API
2. ✅ **Up to Date** - Ya tienes la última versión
3. 🎉 **Available** - Nueva versión disponible
4. 📥 **Downloading** - Descargando instalador
5. ⚙️ **Installing** - Ejecutando instalador
6. 🎊 **Ready** - Listo para reiniciar

**Cómo usar:**
1. Ve a **Configuración** > **Sobre Neza**
2. Haz clic en **"🔄 Buscar actualizaciones"**
3. Si hay actualización, haz clic en **"Descargar e instalar"**
4. Espera a que descargue y se instale
5. Elige reiniciar ahora o después

**Documentación completa:**
- 📖 [Sistema de Actualizaciones](./SISTEMA_ACTUALIZACIONES.md) - Funcionamiento técnico detallado
- 📦 [Guía de Releases](./GUIA_CREAR_RELEASE.md) - Cómo crear releases en GitHub para developers

**Repositorio de Releases:**
https://github.com/H1C0d3/Neza-GX-Pro/releases

---

Desarrollado con ❤️ por el equipo de **Hi Code**  
En colaboración con **GEISA**

🚀 *Navegación del futuro, disponible hoy*
