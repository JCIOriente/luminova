import { useSiteConfig } from "../site-config/use-site-config";
import { safeHref } from "../site-config/safe-href";
import { SOCIAL_LINKS } from "../config/social-links";

export function SocialIconLinks({ style }: { style?: React.CSSProperties }) {
  const config = useSiteConfig();
  return (
    <>
      {SOCIAL_LINKS.map(({ key, label, Glyph }) => {
        const href = safeHref(config.contact.socials[key]);
        if (href === "#") return null;
        return (
          <a
            key={key}
            href={href}
            aria-label={label}
            target="_blank"
            rel="noopener noreferrer"
            style={style}
          >
            <Glyph />
          </a>
        );
      })}
    </>
  );
}
