/**
 * Transferencia de propiedad legal de una mascota (REQ-OWN-001, SC-016) y de un hogar (REQ-HOUSE2-002).
 * La mascota se transfiere a un miembro ACTIVE de un hogar donde esté asignada; la autorización la decide la API
 * (la UI solo ofrece el control cuando `permissions.transferPetOwnership` o `isHouseholdOwner` lo permiten).
 *
 * @implements REQ-OWN-001, SC-016, REQ-HOUSE2-002, INV-HOUSE2-001, REQ-UI-005
 */
import { useEffect, useState } from 'react';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { guardPetsRevocation } from '../pets-link-notice.ts';
import { useSession } from '../session.tsx';
import { createShareApi, type ShareApi } from '../share-api.ts';
import { plural, type HouseholdView } from '../view-model.ts';
import { Button, FormError, SelectField } from './Field.tsx';
import { PetsRevocationConfirm } from './PetsRevocationConfirm.tsx';

const messageOf = (error: unknown): string => problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));

export interface TransferCandidate {
  readonly userId: string;
  readonly label: string;
}

/** Miembros ACTIVE de los hogares donde está la mascota, sin el dueño actual y sin repetidos. */
export function petTransferCandidates(households: readonly HouseholdView[], assignedHouseholdIds: ReadonlySet<string>, ownerUserId: string): TransferCandidate[] {
  const seen = new Set<string>();
  const out: TransferCandidate[] = [];
  for (const view of households) {
    if (!assignedHouseholdIds.has(view.household.id)) continue;
    for (const { membership } of view.members) {
      if (membership.status !== 'ACTIVE' || membership.userId === ownerUserId || seen.has(membership.userId)) continue;
      seen.add(membership.userId);
      out.push({ userId: membership.userId, label: `${membership.displayName} (@${membership.username})` });
    }
  }
  return out;
}

/** Texto del resultado de la transferencia; pluraliza las asignaciones podadas. */
export function petTransferNotice(petName: string, prunedCount: number): string {
  const base = `Propiedad de ${petName} transferida.`;
  return prunedCount === 0 ? base : `${base} Se retiró ${plural(prunedCount, 'asignación', 'asignaciones')} a hogares donde el nuevo dueño no es miembro.`;
}

export function PetTransferPanel({ petId, petName, ownerUserId, onTransferred, onCancel, shareApi }: {
  readonly petId: string;
  readonly petName: string;
  readonly ownerUserId: string;
  readonly onTransferred: (notice: string) => Promise<void>;
  readonly onCancel: () => void;
  /** Cliente de enlaces para el aviso previo de revocación (annex §5.1 fila 2); por defecto el de la sesión. */
  readonly shareApi?: ShareApi;
}): JSX.Element {
  const { api } = useSession();
  const [candidates, setCandidates] = useState<readonly TransferCandidate[] | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Transferir la mascota hace perder al creador sus enlaces `PETS` (annex §5.1 fila 2, D-1): con enlaces activos se pide confirmación antes. */
  const [petsNotice, setPetsNotice] = useState<{ readonly proceed: () => void } | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([unwrap(api.GET('/households')), unwrap(api.GET('/pets/{petId}/assignments', { params: { path: { petId } } }))])
      .then(([list, assignments]) => {
        if (alive) setCandidates(petTransferCandidates(list, new Set(assignments.map((a) => a.householdId)), ownerUserId));
      })
      .catch((e: unknown) => {
        if (alive) setError(messageOf(e));
      });
    return () => {
      alive = false;
    };
  }, [api, petId, ownerUserId]);

  const confirm = async (): Promise<void> => {
    if (target === '') {
      setError('Elige a quién transferir la propiedad.');
      return;
    }
    void guardPetsRevocation(async () => (await (shareApi ?? createShareApi()).listPetPets(petId)).items, () => void transfer(), (proceed) => setPetsNotice({ proceed }));
  };

  const transfer = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await unwrap(api.POST('/pets/{petId}/ownership-transfer', { params: { ...CSRF_PARAMS, path: { petId } }, body: { targetUserId: target } }));
      await onTransferred(petTransferNotice(petName, result.prunedAssignments.length));
    } catch (e) {
      setError(messageOf(e));
      setBusy(false);
    }
  };

  return (
    <section role="alertdialog" aria-labelledby={`transfer-pet-${petId}`} className="grid gap-3 rounded-2xl border-2 border-slate-400 bg-white p-4">
      <h3 id={`transfer-pet-${petId}`} className="text-base font-semibold">
        Transferir la propiedad de {petName}
      </h3>
      {candidates !== null && candidates.length === 0 ? (
        <p className="text-sm text-slate-800">Asigna la mascota a un hogar con otros miembros activos para poder transferirla.</p>
      ) : (
        <>
          <p className="text-sm text-slate-800">La transferencia es inmediata y pierdes la propiedad legal de la mascota.</p>
          <SelectField
            id={`transfer-pet-${petId}-target`}
            label="Nuevo propietario"
            name="targetUserId"
            value={target}
            options={[{ value: '', label: 'Elige un miembro' }, ...(candidates ?? []).map((c) => ({ value: c.userId, label: c.label }))]}
            onChange={(_, value) => setTarget(value)}
            errors={{}}
          />
        </>
      )}
      <FormError message={error} />
      {petsNotice === null ? null : (
        <PetsRevocationConfirm
          id={`transfer-pet-${petId}-pets`}
          confirmLabel="Transferir igualmente"
          onConfirm={() => {
            const { proceed } = petsNotice;
            setPetsNotice(null);
            proceed();
          }}
          onCancel={() => setPetsNotice(null)}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {petsNotice !== null || (candidates !== null && candidates.length === 0) ? null : (
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            Confirmar transferencia
          </Button>
        )}
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </section>
  );
}
