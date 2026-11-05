// The two 3D campaigns share one screen (code on the left, the game on the right); this file says
// what differs: missions, chapters, free play, how the screen looks (crosshair or speedometer).

import type { Text2 } from '../i18n';
import { CHAPTERS, FREE_PLAY_SCRIPTS, MISSIONS, matchLevel, type Mission } from '../run/shooter';
import { RACE_CHAPTERS, RACE_MISSIONS, raceFreeLevel, raceFreeScripts } from '../run/racing';
import type { Level3, World3D } from '../run/unity3d';
import { MODEL_CHAPTERS, MODEL_MISSIONS, modelFreeLevel, modelFreeScripts } from '../run/models';
import { useModels, useRacing, useShooter, type CampaignStore } from './shooterProgress';

export interface Campaign {
  id: 'shooter' | 'racing' | 'models';
  missions: Mission[];
  chapters: { n: number; icon: string; title: Text2; about: Text2 }[];
  store: CampaignStore;
  xp: number;
  hud: 'fps' | 'race';
  /** A mission that starts on the soft "suit offline" screen. */
  offlineFirst?: string;
  free: {
    title: Text2;
    about: Text2;
    scripts: () => { file: string; on: string; source: string }[];
    level: (scripts: { source: string; on: string }[]) => Level3;
    goal: Text2;
    check: (w: World3D) => boolean;
    keys: string[];
  };
}

export const SHOOTER: Campaign = {
  id: 'shooter',
  missions: MISSIONS,
  chapters: CHAPTERS,
  store: useShooter,
  xp: 30,
  hud: 'fps',
  offlineFirst: 's01',
  free: {
    title: { en: 'Free play: Operation "Dusty Yard"', ru: 'Свободная игра: операция «Пыльный двор»' },
    about: { en: 'The whole game is here: your team (blue) against 5 bots (red). Every script below is the real code of the game — change numbers, add your ideas, press Play. When you are out — watch the bots.', ru: 'Здесь вся игра целиком: твоя команда (синие) против 5 ботов (красные). Каждый скрипт ниже — настоящий код игры. Меняй числа, добавляй свои идеи, жми «Играть». Выбыл — наблюдай за ботами.' },
    scripts: FREE_PLAY_SCRIPTS,
    level: (s) => matchLevel('free', s),
    goal: { en: 'Take down all enemies', ru: 'Выведи из боя всех врагов' },
    check: (w) => w.redLeft() === 0,
    keys: ['WASD', 'mouse', 'LMB (hold)', 'R', 'Space', 'Shift', 'C', 'Q', 'E'],
  },
};

export const RACING: Campaign = {
  id: 'racing',
  missions: RACE_MISSIONS,
  chapters: RACE_CHAPTERS,
  store: useRacing,
  xp: 30,
  hud: 'race',
  free: {
    title: { en: 'Free drive: race the AI and your ghost', ru: 'Свободная езда: гонка с ИИ и своим призраком' },
    about: { en: 'Your finished car: laps and times, a ghost of your best lap, paint, dents and parts that fly off — against 3 AI cars. Every script is editable.', ru: 'Твоя готовая машина: круги и время, призрак лучшего круга, покраска, вмятины и отлетающие детали — против 3 машин ИИ. Любой скрипт можно менять.' },
    scripts: raceFreeScripts,
    level: (s) => raceFreeLevel(s),
    goal: { en: 'Drive a lap', ru: 'Проедь круг' },
    check: (w) => w.insts.some((i) => typeof i.self?.fields.get('laps')?.v === 'number' && (i.self.fields.get('laps')!.v as number) >= 1),
    keys: ['W', 'A/D', 'S'],
  },
};

export const MODELS: Campaign = {
  id: 'models',
  missions: MODEL_MISSIONS,
  chapters: MODEL_CHAPTERS,
  store: useModels,
  xp: 25,
  hud: 'fps',
  free: {
    title: { en: 'Free scene: dress a room', ru: 'Свободная сцена: одень комнату' },
    about: { en: 'A room with crates, pillars and a block. Open "Materials" under the game and give every kind of object a material from your texture studio — or change the scripts.', ru: 'Комната с ящиками, колоннами и блоком. Открой «Материалы» под игрой и дай каждому виду предметов материал из своей студии текстур — или меняй скрипты.' },
    scripts: modelFreeScripts,
    level: (s) => modelFreeLevel(s),
    goal: { en: 'Give materials to things', ru: 'Дай вещам материалы' },
    check: (w) => new Set(w.objects.filter((o) => o.material?.id).map((o) => o.name)).size >= 3,
    keys: ['WASD', 'mouse'],
  },
};
