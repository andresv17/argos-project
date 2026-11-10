---
document_id: PLAN-TEMPLATE
version: 1.0.0
status: DRAFT | REVIEW | APPROVED | LOCKED
spec_ref: .specify/specs/[feature].md
---

# Plan de Arquitectura Técnica: [Nombre de la Feature]

## 1. Mapeo de Contratos a Capas (`contracts/` -> `src/`)
Tabla de correspondencia entre esquemas formales y módulos de implementación.

## 2. Diseño de Capa de Dominio (`src/domain/`)
Entidades, Value Objects, funciones puras e invariantes implementadas.

## 3. Diseño de Capa de Aplicación (`src/application/`)
Casos de uso, puertos (`Ports`) y orquestación de máquinas de estado.

## 4. Diseño de Infraestructura y Presentación (`src/infrastructure/`, `src/presentation/`)
Adaptadores de persistencia, validación en runtime y árbol de componentes UI.

## 5. Estrategia de Verificación (`tests/`)
Mapeo de suites unitarias, de propiedades (`fast-check`), de contratos y E2E.
