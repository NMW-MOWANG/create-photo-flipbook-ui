// Shelf metadata. A book with `dir` opens the 3D reader in books/<dir>/;
// its `cover` (relative to that directory) is shown in the hover preview.
// Books without `dir` are empty placeholders that open book.html.
export const books = [
  {
    id: "death-valley",
    title: "Death Valley",
    dir: "death-valley",
    cover: "assets/pages/page-00-front-cover.png",
    pageCount: 14,
    paper: "#c9a27a",
    ink: "#2a1d14",
    height: 0.86,
  },
  {
    id: "lvyin",
    title: "绿荫",
    dir: "lvyin",
    cover: "assets/pages/cover-right.png",
    pageCount: 10,
    paper: "#1f2e24",
    ink: "#e9e4d4",
    height: 0.82,
  },
  {
    id: "kafeiguan",
    title: "咖啡馆",
    dir: "kafeiguan",
    cover: "assets/pages/cover-right.png",
    pageCount: 10,
    paper: "#d9c6a8",
    ink: "#5a3a28",
    height: 0.74,
  },
  {
    id: "jiejiao",
    title: "街角",
    dir: "jiejiao",
    cover: "assets/pages/cover-right.png",
    pageCount: 10,
    paper: "#8e959a",
    ink: "#1d1d1b",
    height: 0.9,
  },
];

export function bookUrl(id) {
  const book = books.find((item) => item.id === id);
  if (book?.dir) return `books/${encodeURIComponent(book.dir)}/index.html`;
  return `book.html?book=${encodeURIComponent(id)}`;
}

export function coverUrl(book) {
  return book.dir && book.cover ? `books/${book.dir}/${book.cover}` : null;
}

export function selectedBook(search) {
  const id = new URLSearchParams(search).get("book");
  return books.find((book) => book.id === id) ?? null;
}
