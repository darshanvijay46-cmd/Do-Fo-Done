export const studyEnvironments = [
  { name: 'Rain on Glass', description: 'Soft rain against the window', color: '#91b7c5', soundtrack: 'Rain against glass', asset: null },
  { name: 'Library Hush', description: 'Warm, quiet room tone', color: '#cbb58b', soundtrack: 'Quiet library room tone', asset: null },
  { name: 'Forest Morning', description: 'Open air and gentle wind', color: '#91b99a', soundtrack: 'Forest wind and birds', asset: null },
  { name: 'Night Train', description: 'A low, steady travel rumble', color: '#8582a8', soundtrack: 'Night train ambience', asset: null },
  { name: 'Coffee Shop', description: 'A soft, distant café hum', color: '#d79a77', soundtrack: 'Quiet coffee shop', asset: null },
  { name: 'Open Window', description: 'A light breeze through the room', color: '#b1d4c7', soundtrack: 'Breeze through an open window', asset: null },
  { name: 'Deep Work', description: 'Minimal, low-level noise', color: '#d47b69', soundtrack: 'Neutral brown noise', asset: null },
] as const;

export type StudyEnvironmentName = typeof studyEnvironments[number]['name'];

export function getStudyEnvironment(name: string) {
  return studyEnvironments.find((environment) => environment.name === name) ?? studyEnvironments[0];
}
