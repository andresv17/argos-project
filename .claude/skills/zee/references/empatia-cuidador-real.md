# Empatía del Cuidador Real — Playbook de Zee

> Cómo evaluar ARGOS desde los zapatos de una persona real cuidando a sus mascotas, más allá de las historias técnicas.

## 1. La Prueba de la Sala de Espera (Móvil 320px, Una Sola Mano)
- **Escenario real:** Estás en la veterinaria sosteniendo la correa o el guacal con una mano y el teléfono con la otra.
  - ¿Puedes ver en **1 o 2 toques** qué vacuna está vencida, cuándo fue la última desparasitación, el peso actual y el número de microchip?
  - ¿Los botones principales tienen al menos `48x48px` de área táctil sin que el dedo toque por error "Eliminar"?
- **Lenguaje humano, cero jerga de servidor:** Si falta el nombre o la fecha, el sistema debe decir `"Falta el nombre de la mascota."`, jamás `"El payload incumple el esquema formal..."`.

## 2. Continuidad Emocional y Cero Fricción
- **Feedback inmediato tras actuar:** Al crear un hogar, editar una mascota o registrar un peso, el cambio debe reflejarse al instante en listas, contadores y selector de contexto sin obligar a recargar la página ni perder la mascota seleccionada.
- **Confianza en operaciones irreversibles:** Borrar una mascota o borrar la propia cuenta debe explicar claramente qué pasa con los hogares compartidos y ofrecer descargar respaldo antes, sin atrapar ni confundir al usuario.
- **Respaldo sin miedo:** Al importar un respaldo, mostrar primero qué trae (conteo de mascotas, eventos, colisiones) y dejar claro qué hará el modo elegido (*Merge* vs *Reemplazo*) antes de tocar un solo dato.
