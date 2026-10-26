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

const EMAIL = "pressd.dxb@gmail.com";
const PHONE = "+971556838426";
// Opens the visitor's email app with a new message to the café, subject filled in.
const MAILTO = `mailto:${EMAIL}?subject=${encodeURIComponent("Enquiry for PRESS’D Wellness Café")}`;
const WHATSAPP = "https://wa.me/971556838426?text=Hello%20PRESS%27D!";

const SOCIAL = [
  { name: "Instagram", href: "https://www.instagram.com/pressd.cafe", Icon: InstagramIcon },
  { name: "TikTok", href: "https://www.tiktok.com/@pressd.cafe", Icon: TikTokIcon },
  { name: "Facebook", href: "https://www.facebook.com/profile.php?id=61594102325840", Icon: FacebookIcon },
  { name: "Threads", href: "https://www.threads.com/@pressd.cafe", Icon: ThreadsIcon },
];

export default function Footer() {
  const alt = useAlt();
  const handleLink = useSectionLinkHandler();
  // The footer is only shown on the Menu, on the gold background, so it uses
  // the gold-background logo.
  return (
    <footer>
      <div className="footer-top">
        <div className="footer-brand">
          <img className="footer-logo" src="/assets/pressd-footer-logo.png?v=2" alt={alt("chrome.footer.logo")} />
          <p className="footer-statement">Coffee. Food. People.</p>
        </div>
        <div className="footer-links">
          <a href="#menu" onClick={handleLink("#menu")}>
            Menu
          </a>
          <a href="#about" onClick={handleLink("#about")}>
            About
          </a>
          <a href="#visit" onClick={handleLink("#visit")}>
            Visit
          </a>
        </div>
        <div className="footer-contact" aria-label="Contact PRESS’D">
          <a href={MAILTO}>
            <MailIcon />
            <span>{EMAIL}</span>
          </a>
          <a href={`tel:${PHONE}`}>
            <PhoneIcon />
            <span>+971 55 68 38 426</span>
          </a>
          <a href={WHATSAPP} target="_blank" rel="noopener noreferrer">
            <ChatIcon />
            <span>WhatsApp</span>
          </a>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 PRESS’D WELLNESS CAFÉ</span>
        <nav className="footer-social" aria-label="PRESS’D on social media">
          {SOCIAL.map(({ name, href, Icon }) => (
            <a key={name} href={href} target="_blank" rel="noopener noreferrer" aria-label={`PRESS’D on ${name}`} title={name}>
              <Icon />
            </a>
          ))}
        </nav>
        <span>MEYDAN POLO RESIDENCE, DUBAI</span>
      </div>
    </footer>
  );
}
