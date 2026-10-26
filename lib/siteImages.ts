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
  { key: "hero.rail.menu", section: "hero", label: "Explore card — Menu", src: "/assets/home-menu-superfood-bowl.webp", alt: "Superfood bowl with a green smoothie base, granola, beetroot, mango, berries, broccoli and toasted almonds" },
  { key: "hero.rail.reservation", section: "hero", label: "Explore card — Reservation", src: "/assets/reservation-cover.webp", alt: "Intimate table reservation at PRESS'D Wellness Café" },
  { key: "hero.rail.about", section: "hero", label: "Explore card — Our café", src: "/assets/cafe-interior-cover.webp", alt: "PRESS'D Our café" },


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

  { key: "about.story.interior", section: "about", label: "About story photo", src: "/assets/about-cafe-interior-lounge.webp", alt: "Guests working and relaxing in the sunlit PRESS'D lounge beside the pool" },
  { key: "visit.sofa", section: "visit", label: "Visit gallery 1", src: "/assets/visit-table-latte.webp", alt: "Latte in a double-wall glass on a wooden tray beside the lounge sofa" },
  { key: "visit.dish", section: "visit", label: "Visit gallery 2", src: "/assets/visit-pet-friendly-booth.webp", alt: "Guest stroking her dog on the black booth seating against the yellow slatted wall" },
  { key: "visit.counter", section: "visit", label: "Visit gallery 3", src: "/assets/visit-laptop-lounge.webp", alt: "Guest working on a laptop on the lounge sofa in warm evening light" },
  { key: "visit.pour", section: "visit", label: "Visit gallery 4", src: "/assets/visit-coffee-serving.webp", alt: "Filter coffee being poured from a glass server into a glass cup" },

  { key: "chrome.navbar.logo", section: "chrome", label: "Header logo", src: "/assets/pressd-logo.webp", alt: "PRESS'D Wellness Café" },
  { key: "chrome.footer.logo", section: "chrome", label: "Footer logo", src: "/assets/pressd-footer-logo.png?v=2", alt: "PRESS'D Wellness Café" },
  { key: "chrome.loader.logo", section: "chrome", label: "Loading-screen logo (decorative)", src: "/assets/pressd-logo.webp", alt: "" },
  { key: "chrome.dock.whatsapp", section: "chrome", label: "Mobile dock WhatsApp icon (decorative)", src: "/assets/whatsapp-transparent.webp", alt: "" },
];

export const SITE_IMAGE_BY_KEY = new Map(SITE_IMAGES.map((i) => [i.key, i]));
