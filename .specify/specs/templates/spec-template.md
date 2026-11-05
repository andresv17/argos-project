---
document_id: SPEC-TEMPLATE
version: 1.0.0
status: DRAFT | REVIEW | APPROVED | LOCKED | DEPRECATED
feature: [nombre-feature]
---

# Especificación Funcional: [Nombre de la Feature]

## 1. Contexto y Alcance (What & Why)
Descripción concisa y sin ambigüedad del problema que resuelve el módulo y sus fronteras.

## 2. Requisitos Funcionales (`REQ-XXX`)
| ID | Nombre | Descripción Determinista | Entradas | Salidas Esperadas |
| :--- | :--- | :--- | :--- | :--- |
| `REQ-001` | ... | ... | ... | ... |

## 3. Invariantes de Dominio (`INV-XXX`)
| ID | Regla Invariante | Condición Formal | Error Disparado |
| :--- | :--- | :--- | :--- |
| `INV-001` | ... | ... | `ERR-XXX` |

## 4. Máquinas de Estado y Flujos (`STATE-XXX`)
Definición de estados finitos, eventos de transición, guardas deterministas y estados terminales.

## 5. Catálogo de Casos de Borde y Errores (`ERR-XXX`)
| Código de Error | Tipo / HTTP Status | Causa Exacta | Comportamiento de Recuperación / Rollback |
| :--- | :--- | :--- | :--- |
| `ERR-001` | ... | ... | ... |
