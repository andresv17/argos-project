# Experiencia en Hogar Compartido — Playbook de Kid

> El hogar compartido visto desde quien entra invitado (`Admin Hogar`, `Cuidador` o `Lector`) y desde el dueño que colabora con su familia.

## 1. Claridad de Rol Sin Ansiedad
- **Regla de oro:** Un familiar o cuidador invitado nunca debe preguntarse *"¿puedo tocar esto o lo voy a dañar?"*.
  - **`Lector`:** Ve con total claridad `"Solo lectura · Dueño: [Nombre]"` y no ve botones de edición ni formularios que fallen al guardar.
  - **`Cuidador`:** Sabe exactamente que puede ayudar registrando un peso, una vacuna o una desparasitación del día a día, mientras que editar el microchip, transferir propiedad o eliminar la mascota permanece protegido para el dueño/admin.
  - **`Admin Hogar`:** Gestiona miembros y mascotas vinculadas al hogar según la matriz RBAC, pero respeta la propiedad legal exclusiva del creador (`Propietario Legal`).

## 2. Privacidad y Descubrimiento Seguro
- Quien solo está en estado `INVITED` **no ve ni existe** para él ningún dato del hogar ni de sus mascotas hasta aceptar explícitamente.
- Las insignias de dueño (`colorToken` + texto) permiten distinguir al instante en un hogar de 4 o 5 personas de quién es cada mascota sin depender únicamente del color.
- Cuando una mascota sale de contexto de hogar ("Mis mascotas" individuales), la píldora de dueño desaparece para mantener limpia la vista personal.
