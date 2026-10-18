import {
  Crosshair, Eye, Fingerprint, HeartPulse, Radio, Shield, Skull, Users,
} from 'lucide-react';

export type RoleName =
  | 'Mafia'
  | 'Doctor'
  | 'Detective'
  | 'Good Informant'
  | 'Bad Informant'
  | 'Old Lady with Shotgun'
  | 'Citizen';

export type Role = {
  name: RoleName;
  description: string;
  team: 'town' | 'mafia' | 'wildcard';
  icon: typeof Shield;
};

export type Player = {
  id: number;
  name: string;
  initials: string;
  color: string;
  host?: boolean;
  ready?: boolean;
  status?: string;
};

export const roles: Role[] = [
  { name: 'Mafia', description: 'Шөнө нэг зорилт сонгоод өдрийн цагаар хоорондоо нууцаар ажиллах.', team: 'mafia', icon: Skull },
  { name: 'Doctor', description: 'Шөнө нэг тоглогчийг хамгаалж, халдлагаас аварч чадна.', team: 'town', icon: HeartPulse },
  { name: 'Detective', description: 'Шөнө нэг тоглогчийн нууцыг шалгаж чадна.', team: 'town', icon: Eye },
  { name: 'Good Informant', description: 'Чимээгүй хамтрагч бөгөөд үнэ цэнэтэй сэжүүр өгдөг.', team: 'town', icon: Fingerprint },
  { name: 'Bad Informant', description: 'Хотод итгэлийг төрүүлэхийн тулд буруу замаар удирдан чиглүүлнэ.', team: 'mafia', icon: Radio },
  { name: 'Old Lady with Shotgun', description: 'Харж бай. Таныг зорьсон хэн бүхэн буугаараа цохих магадлалтай.', team: 'town', icon: Crosshair },
  { name: 'Citizen', description: 'Байр сууриа судалж, хэлэлцүүлэгт оролцож, мафийг саналаар зайлуулах.', team: 'town', icon: Users },
];