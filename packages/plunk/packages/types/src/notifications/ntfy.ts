/**
 * Notification types for ntfy.sh integration
 */

/**
 * Priority levels for ntfy notifications
 * Based on ntfy.sh documentation
 */
export enum NtfyPriority {
  MIN = 1, // No vibration/sound, relegated to "Other notifications"
  LOW = 2, // No vibration/sound, hidden until drawer opened
  DEFAULT = 3, // Short vibration and sound (standard)
  HIGH = 4, // Long vibration, pop-over notification
  MAX = 5, // Long vibration bursts, pop-over notification
}

/**
 * Tags for ntfy notifications (emoji shortcuts)
 */
export enum NtfyTag {
  WARNING = 'warning',
  ERROR = 'rotating_light',
  SUCCESS = 'white_check_mark',
  MONEY = 'money_with_wings',
  SHIELD = 'shield',
  ROCKET = 'rocket',
  BELL = 'bell',
  CHART = 'chart_with_upwards_trend',
  SKULL = 'skull',
  INFO = 'information_source',
}

/**
 * Notification payload for ntfy
 */
export interface NtfyNotification {
  title: string;
  message: string;
  priority?: NtfyPriority;
  tags?: NtfyTag[];
}
