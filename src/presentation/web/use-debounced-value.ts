/**
 * Valor con retardo de 300 ms para la búsqueda del directorio (T288, REQ-UI2-002): la petición a la API sale cuando la
 * persona deja de escribir. Es el único uso de temporizador de las pantallas del directorio; no hace sondeo.
 *
 * @implements REQ-UI2-002
 */
import { useEffect, useState } from 'react';

export const SEARCH_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
