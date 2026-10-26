// Every editable image on the public site, with its default alt text (exactly
// what the components rendered before alt text became editable). Components
// read alt text through useAlt(key); SEO Studio's "Images & Alt Text" edits it.
// Menu item photos are not listed: their alt text is the product name.

export interface SiteImage {
  key: string;
  section: SectionId;
  label: string;
  src: string;
  alt: string; // default; "" = decorative
}

export const SITE_SECTIONS = [
  { id: "hero", label: "Top section", anchor: "#home" },
  { id: "about", label: "About", anchor: "#about" },
  { id: "signature", label: "Signature", anchor: "#home" },
  { id: "work", label: "Work from PRESS'D", anchor: "#work" },
  { id: "wellness", label: "Wellness picks", anchor: "#wellness" },
  { id: "gallery", label: "Gallery", anchor: "#home" },
  { id: "instagram", label: "Instagram strip", anchor: "#home" },
  { id: "visit", label: "Visit", anchor: "#visit" },
  { id: "chrome", label: "Header, footer & icons", anchor: "#home" },
] as const;
export type SectionId = (typeof SITE_SECTIONS)[number]["id"];

export const SITE_IMAGES: SiteImage[] = [
  { key: "hero.rail.menu", section: "hero", label: "Explore card — Menu", src: "/assets/home-menu-green-dream-bowl.webp", alt: "Green Dream Bowl with granola, beetroot, berries and toasted almonds" },
  { key: "hero.rail.reservation", section: "hero", label: "Explore card — Reservation", src: "/assets/reservation-cover.webp", alt: "Intimate table reservation at PRESS'D Wellness Café" },
  { key: "hero.rail.about", section: "hero", label: "Explore card — Our café", src: "/assets/cafe-interior-cover.webp", alt: "PRESS'D Our café" },

  { key: "about.top.space", section: "about", label: "Top carousel — The space", src: "/assets/visit-main-interior.webp", alt: "Sunlit interior at PRESS'D Wellness Café with palm trees and modern lounge seating" },
  { key: "about.top.espresso", section: "about", label: "Top carousel — Espresso bar", src: "/assets/visit-service-counter.webp", alt: "Barista preparing specialty brew at the espresso bar" },
  { key: "about.top.lounge", section: "about", label: "Top carousel — Lounge retreat", src: "/assets/visit-lifestyle-sofa.webp", alt: "Guest enjoying iced matcha and dessert on lounge sofa" },
  { key: "about.top.sanctuary", section: "about", label: "Top carousel — Sanctuary", src: "/assets/cafe-interior-cover.webp", alt: "Atmospheric interior architecture and warm lighting" },
  { key: "about.top.pour", section: "about", label: "Top carousel — Pour & craft", src: "/assets/visit-coffee-detail.webp", alt: "Signature latte art served on handcrafted wood tray" },
  { key: "about.story.community", section: "about", label: "Story carousel — Community", src: "/assets/about-community-laptop.webp", alt: "Guest working on a laptop in the PRESS'D lounge" },
  { key: "about.story.pets", section: "about", label: "Story carousel — Pet friendly", src: "/assets/about-pet-friendly-guest.webp", alt: "Guest stroking her dog on a black banquette with yellow cushions" },
  { key: "about.story.roasts", section: "about", label: "Story carousel — Roasts", src: "/assets/our-cafe-cover.webp", alt: "Artisanal flat white coffee on a dark table" },
  { key: "about.story.rituals", section: "about", label: "Story carousel — Rituals", src: "/assets/visit-guest-reading.webp", alt: "Guest reading in the peaceful sunlit atmosphere" },
  { key: "about.story.nourishment", section: "about", label: "Story carousel — Nourishment", src: "/assets/power-bowl.webp", alt: "Nutrient-dense wholesome wellness bowl" },

  { key: "signature.toast", section: "signature", label: "Signature dish", src: "/assets/avocado-toast.webp", alt: "PRESS'D signature avocado toast" },
  { key: "work.ambience", section: "work", label: "Work ambience", src: "/assets/work-ambience-cafe.webp", alt: "A guest working with coffee and natural light at PRESS'D" },

  { key: "wellness.bowl", section: "wellness", label: "Card 1 — Power Protein Bowl", src: "/assets/power-bowl.webp", alt: "Power Protein Bowl" },
  { key: "wellness.avocado", section: "wellness", label: "Card 2 — Avocado Breakfast", src: "/assets/avocado-toast.webp", alt: "Avocado Breakfast" },
  { key: "wellness.smoothie", section: "wellness", label: "Card 3 — Green Energy", src: "/assets/smoothies.webp", alt: "Green Energy smoothie" },

  { key: "gallery.coffee", section: "gallery", label: "Gallery photo 1", src: "/assets/coffee-matcha.webp", alt: "Coffee and matcha" },
  { key: "gallery.bowl", section: "gallery", label: "Gallery photo 2", src: "/assets/power-bowl.webp", alt: "Colourful bowl" },
  { key: "gallery.smoothies", section: "gallery", label: "Gallery photo 3", src: "/assets/smoothies.webp", alt: "Fresh smoothies" },
  { key: "gallery.toast", section: "gallery", label: "Gallery photo 4", src: "/assets/avocado-toast.webp", alt: "Avocado toast" },

  { key: "instagram.coffee", section: "instagram", label: "Instagram photo 1", src: "/assets/coffee-matcha.webp", alt: "PRESS'D coffee" },
  { key: "instagram.pets", section: "instagram", label: "Instagram photo 2", src: "/assets/pet-friendly-cafe.webp", alt: "Pet-friendly café life" },
  { key: "instagram.bowl", section: "instagram", label: "Instagram photo 3", src: "/assets/power-bowl.webp", alt: "PRESS'D power bowl" },
  { key: "instagram.work", section: "instagram", label: "Instagram photo 4", src: "/assets/work-ambience-cafe.webp", alt: "Working from PRESS'D" },
  { key: "instagram.smoothies", section: "instagram", label: "Instagram photo 5", src: "/assets/smoothies.webp", alt: "Fresh smoothies" },
  { key: "instagram.toast", section: "instagram", label: "Instagram photo 6", src: "/assets/avocado-toast.webp", alt: "Avocado breakfast" },

  { key: "visit.sofa", section: "visit", label: "Visit gallery 1", src: "/assets/visit-lifestyle-sofa.webp", alt: "Guest relaxing on lounge sofa inside PRESS'D café" },
  { key: "visit.dish", section: "visit", label: "Visit gallery 2", src: "/assets/sandwich-halloumi-pesto.webp", alt: "Freshly prepared wholesome dish at PRESS'D" },
  { key: "visit.counter", section: "visit", label: "Visit gallery 3", src: "/assets/visit-service-counter.webp", alt: "Barista preparing specialty coffee at the espresso counter" },
  { key: "visit.pour", section: "visit", label: "Visit gallery 4", src: "/assets/visit-coffee-detail.webp", alt: "Craft coffee pour with signature latte art on handcrafted wood tray" },

  { key: "chrome.navbar.logo", section: "chrome", label: "Header logo", src: "/assets/pressd-logo.webp", alt: "PRESS'D Wellness Café" },
  { key: "chrome.footer.logo", section: "chrome", label: "Footer logo", src: "/assets/pressd-logo.webp", alt: "PRESS'D Wellness Café" },
  { key: "chrome.loader.logo", section: "chrome", label: "Loading-screen logo (decorative)", src: "/assets/pressd-logo.webp", alt: "" },
  { key: "chrome.dock.whatsapp", section: "chrome", label: "Mobile dock WhatsApp icon (decorative)", src: "/assets/whatsapp-transparent.webp", alt: "" },
];

export const SITE_IMAGE_BY_KEY = new Map(SITE_IMAGES.map((i) => [i.key, i]));
