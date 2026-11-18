/**
 * T723 [REQ-ALB5-002][INV-005-003] dominio `album-limit.ts`: `assertAlbumHasRoom(conteo, tope)` deja pasar solo con hueco (conteo < tope) y rechaza
 * con ERR-MEDIA-ALBUM-LIMIT (409, «Álbum completo») en el tope y por encima (mascotas heredadas de la 004, EDGE-005-01).
 */
import { describe, expect, it } from 'vitest';
import { assertAlbumHasRoom } from '../../src/domain/media/album-limit.ts';

function outcome(count: number, max: number): { code: string; status: number; title: string } | 'OK' {
  try {
    assertAlbumHasRoom(count, max);
    return 'OK';
  } catch (error) {
    const e = error as { code: string; status: number; title: string };
    return { code: e.code, status: e.status, title: e.title };
  }
}

describe('T723 assertAlbumHasRoom (dominio)', () => {
  it('[REQ-ALB5-002] con hueco no lanza: 0 de 10, 9 de 10 y 11 de 12', () => {
    expect([outcome(0, 10), outcome(9, 10), outcome(11, 12)]).toEqual(['OK', 'OK', 'OK']);
  });

  it('[REQ-ALB5-002][INV-005-003] en el tope (10 de 10) rechaza con ERR-MEDIA-ALBUM-LIMIT 409 «Álbum completo»', () => {
    expect(outcome(10, 10)).toEqual({ code: 'ERR-MEDIA-ALBUM-LIMIT', status: 409, title: 'Álbum completo' });
  });

  it('[REQ-ALB5-003][EDGE-005-01] por encima del tope (14 de 10, o 7 de 5 tras bajar el parámetro) también rechaza', () => {
    expect([outcome(14, 10), outcome(7, 5)]).toEqual(Array(2).fill({ code: 'ERR-MEDIA-ALBUM-LIMIT', status: 409, title: 'Álbum completo' }));
  });
});
