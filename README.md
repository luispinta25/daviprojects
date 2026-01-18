# ProjectFlow - Gestor de Proyectos Multi-Kanban y Timeline

Esta es una aplicación para gestionar múltiples proyectos utilizando un tablero Kanban y una línea de tiempo (Timeline).

## Tecnologías
- **Frontend**: HTML, CSS, JavaScript (Vanilla).
- **Backend**: Supabase (Auth, Database, Realtime).

## Estructura del Proyecto
- `index.html`: Página principal y estructura de la UI.
- `style.css`: Estilos de la aplicación.
- `src/js/app.js`: Lógica principal de la aplicación.
- `src/js/supabase.js`: Configuración de conexión con Supabase.
- `src/js/kanban.js`: Lógica específica del tablero Kanban.
- `src/js/timeline.js`: Lógica específica de la línea de tiempo.

## Base de Datos (Supabase)
### Tablas sugeridas:
1. **projects**: `id`, `name`, `description`, `owner_id`, `created_at`.
2. **tasks**: `id`, `project_id`, `title`, `description`, `status` (TODO, DOING, DONE), `start_date`, `end_date`, `created_at`.
