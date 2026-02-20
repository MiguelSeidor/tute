export const FRASES_RANDOM = [
  "De ningún cobarde se escribe ná",
  "Hasta el rabo todo es toro",
  "Quien más chifle, capador",
  "A cojones vistos, macho seguro",
  "El culo por un zarzal",
  "Arriero somos",
  "La habéis pillao gorda",
  "Achiquemán",
  "De rey parriba",
  "Llevo un juegazo",
  "Hasta el más tonto hace relojes",
  "Muy mal se tié que dar",
  "Esto es remar pa morir en la orilla",
  "No te echa ni un manguito",
];

export const FRASE_RIVAL_CANTE = "No.. si tos cantaremos";

/** All phrases a player is allowed to send via bocadillo */
export const FRASES_PERMITIDAS: ReadonlySet<string> = new Set([
  "Tengo salida",
  ...FRASES_RANDOM,
]);
