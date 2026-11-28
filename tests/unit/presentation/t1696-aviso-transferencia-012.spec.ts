/**
 * T1696 (Feature 012, Bloque E, #81; `/keymaker`; MEDIA-1 de `/oracle`; ENM-005-E 0.2.2 annex §5.1 fila 2 y §9(q), `D-1 = (a)`; decisión de Neo 3: fail-open): transferir la propiedad de la
 * mascota (PetTransferPanel) hace perder los enlaces `PETS` del creador; el aviso previo con confirmación debe cubrir también este flujo. Sin jsdom: lectura de fuente de los puntos de cableado.
 *
 * @implements REQ-VET12-007, D-1, PN-08, EDGE-012-077
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const code = readFileSync('src/presentation/web/components/TransferOwnership.tsx', 'utf8');

describe('MEDIA-1 aviso previo en la transferencia de la mascota', () => {
  it('[§5.1 fila 2] PetTransferPanel reutiliza guardPetsRevocation, listPetPets y PetsRevocationConfirm', () => {
    expect(code).toContain("from '../pets-link-notice.ts'");
    expect(code).toContain('guardPetsRevocation');
    expect(code).toContain('listPetPets');
    expect(code).toContain('PetsRevocationConfirm');
  });

  it('[§5.1] la consulta de enlaces va ANTES del POST ownership-transfer (cambio de titular)', () => {
    const guard = code.indexOf('guardPetsRevocation(');
    const post = code.indexOf("api.POST('/pets/{petId}/ownership-transfer'");
    expect(guard).toBeGreaterThan(-1);
    expect(post).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(post);
  });

  it('[a11y] el aviso se monta solo cuando hay enlaces afectados (estado petsNotice) y no se usa texto propio', () => {
    expect(code).toContain('petsNotice');
    expect(code).not.toMatch(/revoca entero/i);
  });
});
