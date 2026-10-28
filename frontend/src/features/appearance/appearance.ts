export const appearanceDefaults = {
  accent: 'blue', glass: 'standard', blur: 'on', sidebarStyle: 'floating', sidebarState: 'expanded',
  density: 'comfortable', radius: 'soft', fontSize: 'standard', motion: 'normal', bookView: 'grid',
  widgets: ['overview', 'circulation', 'inventory', 'acquisition'],
} as const;

export type Appearance = {
  accent: 'blue' | 'teal' | 'sky' | 'emerald' | 'sand';
  glass: 'subtle' | 'standard' | 'strong'; blur: 'on' | 'off';
  sidebarStyle: 'floating' | 'classic'; sidebarState: 'expanded' | 'collapsed';
  density: 'comfortable' | 'compact'; radius: 'medium' | 'soft' | 'large';
  fontSize: 'standard' | 'large'; motion: 'normal' | 'reduced' | 'off';
  bookView: 'grid' | 'list'; widgets: string[];
};
export const defaults: Appearance = { ...appearanceDefaults, widgets: [...appearanceDefaults.widgets] };
const choices: { [K in Exclude<keyof Appearance, 'widgets'>]: readonly Appearance[K][] } = {
  accent: ['blue', 'teal', 'sky', 'emerald', 'sand'], glass: ['subtle', 'standard', 'strong'],
  blur: ['on', 'off'], sidebarStyle: ['floating', 'classic'], sidebarState: ['expanded', 'collapsed'],
  density: ['comfortable', 'compact'], radius: ['medium', 'soft', 'large'],
  fontSize: ['standard', 'large'], motion: ['normal', 'reduced', 'off'], bookView: ['grid', 'list'],
};
const allowedWidgets = new Set(defaults.widgets);

export function parseAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return { ...defaults, widgets: [...defaults.widgets] };
  const input = value as Record<string, unknown>;
  const result = { ...defaults, widgets: [...defaults.widgets] };
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    const candidate = input[key];
    if (typeof candidate === 'string' && (choices[key] as readonly string[]).includes(candidate)) {
      // Every value is checked against its key-specific allowlist before use in DOM attributes.
      (result as unknown as Record<string, unknown>)[key] = candidate;
    }
  }
  if (Array.isArray(input.widgets) && input.widgets.every(item => typeof item === 'string' && allowedWidgets.has(item))
      && new Set(input.widgets).size === input.widgets.length) result.widgets = input.widgets;
  return result;
}

export const GUEST_KEY = 'lams-appearance-v1';
export function guestAppearance(): Appearance {
  try { return parseAppearance(JSON.parse(localStorage.getItem(GUEST_KEY) ?? '{}')); }
  catch { return parseAppearance(null); }
}
