import type { GenreKey } from '@renderer/lib/tmdb-queries'

/** The genre rows under the home page's curated ones, in order. Both homes share them. */
export const GENRE_ROWS: { key: GenreKey; title: string }[] = [
  { key: 'scifi', title: 'Sci-Fi' },
  { key: 'horror', title: 'Horror' },
  { key: 'comedy', title: 'Comedy' },
  { key: 'animation', title: 'Animation' },
  { key: 'drama', title: 'Drama' },
  { key: 'action', title: 'Action' },
  { key: 'thriller', title: 'Thriller' },
  { key: 'romance', title: 'Romance' },
  { key: 'fantasy', title: 'Fantasy' },
  { key: 'crime', title: 'Crime' },
  { key: 'mystery', title: 'Mystery' },
  { key: 'adventure', title: 'Adventure' },
  { key: 'family', title: 'Family' }
]
