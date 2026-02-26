// Simplified hook — app uses a single (light) theme only
import { LightColors } from '@/constants/theme';

type ColorName = keyof typeof LightColors;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: ColorName,
): string {
  return props.light ?? (LightColors[colorName] as string);
}
