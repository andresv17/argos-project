---
document_id: SPEC-ARGOS-001
version: 1.0.0
status: APPROVED
feature: pet-health-tracker
contracts_ref:
  - contracts/schemas/pet.schema.json
  - contracts/schemas/medical-records.schema.json
  - contracts/schemas/backup-envelope.schema.json
  - contracts/openapi/pet-tracker-api.openapi.yaml
  - contracts/state-machines/sanitary-alert.machine.json
  - contracts/errors/error-catalog.json
---

# Especificación Funcional: Argos Pet Health & Biometric Tracker

## 1. Contexto y Alcance (What & Why)
Plataforma web local para la gestión clínica, biométrica y sanitaria de **exactamente hasta 4 mascotas (máximo 2 perros y 2 gatos)**. El sistema elimina la mezcla de historiales clínicos mediante vistas aisladas por perfil, calcula automáticamente la edad y el estado de vigencia de vacunas/desparasitaciones mediante reglas deterministas e inyección de reloj (`ClockPort`), y permite respaldar/restaurar la totalidad de la base de datos de forma atómica en JSON.

## 2. Requisitos Funcionales (`REQ-XXX`)

### 2.1 Dominio de Perfiles de Mascotas (`REQ-PET`)
| ID | Nombre | Descripción Determinista | Entradas | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-PET-001` | Registro y Edición de Perfil | Crea o actualiza una mascota con `name` (1-50 chars), `species` (`DOG` \| `CAT`), `breed` (1-60 chars), `birthDate` (`YYYY-MM-DD`), `sex` (`MALE` \| `FEMALE`) y `avatarUrl` opcional. | `CreatePetInput` / `UpdatePetInput`, `ClockPort`, `IdGeneratorPort` | `PetProfile` validado contra `pet.schema.json` |
| `REQ-PET-002` | Cálculo Determinista de Edad | Calcula la edad exacta en `{ years: integer, months: integer, totalDays: integer }` comparando `birthDate` contra `ClockPort.todayIsoDate()`. | `birthDate`, `currentDate` | Objeto `ComputedAge` sin efectos secundarios |
| `REQ-PET-003` | Ficha Técnica Individual (Dashboard) | Recupera el perfil de una mascota específica junto con sus 6 colecciones históricas ordenadas y el resumen de alertas sanitarias activas, aislando 100% los datos del resto de mascotas. | `petId`, `ClockPort` | `PetDashboardView` |

### 2.2 Dominio de Módulos de Registro Histórico (`REQ-REC`)
| ID | Nombre | Descripción Determinista | Campos Obligatorios y Rangos | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-REC-001` | Control de Peso | Registra una medición de peso en kilogramos asociada a `petId` y devuelve la serie de evolución cronológica y diferencial (`deltaKg` respecto a la medición inmediata anterior). | `recordedAt` (`YYYY-MM-DD`), `weightKg` (`0.05` a `150.00`, máx. 2 decimales), `notes` opcional (`<= 1000` chars) | `WeightRecord` |
| `REQ-REC-002` | Medidas Corporales | Registra las 4 dimensiones morfométricas en centímetros (`cm`) asociadas a `petId`. | `recordedAt`, `neckCm`, `chestCm`, `backLengthCm`, `waistCm` (cada uno entre `1.00` y `250.00` cm, máx. 2 decimales), `notes` opcional | `BodyMeasurementRecord` |
| `REQ-REC-003` | Vacunación | Registra una dosis de vacuna aplicada y su fecha de próximo refuerzo, calculando su estado de alerta sanitaria (`STATE-ALERT-001`). | `appliedAt` (`YYYY-MM-DD`), `vaccineName` (1-100 chars), `nextBoosterAt` (`YYYY-MM-DD`), `batchOrClinic` opcional (`<= 120` chars), `notes` opcional | `VaccinationRecord` con `alertStatus` |
| `REQ-REC-004` | Desparasitación | Registra una aplicación antiparasitaria interna o externa y su próxima dosis sugerida, calculando su estado de alerta sanitaria (`STATE-ALERT-001`). | `appliedAt` (`YYYY-MM-DD`), `productBrand` (1-100 chars), `dewormingType` (`INTERNAL` \| `EXTERNAL`), `nextSuggestedDoseAt` (`YYYY-MM-DD`), `notes` opcional | `DewormingRecord` con `alertStatus` |
| `REQ-REC-005` | Citas y Controles Médicos | Registra una consulta veterinaria completa con diagnóstico y tratamiento prescrito. | `visitDate` (`YYYY-MM-DD`), `reason` (1-200 chars), `diagnosis` (1-500 chars), `treatment` (1-500 chars), `clinicOrVet` (1-120 chars), `observations` opcional (`<= 1000` chars) | `MedicalVisitRecord` |
| `REQ-REC-006` | Parámetros Adicionales | Registra eventos libres categorizados (cambios de dieta, alergias, cirugías, comportamiento u otros). | `recordedAt` (`YYYY-MM-DD`), `category` (`DIET_CHANGE` \| `ALLERGY` \| `SURGERY` \| `BEHAVIOR` \| `OTHER`), `title` (1-120 chars), `description` (1-1000 chars), `notes` opcional | `CustomParameterRecord` |

### 2.3 Dominio de Interfaz y Experiencia de Usuario (`REQ-UI`)
| ID | Nombre | Descripción Determinista | Regla de Verificación |
| :--- | :--- | :--- | :--- |
| `REQ-UI-001` | Selector Rápido de Mascota | Barra superior/lateral con tarjetas de selección rápida para las hasta 4 mascotas registradas, mostrando especie, nombre, edad calculada y contador de alertas activas (`OVERDUE` / `DUE_SOON`). | Navegación accesible por teclado (`role="tablist"` / `aria-selected`) sin recarga de página. |
| `REQ-UI-002` | Vistas Históricas y Evolución de Peso | Pestañas por módulo dentro de la ficha de la mascota seleccionada, incluyendo gráfica SVG/Canvas determinista o tabla de evolución de peso con variación porcentual/absoluta. | Renderizado aislado exclusivamente para el `activePetId`. |
| `REQ-UI-003` | Semáforo Visual de Alertas Sanitarias | Insignias visuales en Vacunación, Desparasitación y cabecera de mascota: Rojo (`OVERDUE`), Ámbar (`DUE_SOON`), Verde (`UP_TO_DATE`), incluyendo días restantes o días de retraso. | Mapeo 1:1 con `STATE-ALERT-001`. |
| `REQ-UI-004` | Diseño Responsivo y Accesible | Layout adaptable a viewports móviles (`>= 320px`) y escritorio (`>= 1024px`) cumpliendo WCAG 2.1 AA. | Cero violaciones críticas/serias en `@axe-core/playwright`. |

### 2.4 Dominio de Respaldo y Restauración (`REQ-BACKUP`)
| ID | Nombre | Descripción Determinista | Entradas | Salida Esperada |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-BACKUP-001` | Exportación Determinista JSON | Serializa todas las mascotas y sus 6 colecciones históricas en un sobre JSON versión `1.0.0` validado contra `backup-envelope.schema.json`. | Estado actual del repositorio, `ClockPort` | Archivo/String JSON válido con `schemaVersion: "1.0.0"` |
| `REQ-BACKUP-002` | Importación Atómica con Rollback | Valida el JSON entrante contra `backup-envelope.schema.json` y verifica todas las invariantes (`INV-PET-*`, `INV-REC-*`, `INV-BACKUP-001`). Si es 100% válido, reemplaza el estado de forma atómica; ante cualquier fallo, conserva intacto el estado previo. | Payload JSON crudo, `ClockPort` | `ImportResult` o error `ERR-BACKUP-*` con rollback garantizado |

## 3. Invariantes de Dominio (`INV-XXX`)

| ID | Regla Invariante | Condición Formal | Error Disparado |
| :--- | :--- | :--- | :--- |
| `INV-PET-001` | Cupo Máximo y Distribución por Especie | `totalPets <= 4` AND `count(species == 'DOG') <= 2` AND `count(species == 'CAT') <= 2`. | `ERR-PET-QUOTA-EXCEEDED` |
| `INV-PET-002` | Fecha de Nacimiento No Futura | `birthDate <= ClockPort.todayIsoDate()`. | `ERR-PET-FUTURE-BIRTHDATE` |
| `INV-PET-003` | Integridad de Identidad de Mascota | Todo registro histórico (`REQ-REC-001`..`006`) debe referenciar un `petId` existente en el repositorio. | `ERR-PET-NOT-FOUND` |
| `INV-PET-004` | Inmutabilidad de Especie con Historial o Cupo | Al editar una mascota, no se permite cambiar `species` si el cambio excede el cupo de 2 para la especie destino. | `ERR-PET-QUOTA-EXCEEDED` |
| `INV-REC-001` | Ventana Temporal de Eventos Históricos | Para todo evento ocurrido (`recordedAt`, `appliedAt`, `visitDate`): `pet.birthDate <= eventDate <= ClockPort.todayIsoDate()`. | `ERR-REC-DATE-BEFORE-BIRTH` o `ERR-REC-FUTURE-EVENT-DATE` |
| `INV-REC-002` | Rango Biométrico de Peso | `0.05 <= weightKg <= 150.00` y precisión máxima de 2 decimales. | `ERR-REC-WEIGHT-OUT-OF-RANGE` |
| `INV-REC-003` | Rango Biométrico de Medidas Corporales | Cada dimensión (`neckCm`, `chestCm`, `backLengthCm`, `waistCm`) debe cumplir `1.00 <= valor <= 250.00` cm. | `ERR-REC-MEASUREMENT-OUT-OF-RANGE` |
| `INV-REC-004` | Coherencia Temporal de Refuerzo de Vacuna | `nextBoosterAt > appliedAt` (comparación estricta lexicográfica ISO-8601 `YYYY-MM-DD`). | `ERR-REC-INVALID-BOOSTER-DATE` |
| `INV-REC-005` | Coherencia Temporal de Próxima Desparasitación | `nextSuggestedDoseAt > appliedAt` (comparación estricta ISO-8601 `YYYY-MM-DD`). | `ERR-REC-INVALID-NEXT-DOSE-DATE` |
| `INV-REC-006` | Campos de Texto No Vacíos (Trimmed) | Todo string obligatorio (`name`, `breed`, `vaccineName`, `productBrand`, `reason`, `diagnosis`, `treatment`, `clinicOrVet`, `title`, `description`) debe tener ` valor.trim().length >= 1`. | `ERR-SCHEMA-VALIDATION-FAILED` |
| `INV-SORT-001` | Ordenamiento Cronológico Determinista | Todo historial se devuelve ordenado por fecha de evento (`recordedAt`/`appliedAt`/`visitDate`) `DESC`, desempatando por `createdAt` `DESC` y finalmente por `id` `ASC`. | N/A (Verificado por propiedad en `tests/property/`) |
| `INV-BACKUP-001` | Atomicidad e Integridad Referencial de Backup | Un backup importado no puede contener IDs duplicados, ni registros cuyo `petId` no exista dentro del arreglo `pets` del mismo sobre JSON, ni violar `INV-PET-001`..`004` o `INV-REC-001`..`006`. | `ERR-BACKUP-REFERENTIAL-INTEGRITY` / `ERR-BACKUP-ATOMIC-ROLLBACK` |

## 4. Máquinas de Estado y Flujos (`STATE-XXX`)

1. **`STATE-ALERT-001` (Evaluación de Alerta Sanitaria para Vacunas y Desparasitaciones):**
   - Definida formalmente en `contracts/state-machines/sanitary-alert.machine.json`.
   - Sea `daysRemaining = diffInCalendarDays(targetDate, ClockPort.todayIsoDate())`:
     - Si `daysRemaining < 0` -> Estado **`OVERDUE`** (Vencida).
     - Si `0 <= daysRemaining <= 15` -> Estado **`DUE_SOON`** (Próxima a vencer).
     - Si `daysRemaining > 15` -> Estado **`UP_TO_DATE`** (Al día).
   - Si existe un registro posterior de la misma vacuna (`vaccineName` normalizado en minúsculas) o del mismo tipo de desparasitación (`dewormingType`) para la misma mascota, el registro anterior pasa al estado **`SUPERSEDED`** (Histórico reemplazado) para no generar falsas alertas vencidas.
2. **`STATE-BACKUP-001` (Transacción de Importación de Backup):**
   - Estados: `IDLE` -> `PARSING_JSON` -> `VALIDATING_SCHEMA` -> `CHECKING_DOMAIN_INVARIANTS` -> `COMMITTING_SNAPSHOT` -> `COMPLETED` | `ROLLED_BACK`.
   - Cualquier transición de error desde `PARSING_JSON`, `VALIDATING_SCHEMA` o `CHECKING_DOMAIN_INVARIANTS` transita obligatoriamente a `ROLLED_BACK` restaurando el snapshot previo intacto.
3. **`STATE-PET-QUOTA-001` (Estado del Cupo de Mascotas):**
   - Estados: `EMPTY` (0 mascotas) -> `PARTIAL` (1 a 3 mascotas, con `< 2` perros o `< 2` gatos) -> `FULL_QUOTA` (2 perros y 2 gatos registrados; creación bloqueada en dominio e interfaz).

## 5. Catálogo de Casos de Borde y Errores (`ERR-XXX`)
Todos los códigos de error están formalizados en `contracts/errors/error-catalog.json`:
- `ERR-SCHEMA-VALIDATION-FAILED` (422): Violación de formato, tipos, longitudes o `additionalProperties: false`.
- `ERR-PET-QUOTA-EXCEEDED` (409): Intento de registrar más de 4 mascotas en total, más de 2 perros (`DOG`) o más de 2 gatos (`CAT`).
- `ERR-PET-NOT-FOUND` (404): Operación solicitada para un `petId` inexistente.
- `ERR-PET-FUTURE-BIRTHDATE` (422): `birthDate` posterior a `ClockPort.todayIsoDate()`.
- `ERR-REC-DATE-BEFORE-BIRTH` (422): Fecha de registro clínico anterior al `birthDate` de la mascota.
- `ERR-REC-FUTURE-EVENT-DATE` (422): Fecha de aplicación/consulta/medición posterior a `ClockPort.todayIsoDate()`.
- `ERR-REC-WEIGHT-OUT-OF-RANGE` (422): Peso fuera del intervalo `[0.05, 150.00]` kg.
- `ERR-REC-MEASUREMENT-OUT-OF-RANGE` (422): Medida corporal fuera del intervalo `[1.00, 250.00]` cm.
- `ERR-REC-INVALID-BOOSTER-DATE` (422): `nextBoosterAt <= appliedAt` en vacunación.
- `ERR-REC-INVALID-NEXT-DOSE-DATE` (422): `nextSuggestedDoseAt <= appliedAt` en desparasitación.
- `ERR-BACKUP-MALFORMED-JSON` (400): El archivo importado no es JSON sintácticamente válido.
- `ERR-BACKUP-VERSION-UNSUPPORTED` (422): `schemaVersion` distinto de `"1.0.0"`.
- `ERR-BACKUP-SCHEMA-INVALID` (422): El JSON incumple `contracts/schemas/backup-envelope.schema.json`.
- `ERR-BACKUP-REFERENTIAL-INTEGRITY` (409): Registros con `petId` huérfano o IDs duplicados dentro del backup.
