/**
 * Escena del hogar completa para una pantalla (feature 006): el bloque de estado e imagen (T875/T876) con, debajo, el aviso y el consentimiento (T877) y la foto
 * del hogar (T878). Las pantallas solo montan `HomeScene` con su ámbito (el hogar o el propietario sin hogar, D6-04 = A, D6-09 = A).
 *
 * @implements REQ-ESC6-019, D6-04, D6-09
 */
import type { SceneScope } from '../scene-api.ts';
import { SceneBlock } from './SceneBlock.tsx';
import { HouseholdPhoto } from './HouseholdPhoto.tsx';
import { SceneConsent } from './SceneConsent.tsx';

/** `headingLevel` es el del bloque: 2 en «Mis mascotas»; 4 dentro de la tarjeta del hogar, que ya tiene su h3 (H-S1). Los paneles van un nivel por debajo. */
export function HomeScene({ scope, idPrefix, headingLevel = 2 }: { readonly scope: SceneScope; readonly idPrefix: string; readonly headingLevel?: 2 | 4 }): JSX.Element {
  const panelLevel = headingLevel === 2 ? 3 : 5;
  return (
    <SceneBlock scope={scope} idPrefix={idPrefix} headingLevel={headingLevel}>
      {(view, reload) =>
        view === null ? null : (
          <>
            <SceneConsent idPrefix={idPrefix} view={view} reload={reload} headingLevel={panelLevel} />
            {scope.kind === 'HOUSEHOLD' ? <HouseholdPhoto householdId={scope.householdId} idPrefix={idPrefix} canUpload={view.actions.canUploadHouseholdPhoto} reload={reload} headingLevel={panelLevel} /> : null}
          </>
        )
      }
    </SceneBlock>
  );
}
