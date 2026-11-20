/**
 * Nombre canónico en inglés de las razas de catálogo para el prompt (INV-ESC6-011, plan.md §5.3): con `breedCode` de catálogo el prompt usa este nombre y IGNORA
 * el texto libre. `DOG_CRIOLLA`, `CAT_CRIOLLA` y `*_OTHER` son mestizas (D6-14) y no tienen nombre. Tabla del dominio: el catálogo generado (`breeds.catalog`) guarda
 * etiquetas en español para la interfaz, no para el proveedor; una prueba exige que toda raza no mestiza tenga su nombre. Pura (INV-ESC6-001).
 *
 * @implements INV-ESC6-011, REQ-ESC6-009, REQ-ESC6-016, INV-ESC6-001
 */

const CANONICAL_BREED_NAMES: Readonly<Record<string, string>> = {
  DOG_AKITA: 'Akita',
  DOG_BASSET_HOUND: 'Basset Hound',
  DOG_BEAGLE: 'Beagle',
  DOG_BICHON_FRISE: 'Bichon Frise',
  DOG_BORDER_COLLIE: 'Border Collie',
  DOG_BOXER: 'Boxer',
  DOG_BULLDOG_FRANCES: 'French Bulldog',
  DOG_BULLDOG_INGLES: 'English Bulldog',
  DOG_CANE_CORSO: 'Cane Corso',
  DOG_CANICHE_POODLE: 'Poodle',
  DOG_CHIHUAHUA: 'Chihuahua',
  DOG_CHOW_CHOW: 'Chow Chow',
  DOG_COCKER_SPANIEL: 'Cocker Spaniel',
  DOG_DALMATA: 'Dalmatian',
  DOG_DOBERMAN: 'Doberman',
  DOG_FOX_TERRIER: 'Fox Terrier',
  DOG_GALGO: 'Greyhound',
  DOG_GOLDEN_RETRIEVER: 'Golden Retriever',
  DOG_GRAN_DANES: 'Great Dane',
  DOG_HUSKY_SIBERIANO: 'Siberian Husky',
  DOG_JACK_RUSSELL_TERRIER: 'Jack Russell Terrier',
  DOG_LABRADOR_RETRIEVER: 'Labrador Retriever',
  DOG_LHASA_APSO: 'Lhasa Apso',
  DOG_MALTES: 'Maltese',
  DOG_MASTIN: 'Mastiff',
  DOG_PASTOR_ALEMAN: 'German Shepherd',
  DOG_PASTOR_AUSTRALIANO: 'Australian Shepherd',
  DOG_PASTOR_BELGA: 'Belgian Shepherd',
  DOG_PINSCHER_MINIATURA: 'Miniature Pinscher',
  DOG_PITBULL: 'American Pit Bull Terrier',
  DOG_POMERANIA: 'Pomeranian',
  DOG_PUG: 'Pug',
  DOG_ROTTWEILER: 'Rottweiler',
  DOG_SALCHICHA_DACHSHUND: 'Dachshund',
  DOG_SAMOYEDO: 'Samoyed',
  DOG_SAN_BERNARDO: 'Saint Bernard',
  DOG_SCHNAUZER: 'Schnauzer',
  DOG_SETTER_IRLANDES: 'Irish Setter',
  DOG_SHAR_PEI: 'Shar Pei',
  DOG_SHIH_TZU: 'Shih Tzu',
  DOG_WEIMARANER: 'Weimaraner',
  DOG_YORKSHIRE_TERRIER: 'Yorkshire Terrier',
  CAT_ABISINIO: 'Abyssinian',
  CAT_ANGORA: 'Turkish Angora',
  CAT_AZUL_RUSO: 'Russian Blue',
  CAT_BENGALI: 'Bengal',
  CAT_BIRMANO: 'Birman',
  CAT_BOSQUE_DE_NORUEGA: 'Norwegian Forest Cat',
  CAT_BRITANICO_DE_PELO_CORTO: 'British Shorthair',
  CAT_BURMES: 'Burmese',
  CAT_CORNISH_REX: 'Cornish Rex',
  CAT_DEVON_REX: 'Devon Rex',
  CAT_EXOTICO_DE_PELO_CORTO: 'Exotic Shorthair',
  CAT_HIMALAYO: 'Himalayan',
  CAT_MAINE_COON: 'Maine Coon',
  CAT_ORIENTAL: 'Oriental Shorthair',
  CAT_PERSA: 'Persian',
  CAT_RAGDOLL: 'Ragdoll',
  CAT_SCOTTISH_FOLD: 'Scottish Fold',
  CAT_SIAMES: 'Siamese',
  CAT_SIBERIANO: 'Siberian',
  CAT_SOMALI: 'Somali',
  CAT_SPHYNX: 'Sphynx',
  CAT_TONQUINES: 'Tonkinese',
};

/** `DOG_CRIOLLA`, `CAT_CRIOLLA` y los `*_OTHER` se representan como mestizo amigable (D6-14). */
export function isMixedBreedCode(code: string | null | undefined): boolean {
  return code === 'DOG_CRIOLLA' || code === 'CAT_CRIOLLA' || (typeof code === 'string' && code.endsWith('_OTHER'));
}

/** Nombre canónico en inglés, o `null` si el código es mestizo, desconocido o nulo. */
export function canonicalBreedName(code: string | null | undefined): string | null {
  if (typeof code !== 'string' || !Object.hasOwn(CANONICAL_BREED_NAMES, code)) return null;
  return CANONICAL_BREED_NAMES[code] ?? null;
}
