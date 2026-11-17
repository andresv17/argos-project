/**
 * Panel "Hogares de la mascota" (REQ-HOUSE2-003): una casilla por hogar del usuario que asigna o desasigna la mascota.
 * La autorización la decide la API; aquí solo se oculta el control si `permissions.assignPetToHouseholds` es falso.
 *
 * @implements REQ-HOUSE2-003, INV-HOUSE-004, REQ-UI-005, REQ-UI-007
 */
import { useEffect, useState } from 'react';
import { ApiProblem, CSRF_PARAMS, catalogProblem, problemMessage, unwrap } from '../api.ts';
import { useSession } from '../session.tsx';
import type { HouseholdView, Schemas } from '../view-model.ts';
import { FormError } from './Field.tsx';

type Assignment = Schemas['PetAssignment'];

const messageOf = (error: unknown): string => problemMessage(error instanceof ApiProblem ? error.problem : catalogProblem('ERR-INTERNAL-UNEXPECTED'));

export function PetAssignments({ petId }: { readonly petId: string }): JSX.Element {
  const { api } = useSession();
  const [households, setHouseholds] = useState<readonly HouseholdView[]>([]);
  const [assigned, setAssigned] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([unwrap(api.GET('/households')), unwrap(api.GET('/pets/{petId}/assignments', { params: { path: { petId } } }))])
      .then(([list, assignments]: [readonly HouseholdView[], readonly Assignment[]]) => {
        if (!alive) return;
        setHouseholds(list);
        setAssigned(new Set(assignments.map((a) => a.householdId)));
      })
      .catch((e: unknown) => {
        if (alive) setError(messageOf(e));
      });
    return () => {
      alive = false;
    };
  }, [api, petId]);

  const toggle = async (householdId: string, next: boolean): Promise<void> => {
    setPending(householdId);
    setError(null);
    try {
      if (next) {
        await unwrap(api.PUT('/pets/{petId}/assignments/{householdId}', { params: { ...CSRF_PARAMS, path: { petId, householdId } } }));
      } else {
        await unwrap(api.DELETE('/pets/{petId}/assignments/{householdId}', { params: { ...CSRF_PARAMS, path: { petId, householdId } } }));
      }
      setAssigned((current) => {
        const copy = new Set(current);
        if (next) copy.add(householdId);
        else copy.delete(householdId);
        return copy;
      });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <fieldset className="grid gap-2 rounded border border-slate-300 bg-white p-4">
      <legend className="px-1 text-lg font-semibold">Hogares de la mascota</legend>
      <FormError message={error} />
      {households.length === 0 ? <p className="text-slate-700">No perteneces a ningún hogar todavía.</p> : null}
      {households.map((view) => {
        const id = view.household.id;
        const checked = assigned.has(id);
        return (
          <label key={id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              disabled={pending === id}
              onChange={(event) => void toggle(id, event.currentTarget.checked)}
              className="h-4 w-4"
            />
            <span>{view.household.name}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
