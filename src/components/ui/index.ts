/**
 * UI primitives (design agent). Import from "@/components/ui".
 *
 * Layout:    Container, Section, SkipLink, VisuallyHidden
 * Actions:   Button, LinkButton, IconButton, buttonClassName
 * Display:   Chip, Icon, SegmentedTabs, MediaOverlayButton
 * Theme:     see "@/theme" (ThemeProvider, useTheme, ThemeToggle)
 *
 * Colour rules the primitives rely on (see src/styles/tokens.css):
 * - On the canvas use --color-accent-ink for accent-coloured text and --color-accent-border for
 *   accent borders; both are dark derivatives in light mode.
 * - --color-accent is a fill. Text on it is --color-on-accent. Put `data-on-accent` on any
 *   accent-filled band so text tokens and the focus ring switch to near-black inside it.
 * - On a near-black fill or a dark scrim, accent text uses the raw --color-accent in both themes.
 */
export { Button, LinkButton, buttonClassName, type ButtonProps, type LinkButtonProps, type ButtonVariant, type ButtonSize, type ButtonStyleProps } from './Button';
export { IconButton, type IconButtonProps } from './IconButton';
export { Chip, type ChipProps } from './Chip';
export { Container, type ContainerProps } from './Container';
export { Icon, ICON_NAMES, type IconProps, type IconName, type UiIconName } from './Icon';
export { MediaOverlayButton, type MediaOverlayButtonProps } from './MediaOverlayButton';
export { Section, type SectionProps } from './Section';
export { SegmentedTabs, type SegmentedTabsProps, type SegmentedTabItem, type SegmentedTabLinkProps } from './SegmentedTabs';
export { SkipLink, type SkipLinkProps } from './SkipLink';
export { VisuallyHidden, visuallyHiddenClass, type VisuallyHiddenProps } from './VisuallyHidden';
export { cx } from './cx';
export { useImageFailure, type ImageFailure } from './useImageFailure';
