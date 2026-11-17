# Backlog — Feature 002 (planificar DESPUÉS de cerrar la 001)

Registrado por Architect el 2026-11-10 por decisión de Neo (Nivel 2). No existe `specs/002-*` todavía y la spec 001 no se modifica. Estos puntos entran por el flujo Spec Kit (`/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks`) con rama propia.

## Hallazgo 2 — Más especies de mascota
- Pedido de Neo: poder registrar más especies que perro y gato.
- Cuestión de fondo: la especie es hoy un enum cerrado `DOG | CAT` en `specs/001-pet-health-tracker/contracts/schemas/pet.schema.json` (`$defs/Species`) y en la spec 001 (REQ-PET-001 y filtros de REQ-UI-001). De ahí se generan validadores y tipos en `src/generated/**`, y la UI lo consume. Además, las reglas clínicas dependen de la especie (curvas de peso ideal, alertas geriátricas +10 años, rangos de peso/medidas, calendarios de vacunas/desparasitación; ver Maggie). Ampliar el enum cambia contrato (versión mayor del esquema), datos existentes/respaldos (`backup-envelope`, migración) y oráculos.
- Preguntas para Neo:
  1. ¿Qué especies exactas (conejo, ave, hurón, reptil, "otra")? ¿Lista cerrada o campo libre "otra: ____"?
  2. ¿Las reglas clínicas (peso ideal, alertas geriátricas, vacunas) aplican igual a las nuevas especies, o solo se guardan los registros sin alertas automáticas?
  3. ¿Se necesita compatibilidad con respaldos de la 001 (que solo traen DOG/CAT)? Se asume que sí.
  4. ¿Razas: lista libre como hoy o catálogo por especie?

## Hallazgo 5 — Funciones de hogares
- Pedido de Neo: más funciones en los hogares (detalle a definir por Neo).
- Cuestión de fondo: el hogar hoy permite solo lo que define la spec 001: crear hogar, invitar por `username`, aceptar/rechazar, retirar miembros, abandonar y eliminar (REQ-HOUSE-001..005, REQ-UI-006/007, STATE-HOUSE-MEMBERSHIP-001, INV-HOUSE-*). Los miembros ven las mascotas de todos los miembros activos y solo editan las propias (INV-ACC-001/002). Cualquier función nueva (roles, edición compartida, co-cuidador con permisos de escritura, transferir propiedad, notificaciones, mascotas compartidas por hogar) toca invariantes de acceso, máquina de estados y superficie de seguridad (Trinity, Rama, Kid).
- Preguntas para Neo:
  1. ¿Qué funciones concretas? (por ejemplo: que un co-cuidador registre peso/vacunas, transferir una mascota, roles de administrador, historial de actividad, notificaciones de alertas al hogar).
  2. ¿Cambia el principio actual de "solo el dueño edita"? Es el punto de mayor impacto en INV-ACC-002.
  3. ¿Qué datos ve cada rol (privacidad de datos familiares, Habeas Data)?
  4. ¿Invitar por usuario sigue siendo suficiente, o también por enlace/correo (esto implicaría dependencias externas de Nivel 2)?

## Hallazgo 7 — Rediseño visual
- Pedido de Neo: rediseño visual de la aplicación.
- Cuestión de fondo: la 001 fija un diseño funcional con Tailwind + React 18, 6 pantallas, accesibilidad WCAG 2.1 AA a 320/1024/1280 px (REQ-UI-004), colorToken por miembro y distinción no solo por color (REQ-UI-007). Un rediseño es de presentación pero afecta pruebas E2E/visuales, axe y, si introduce librerías de UI, fuentes o iconos, la política de dependencias de Nivel 2 (constitución §2).
- Preguntas para Neo:
  1. ¿Objetivo del rediseño: identidad de marca, mejor usabilidad móvil, modo oscuro, o todo lo anterior? ¿Hay referencias o paleta?
  2. ¿Se permite introducir una librería de componentes/iconos/fuentes (dependencia Nivel 2) o se mantiene Tailwind puro?
  3. ¿Se rediseñan solo estilos o también la navegación y estructura de pantallas?
  4. ¿Qué nivel de accesibilidad se mantiene como mínimo (se propone no bajar de WCAG 2.1 AA)?
  5. ¿Se integra con el trabajo de Sati (UX/UI) como responsable de diseño?

## Orden sugerido y dependencias
- Cerrar primero la 001 (bugs 1, 3, 4 validados; hallazgo 6 aprobado y ejecutado si Neo lo decide).
- Hallazgo 2 y 5 modifican contratos y la spec; conviene especificarlos juntos o en orden 2 → 5. El 7 puede ir antes o después porque no cambia contratos, pero conviene hacerlo con las especies nuevas ya presentes en la UI.
- Cada uno requiere `/speckit-specify` propio o una sola feature con historias de usuario priorizadas: decisión de Neo.
