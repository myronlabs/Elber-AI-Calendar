/**
 * URL Helper Utilities
 * Provides type-safe URL parsing and formatting
 */

export interface ParsedURL {
  href: string;
  protocol: string;
  hostname: string;
  pathname: string;
  search: string;
  hash: string;
}

export interface MeetingPlatform {
  name: string;
  displayName: string;
  pattern: RegExp;
  icon?: string;
}

// Define supported meeting platforms
const MEETING_PLATFORMS: MeetingPlatform[] = [
  {
    name: 'zoom',
    displayName: 'Join Zoom Meeting',
    pattern: /zoom\.us/i,
    icon: '🎥'
  },
  {
    name: 'google-meet',
    displayName: 'Join Google Meet',
    pattern: /meet\.google\.com/i,
    icon: '📹'
  },
  {
    name: 'teams',
    displayName: 'Join Teams Meeting',
    pattern: /teams\.microsoft\.com/i,
    icon: '👥'
  },
  {
    name: 'webex',
    displayName: 'Join Webex Meeting',
    pattern: /webex\.com/i,
    icon: '🌐'
  },
  {
    name: 'gotomeeting',
    displayName: 'Join GoToMeeting',
    pattern: /gotomeeting\.com/i,
    icon: '💼'
  },
  {
    name: 'skype',
    displayName: 'Join Skype Call',
    pattern: /skype\.com|join\.skype\.com/i,
    icon: '📞'
  },
  {
    name: 'discord',
    displayName: 'Join Discord',
    pattern: /discord\.gg|discord\.com\/invite/i,
    icon: '🎮'
  },
  {
    name: 'slack',
    displayName: 'Open in Slack',
    pattern: /slack\.com\/archives|app\.slack\.com/i,
    icon: '💬'
  }
];

/**
 * Check if a string is a valid URL
 */
export function isValidURL(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Parse a URL safely
 */
export function parseURL(urlString: string): ParsedURL | null {
  try {
    const url = new URL(urlString);
    return {
      href: url.href,
      protocol: url.protocol,
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash
    };
  } catch {
    return null;
  }
}

/**
 * Get meeting platform info from URL
 */
export function getMeetingPlatform(url: string): MeetingPlatform | null {
  for (const platform of MEETING_PLATFORMS) {
    if (platform.pattern.test(url)) {
      return platform;
    }
  }
  return null;
}

/**
 * Get display text for a URL
 */
export function getURLDisplayText(url: string): string {
  const platform = getMeetingPlatform(url);
  if (platform) {
    return platform.displayName;
  }
  
  const parsed = parseURL(url);
  if (parsed) {
    // For non-meeting URLs, show a cleaner version
    return parsed.hostname.replace(/^www\./, '');
  }
  
  return 'Open Link';
}

/**
 * Extract all URLs from text
 */
export function extractURLs(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const matches = text.match(urlRegex);
  return matches || [];
}

/**
 * Replace URLs in text with a transformer function
 */
export function transformURLsInText<T>(
  text: string,
  transformer: (url: string, index: number) => T
): Array<string | T> {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const parts = text.split(urlRegex);
  const result: Array<string | T> = [];
  
  let urlIndex = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 0) {
      // Non-URL text
      if (part) {
        result.push(part);
      }
    } else {
      // URL
      result.push(transformer(part, urlIndex++));
    }
  }
  
  return result;
}

/**
 * Sanitize URL for safe usage
 */
export function sanitizeURL(url: string): string {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}