// Sample volume: the Death Valley pages from the upstream 3d-book-2 template.
// Files resolve relative to assets/pages/. pageWidth/pageHeight are leaf pixels.
window.PHOTOBOOK = {
  id: "death-valley",
  title: "Death Valley",
  pageWidth: 768,
  pageHeight: 1024,
  frontCover: { file: "page-00-front-cover.png", alt: "Front cover of the Death Valley photobook." },
  spreads: [
    { id: "first-light",
      left: { file: "page-01-first-light-left.png", alt: "First light, left page." },
      right: { file: "page-02-first-light-right.png", alt: "First light, right page." } },
    { id: "at-the-edge",
      left: { file: "page-03-at-the-edge-left.png", alt: "At the edge, left page." },
      right: { file: "page-04-at-the-edge-right.png", alt: "At the edge, right page." } },
    { id: "salt-distance",
      left: { file: "page-05-salt-distance-left.png", alt: "Salt distance, left page." },
      right: { file: "page-06-salt-distance-right.png", alt: "Salt distance, right page." } },
    { id: "afterglow",
      left: { file: "page-07-afterglow-left.png", alt: "Afterglow, left page." },
      right: { file: "page-08-afterglow-right.png", alt: "Afterglow, right page." } },
    { id: "small-figures",
      left: { file: "page-09-small-figures-left.png", alt: "Small figures, left page." },
      right: { file: "page-10-small-figures-right.png", alt: "Small figures, right page." } },
    { id: "looking-back",
      left: { file: "page-11-looking-back-left.png", alt: "Looking back, left page." },
      right: { file: "page-12-looking-back-right.png", alt: "Looking back, right page." } }
  ],
  backCover: { file: "page-13-back-cover.png", alt: "Back cover of the Death Valley photobook." }
};
