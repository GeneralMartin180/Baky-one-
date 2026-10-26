import { SVGProps } from 'react';

/**
 * Official YouTube Icon & Badge component with exact proportions and colors:
 * - Brand red rectangle with rounded corners (#FF0000)
 * - Official white play triangle centered inside
 */
export function YouTubeIcon({
  className = 'w-5 h-3.5',
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 28 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="YouTube"
      {...props}
    >
      <rect width="28" height="20" rx="5" fill="#FF0000" />
      <polygon points="11,5.5 19,10 11,14.5" fill="#FFFFFF" />
    </svg>
  );
}

/**
 * Full YouTube Official Logo with Wordmark (Red button + "YouTube" text)
 */
export function YouTubeFullLogo({
  className = 'h-5',
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 90 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="YouTube"
      {...props}
    >
      {/* Red Play Pill */}
      <rect width="28" height="20" rx="5" fill="#FF0000" />
      <polygon points="11,5.5 19,10 11,14.5" fill="#FFFFFF" />

      {/* YouTube Wordmark */}
      <text
        x="33"
        y="15"
        fill="currentColor"
        fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontWeight="700"
        fontSize="14"
        letterSpacing="-0.5px"
      >
        YouTube
      </text>
    </svg>
  );
}

/**
 * Official YouTube Shorts Red S-Logo Icon
 */
export function YouTubeShortsIcon({
  className = 'w-4 h-5',
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="YouTube Shorts"
      {...props}
    >
      <path
        d="M17.77 10.32L16.48 9.58C17.47 8.93 18.13 7.82 18.13 6.55C18.13 4.41 16.39 2.67 14.25 2.67C13.29 2.67 12.41 3.02 11.73 3.6L6.23 6.84C5.24 7.49 4.58 8.6 4.58 9.87C4.58 12.01 6.32 13.75 8.46 13.75C9.42 13.75 10.3 13.4 10.98 12.82L12.27 13.56C11.28 14.21 10.62 15.32 10.62 16.59C10.62 18.73 12.36 20.47 14.5 20.47C15.46 20.47 16.34 20.12 17.02 19.54L22.52 16.3C23.51 15.65 24.17 14.54 24.17 13.27C24.17 11.13 22.43 9.39 20.29 9.39C19.33 9.39 18.45 9.74 17.77 10.32Z"
        fill="#FF0000"
      />
      <polygon points="10,8.5 15,11.5 10,14.5" fill="#FFFFFF" />
    </svg>
  );
}

