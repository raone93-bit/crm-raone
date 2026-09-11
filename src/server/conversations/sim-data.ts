// Dados do simulador — módulo comum (sem "use server") para poder exportar
// constantes e tipos, importado tanto pela action quanto pela UI.

export type SimulateState = { error?: string; result?: string };

export const SIM_TIPS = [
  "Olá, vocês têm Taj Mahal 3 cm?",
  "Hi, I'm looking for 100 sqm of Taj Mahal quartzite, 3 cm polished, for a project in Miami.",
  "Hola, ¿cuál es el precio por m² del Super White?",
  "Linda pedra!",
  "Do you ship to Miami?",
];
