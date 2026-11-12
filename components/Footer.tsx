"use client";

import { useAlt } from "@/components/AltTextContext";
import { useSectionLinkHandler } from "@/components/navigation/SectionNavContext";
import {
  ChatIcon,
  FacebookIcon,
  InstagramIcon,
  MailIcon,
  PhoneIcon,
  ThreadsIcon,
  TikTokIcon,
} from "@/components/icons";
import { useBusiness, usePage } from "@/components/SiteContentContext";
import { FOOTER } from "@/lib/content/pages";
import { phoneDigits, whatsappLink } from "@/lib/content/hours";

const SOCIAL = [
  { name: "Instagram", field: "instagram", Icon: InstagramIcon },
  { name: "TikTok", field: "tiktok", Icon: TikTokIcon },
  { name: "Facebook", field: "facebook", Icon: FacebookIcon },
  { name: "Threads", field: "threads", Icon: ThreadsIcon },
] as const;

export default function Footer() {
  const alt = useAlt();
  const handleLink = useSectionLinkHandler();
  const { t } = usePage(FOOTER);
  const business = useBusiness();
  // Opens the visitor's email app with a new message to the café, subject filled in.
  const MAILTO = `mailto:${business.email}?subject=${encodeURIComponent(t("emailSubject"))}`;
  // The footer is only shown on the Menu, on the gold background, so it uses
  // the gold-background logo.
  return (
    <footer>
      <div className="footer-top">
        <div className="footer-brand">
          <img className="footer-logo" src="/assets/pressd-footer-logo.png?v=2" alt={alt("chrome.footer.logo")} />
          <p className="footer-statement">{t("statement")}</p>
        </div>
        <div className="footer-links">
          <a href="#menu" onClick={handleLink("#menu")}>
            {t("linkMenu")}
          </a>
          <a href="#about" onClick={handleLink("#about")}>
            {t("linkAbout")}
          </a>
          <a href="#visit" onClick={handleLink("#visit")}>
            {t("linkVisit")}
          </a>
        </div>
        <div className="footer-contact" aria-label="Contact PRESS’D">
          <a href={MAILTO}>
            <MailIcon />
            <span>{business.email}</span>
          </a>
          <a href={`tel:+${phoneDigits(business.telephone)}`}>
            <PhoneIcon />
            <span>{business.telephone}</span>
          </a>
          <a href={whatsappLink(business.whatsapp, t("whatsappMessage"))} target="_blank" rel="noopener noreferrer">
            <ChatIcon />
            <span>{t("whatsappLabel")}</span>
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{t("copyright")}</span>
        <nav className="footer-social" aria-label="PRESS’D on social media">
          {SOCIAL.filter(({ field }) => business[field]).map(({ name, field, Icon }) => (
            <a key={name} href={business[field]} target="_blank" rel="noopener noreferrer" aria-label={`PRESS’D on ${name}`} title={name}>
              <Icon />
            </a>
          ))}
        </nav>
        <span>{t("location")}</span>
      </div>
    </footer>
  );
}
